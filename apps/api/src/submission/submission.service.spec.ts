import { DataSource, Repository } from 'typeorm';
import { Queue } from 'bullmq';
import { SubmissionService } from './submission.service';
import { ArchiveCheckJob } from './archive-check/archive-check.types';
import { SubmissionEntity } from './entities/submission.entity';
import { ExamSessionService } from '../exam-session/exam-session.service';
import { ExamSessionEntity, ExamSessionStatus } from '../exam-session/entities/exam-session.entity';
import { StorageService } from '../storage/storage.service';
import { AgentSocketIdentity } from '../common/exam-live-socket';
import { SUBMISSION_GRACE_PERIOD_MS } from './submission.types';

/**
 * The refusals are what this file is for. Every one of them is the only
 * thing standing between an unauthenticated agent socket and a `collected`
 * row it did not earn, and none of them is exercised by the happy path.
 *
 * The write itself (received -> validated -> collected against the real
 * trigger) is deliberately NOT mocked out and asserted here — a mock would
 * only prove the mock agrees with itself. It is covered end to end by the
 * manual verification against Postgres + MinIO recorded in the Task 5
 * commit.
 */

const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const DELIVERABLE_ID = '22222222-2222-4222-8222-222222222222';
const MSSV = 'SV20120001';
const EXPECTED_KEY = `submissions/${SESSION_ID}/${MSSV}/${DELIVERABLE_ID}`;

const HOME_CLASS_ID = '44444444-4444-4444-8444-444444444444';
const HOME_TEACHER_ID = '55555555-5555-4555-8555-555555555555';

const identity: AgentSocketIdentity = {
  examSessionId: SESSION_ID,
  studentId: MSSV,
  fullName: 'Nguyen Van A',
  homeClassId: HOME_CLASS_ID,
  homeTeacherId: HOME_TEACHER_ID,
  machineName: null,
};

const confirmDto = {
  examSessionId: SESSION_ID,
  studentId: MSSV,
  requiredDeliverableId: DELIVERABLE_ID,
  storageKey: EXPECTED_KEY,
  checksum: 'a'.repeat(64),
  fileSize: 128,
};

const requestDto = {
  examSessionId: SESSION_ID,
  studentId: MSSV,
  requiredDeliverableId: DELIVERABLE_ID,
};

function session(overrides: Partial<ExamSessionEntity> = {}): ExamSessionEntity {
  const now = Date.now();
  return {
    id: SESSION_ID,
    status: 'active' as ExamSessionStatus,
    startTime: new Date(now - 60_000),
    endTime: new Date(now + 60_000),
    roomName: 'Phòng test',
    ...overrides,
  } as ExamSessionEntity;
}

function createHarness(
  overrides: {
    session?: ExamSessionEntity | null;
    deliverable?: object | null;
    objectExists?: jest.Mock;
    submissions?: Array<Partial<SubmissionEntity>>;
    deliverables?: Array<{ id: string; requiredFilename: string }>;
  } = {},
) {
  const examSessions = {
    findById: jest.fn().mockResolvedValue(
      overrides.session === undefined ? session() : overrides.session,
    ),
    findDeliverable: jest.fn().mockResolvedValue(
      overrides.deliverable === undefined ? { id: DELIVERABLE_ID } : overrides.deliverable,
    ),
    listRequiredDeliverables: jest.fn().mockResolvedValue(
      overrides.deliverables ?? [{ id: DELIVERABLE_ID, requiredFilename: 'Cau1.docx' }],
    ),
  };
  const storage = {
    buildSubmissionKey: jest.fn(() => EXPECTED_KEY),
    generateUploadUrl: jest
      .fn()
      .mockResolvedValue({ uploadUrl: 'http://storage/signed', expiresIn: 900 }),
    generateDownloadUrl: jest.fn().mockResolvedValue({ downloadUrl: 'http://storage/view' }),
    objectExists: overrides.objectExists ?? jest.fn().mockResolvedValue(true),
  };
  // `listForSession` dùng QueryBuilder chứ không `find()`, vì nó cần
  // `NULLS LAST` tường minh VÀ một LEFT JOIN sang `class` để lấy tên lớp
  // gốc (nhãn thi bù). Mock giữ cả hai: `find` cho những đường còn dùng
  // nó, builder cho đường danh sách.
  const listBuilder: Record<string, jest.Mock> = {};
  listBuilder.where = jest.fn(() => listBuilder);
  listBuilder.orderBy = jest.fn(() => listBuilder);
  listBuilder.leftJoin = jest.fn(() => listBuilder);
  listBuilder.addSelect = jest.fn(() => listBuilder);
  // Hàng RAW đi song song với entities, đúng như `getRawAndEntities` trả:
  // mock rỗng sẽ để nhánh `?? null` nuốt mọi lỗi ánh xạ, và một lần đổi tên
  // cột về sau vẫn xanh.
  listBuilder.getRawAndEntities = jest.fn().mockResolvedValue({
    entities: overrides.submissions ?? [],
    raw: (overrides.submissions ?? []).map(() => ({ homeClassName: 'N01' })),
  });
  const submissions = {
    find: jest.fn().mockResolvedValue(overrides.submissions ?? []),
    createQueryBuilder: jest.fn(() => listBuilder),
  };
  const transaction = jest.fn();
  const archiveCheckQueue = { add: jest.fn().mockResolvedValue(undefined) };
  const service = new SubmissionService(
    { transaction } as unknown as DataSource,
    submissions as unknown as Repository<SubmissionEntity>,
    examSessions as unknown as ExamSessionService,
    storage as unknown as StorageService,
    archiveCheckQueue as unknown as Queue<ArchiveCheckJob>,
  );
  return { service, examSessions, storage, submissions, listBuilder, transaction, archiveCheckQueue };
}

describe('SubmissionService — preconditions', () => {
  it('refuses a deliverable that does not belong to this session', async () => {
    // findDeliverable is scoped by examSessionId, so a real deliverable id
    // borrowed from another session resolves to null here.
    const { service } = createHarness({ deliverable: null });

    const ack = await service.requestUploadUrl(identity, requestDto);

    expect(ack).toMatchObject({ ok: false, code: 'DELIVERABLE_NOT_FOUND' });
  });

  it.each<[string, Partial<ExamSessionEntity>]>([
    ['not started yet', { startTime: new Date(Date.now() + 60_000) }],
    ['cancelled', { status: 'cancelled' as ExamSessionStatus }],
    ['still a draft', { status: 'draft' as ExamSessionStatus }],
    [
      'past the grace period',
      { endTime: new Date(Date.now() - SUBMISSION_GRACE_PERIOD_MS - 60_000) },
    ],
  ])('refuses an upload URL for a session that is %s', async (_label, overrides) => {
    const { service, storage } = createHarness({ session: session(overrides) });

    const ack = await service.requestUploadUrl(identity, requestDto);

    expect(ack).toMatchObject({ ok: false, code: 'SESSION_NOT_FINALIZING' });
    expect(storage.generateUploadUrl).not.toHaveBeenCalled();
  });

  it('still issues an upload URL after the session was finalized', async () => {
    // The common case, not an edge case: nearly every upload arrives after
    // exam:finalize flipped the session to completed.
    const { service } = createHarness({
      session: session({ status: 'completed', endTime: new Date(Date.now() - 1_000) }),
    });

    const ack = await service.requestUploadUrl(identity, requestDto);

    expect(ack).toMatchObject({ ok: true, storageKey: EXPECTED_KEY, expiresIn: 900 });
  });

  it('writes nothing when handing out an upload URL', async () => {
    // A URL is not evidence of anything. Creating a row here would leave
    // one behind for every agent that asked and then crashed.
    const { service, transaction } = createHarness();

    await service.requestUploadUrl(identity, requestDto);

    expect(transaction).not.toHaveBeenCalled();
  });
});

describe('SubmissionService.confirmSubmission — refusals', () => {
  it('refuses a storage key the server did not issue for this triple', async () => {
    const { service, storage, transaction } = createHarness();

    const { ack, broadcast } = await service.confirmSubmission(identity, {
      ...confirmDto,
      storageKey: `submissions/${SESSION_ID}/SV99999999/${DELIVERABLE_ID}`,
    });

    // Without this, an agent could claim a classmate's uploaded object as
    // its own submission.
    expect(ack).toMatchObject({ ok: false, code: 'STORAGE_KEY_MISMATCH' });
    expect(broadcast).toBeNull();
    expect(storage.objectExists).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it('refuses a confirmation for an object that is not in storage', async () => {
    const { service, transaction } = createHarness({
      objectExists: jest.fn().mockResolvedValue(false),
    });

    const { ack, broadcast } = await service.confirmSubmission(identity, confirmDto);

    // "I uploaded it, trust me" is not something the server can accept.
    expect(ack).toMatchObject({ ok: false, code: 'OBJECT_NOT_FOUND' });
    expect(broadcast).toBeNull();
    expect(transaction).not.toHaveBeenCalled();
  });

  it('reports a storage outage as retryable rather than guessing', async () => {
    const { service, transaction } = createHarness({
      objectExists: jest.fn().mockRejectedValue(new Error('connection refused')),
    });

    const { ack, broadcast } = await service.confirmSubmission(identity, confirmDto);

    // Recording `collected` would claim a file nobody can see; recording
    // `invalid` would condemn a submission that is probably fine.
    expect(ack).toMatchObject({ ok: false, code: 'STORAGE_UNAVAILABLE' });
    expect(broadcast).toBeNull();
    expect(transaction).not.toHaveBeenCalled();
  });

  it('refuses before touching storage when the session stopped accepting uploads', async () => {
    const { service, storage } = createHarness({
      session: session({ status: 'cancelled' }),
    });

    const { ack } = await service.confirmSubmission(identity, confirmDto);

    expect(ack).toMatchObject({ ok: false, code: 'SESSION_NOT_FINALIZING' });
    expect(storage.objectExists).not.toHaveBeenCalled();
  });
});

describe('SubmissionService.confirmSubmission — success', () => {
  it('broadcasts the collected status for the joined identity, not the payload', async () => {
    const { service, transaction } = createHarness();
    const submittedAt = new Date('2026-08-29T04:00:00.000Z');
    transaction.mockImplementation(async () => ({ status: 'collected', submittedAt }));

    const { ack, broadcast } = await service.confirmSubmission(identity, confirmDto);

    expect(ack).toEqual({
      ok: true,
      status: 'collected',
      submittedAt: submittedAt.toISOString(),
    });
    expect(broadcast).toEqual({
      studentId: MSSV,
      requiredDeliverableId: DELIVERABLE_ID,
      status: 'collected',
      submittedAt: submittedAt.toISOString(),
    });
  });

  it('builds the storage key from the socket identity, never from the payload', async () => {
    const { service, storage, transaction } = createHarness();
    transaction.mockResolvedValue({ status: 'collected', submittedAt: new Date() });

    await service.confirmSubmission(identity, confirmDto);

    expect(storage.buildSubmissionKey).toHaveBeenCalledWith(
      identity.examSessionId,
      identity.studentId,
      DELIVERABLE_ID,
    );
  });
});

describe('SubmissionService.listForSession', () => {
  it('returns signed download URLs for stored submissions', async () => {
    const { service, storage, listBuilder } = createHarness({
      submissions: [
        {
          studentMssv: MSSV,
          studentNameInput: 'Nguyen Van A',
          requiredDeliverableId: DELIVERABLE_ID,
          status: 'collected',
          submittedAt: new Date('2026-08-29T04:00:00.000Z'),
          fileSize: '128',
          storageKey: EXPECTED_KEY,
          homeClassId: 'class-a',
          archiveCheckStatus: 'failed',
          archiveMissingEntries: ['Main.java'],
          archiveCheckError: null,
        },
      ],
    });

    const rows = await service.listForSession(SESSION_ID);

    // `NULLS LAST` tường minh là phần đáng ghim ở đây, không phải việc
    // dùng QueryBuilder: từ khi `submitted_at` được phép NULL, thứ tự
    // này quyết định dòng chưa nộp nằm đầu hay cuối danh sách, và mặc
    // định của Postgres LẬT theo chiều sắp.
    expect(listBuilder.orderBy).toHaveBeenCalledWith('sub.submittedAt', 'ASC', 'NULLS LAST');
    expect(listBuilder.where).toHaveBeenCalledWith('sub.examSessionId = :examSessionId', {
      examSessionId: SESSION_ID,
    });
    // QA-reported gap: the storage key alone has no extension for a
    // browser to name the downloaded file after — filename must be the
    // declared requiredFilename, not left out the way it used to be.
    expect(storage.generateDownloadUrl).toHaveBeenCalledWith(EXPECTED_KEY, {
      filename: 'Cau1.docx',
    });
    expect(rows).toEqual([
      {
        studentMssv: MSSV,
        studentNameInput: 'Nguyen Van A',
        requiredDeliverableId: DELIVERABLE_ID,
        status: 'collected',
        submittedAt: new Date('2026-08-29T04:00:00.000Z'),
        fileSize: '128',
        downloadUrl: 'http://storage/view',
        homeClassId: 'class-a',
        // Tên lớp gốc đến từ hàng RAW của phép JOIN, không từ entity. Khẳng
        // định nó ở đây là cách duy nhất bắt được một lần đổi tên cột alias
        // — nhánh `?? null` sẽ nuốt lỗi đó trong im lặng.
        homeClassName: 'N01',
        // Ba cột kiểm file nén (Task 10) đi thẳng qua, không suy diễn gì
        // thêm — trang "Màn bài nộp" đọc nguyên các cột này.
        archiveCheckStatus: 'failed',
        archiveMissingEntries: ['Main.java'],
        archiveCheckError: null,
      },
    ]);
  });

  it('still returns a download URL, with no filename hint, for a deliverable this session no longer declares', async () => {
    // A deliverable can outlive a submission row referencing it in theory
    // (the FK is what actually prevents this in the DB, but the service
    // layer must not crash if the lookup ever comes back short) — falling
    // back to no filename, not throwing, keeps the row usable.
    const { service, storage } = createHarness({
      deliverables: [],
      submissions: [
        {
          studentMssv: MSSV,
          studentNameInput: 'Nguyen Van A',
          requiredDeliverableId: DELIVERABLE_ID,
          status: 'collected',
          submittedAt: new Date('2026-08-29T04:00:00.000Z'),
          fileSize: '128',
          storageKey: EXPECTED_KEY,
          homeClassId: 'class-a',
        },
      ],
    });

    await service.listForSession(SESSION_ID);

    expect(storage.generateDownloadUrl).toHaveBeenCalledWith(EXPECTED_KEY, {
      filename: undefined,
    });
  });
});

/**
 * "Quản lý bài thu" — QA-reported gap: there was no way to see a
 * submission without first knowing which exam session it belonged to.
 * The query builder is mocked down to its chain here (matching
 * exam-session.service.spec.ts's own pattern for the same reason) — the
 * real cross-table query runs against Postgres in
 * submission-collection.e2e-spec.ts / a new e2e test, not here.
 */
describe('SubmissionService.listForTeacher', () => {
  const TEACHER_ID = '66666666-6666-4666-8666-666666666666';

  interface ListBuilderMock {
    innerJoinAndSelect: jest.Mock;
    where: jest.Mock;
    andWhere: jest.Mock;
    orderBy: jest.Mock;
    skip: jest.Mock;
    take: jest.Mock;
    getManyAndCount: jest.Mock;
  }

  function createTeacherHarness(rows: Array<Record<string, unknown>>, total: number) {
    const builder = {} as ListBuilderMock;
    builder.innerJoinAndSelect = jest.fn(() => builder);
    builder.where = jest.fn(() => builder);
    builder.andWhere = jest.fn(() => builder);
    builder.orderBy = jest.fn(() => builder);
    builder.skip = jest.fn(() => builder);
    builder.take = jest.fn(() => builder);
    builder.getManyAndCount = jest.fn().mockResolvedValue([rows, total]);

    const submissions = { createQueryBuilder: jest.fn(() => builder) };
    const storage = {
      generateDownloadUrl: jest.fn().mockResolvedValue({ downloadUrl: 'http://storage/view' }),
    };
    const service = new SubmissionService(
      {} as DataSource,
      submissions as unknown as Repository<SubmissionEntity>,
      {} as ExamSessionService,
      storage as unknown as StorageService,
      {} as Queue<ArchiveCheckJob>,
    );
    return { service, submissions, builder, storage };
  }

  function row(overrides: Record<string, unknown> = {}) {
    return {
      id: 'sub-1',
      examSessionId: SESSION_ID,
      examSession: { name: 'Giữa kỳ Lập trình Web' },
      requiredDeliverable: { requiredFilename: 'Cau1.docx' },
      studentMssv: MSSV,
      studentNameInput: 'Nguyen Van A',
      status: 'collected',
      submittedAt: new Date('2026-08-29T04:00:00.000Z'),
      fileSize: '128',
      storageKey: EXPECTED_KEY,
      ...overrides,
    };
  }

  it('scopes by exam_session.teacher_id and shapes the row with session name + filename', async () => {
    const { service, builder, storage } = createTeacherHarness([row()], 1);

    const result = await service.listForTeacher(TEACHER_ID, { page: 1, pageSize: 20 });

    expect(builder.where).toHaveBeenCalledWith('session.teacherId = :teacherId', {
      teacherId: TEACHER_ID,
    });
    expect(storage.generateDownloadUrl).toHaveBeenCalledWith(EXPECTED_KEY, {
      filename: 'Cau1.docx',
    });
    expect(result).toEqual({
      items: [
        {
          id: 'sub-1',
          examSessionId: SESSION_ID,
          examSessionName: 'Giữa kỳ Lập trình Web',
          requiredFilename: 'Cau1.docx',
          studentMssv: MSSV,
          studentNameInput: 'Nguyen Van A',
          status: 'collected',
          submittedAt: new Date('2026-08-29T04:00:00.000Z'),
          fileSize: '128',
          downloadUrl: 'http://storage/view',
        },
      ],
      total: 1,
    });
  });

  it('adds an examSessionId filter only when one is given', async () => {
    const { service, builder } = createTeacherHarness([row()], 1);

    await service.listForTeacher(TEACHER_ID, { page: 1, pageSize: 20, examSessionId: SESSION_ID });

    expect(builder.andWhere).toHaveBeenCalledWith('sub.examSessionId = :examSessionId', {
      examSessionId: SESSION_ID,
    });
  });

  it('adds a status filter only when one is given', async () => {
    const { service, builder } = createTeacherHarness([row()], 1);

    await service.listForTeacher(TEACHER_ID, { page: 1, pageSize: 20, status: 'invalid' });

    expect(builder.andWhere).toHaveBeenCalledWith('sub.status = :status', { status: 'invalid' });
  });

  it('adds a search filter matching MSSV or the typed name only when one is given', async () => {
    const { service, builder } = createTeacherHarness([row()], 1);

    await service.listForTeacher(TEACHER_ID, { page: 1, pageSize: 20, search: 'Nguyen' });

    expect(builder.andWhere).toHaveBeenCalledWith(
      '(sub.studentMssv ILIKE :search OR sub.studentNameInput ILIKE :search)',
      { search: '%Nguyen%' },
    );
  });

  it('adds none of the optional filters when none are given', async () => {
    const { service, builder } = createTeacherHarness([row()], 1);

    await service.listForTeacher(TEACHER_ID, { page: 1, pageSize: 20 });

    expect(builder.andWhere).not.toHaveBeenCalled();
  });

  it('paginates with the given page/pageSize', async () => {
    const { service, builder } = createTeacherHarness([row()], 1);

    await service.listForTeacher(TEACHER_ID, { page: 3, pageSize: 10 });

    expect(builder.skip).toHaveBeenCalledWith(20);
    expect(builder.take).toHaveBeenCalledWith(10);
  });

  it('never calls storage for a submission with no storageKey yet', async () => {
    const { service, storage } = createTeacherHarness([row({ storageKey: null })], 1);

    const result = await service.listForTeacher(TEACHER_ID, { page: 1, pageSize: 20 });

    expect(storage.generateDownloadUrl).not.toHaveBeenCalled();
    expect(result.items[0].downloadUrl).toBeNull();
  });
});

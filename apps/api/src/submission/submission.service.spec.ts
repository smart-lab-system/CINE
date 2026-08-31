import { DataSource, Repository } from 'typeorm';
import { SubmissionService } from './submission.service';
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
    ...overrides,
  } as ExamSessionEntity;
}

function createHarness(
  overrides: {
    session?: ExamSessionEntity | null;
    deliverable?: object | null;
    objectExists?: jest.Mock;
    submissions?: Array<Partial<SubmissionEntity>>;
  } = {},
) {
  const examSessions = {
    findById: jest.fn().mockResolvedValue(
      overrides.session === undefined ? session() : overrides.session,
    ),
    findDeliverable: jest.fn().mockResolvedValue(
      overrides.deliverable === undefined ? { id: DELIVERABLE_ID } : overrides.deliverable,
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
  const submissions = {
    find: jest.fn().mockResolvedValue(overrides.submissions ?? []),
  };
  const transaction = jest.fn();
  const service = new SubmissionService(
    { transaction } as unknown as DataSource,
    submissions as unknown as Repository<SubmissionEntity>,
    examSessions as unknown as ExamSessionService,
    storage as unknown as StorageService,
  );
  return { service, examSessions, storage, submissions, transaction };
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
    const { service, storage, submissions } = createHarness({
      submissions: [
        {
          studentMssv: MSSV,
          studentNameInput: 'Nguyen Van A',
          requiredDeliverableId: DELIVERABLE_ID,
          status: 'collected',
          submittedAt: new Date('2026-08-29T04:00:00.000Z'),
          fileSize: '128',
          storageKey: EXPECTED_KEY,
        },
      ],
    });

    const rows = await service.listForSession(SESSION_ID);

    expect(submissions.find).toHaveBeenCalledWith({
      where: { examSessionId: SESSION_ID },
      order: { submittedAt: 'ASC' },
    });
    expect(storage.generateDownloadUrl).toHaveBeenCalledWith(EXPECTED_KEY);
    expect(rows).toEqual([
      {
        studentMssv: MSSV,
        studentNameInput: 'Nguyen Van A',
        requiredDeliverableId: DELIVERABLE_ID,
        status: 'collected',
        submittedAt: new Date('2026-08-29T04:00:00.000Z'),
        fileSize: '128',
        downloadUrl: 'http://storage/view',
      },
    ]);
  });
});

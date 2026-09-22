import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DataSource, EntityManager, QueryFailedError, Repository } from 'typeorm';
import { AgentSocketIdentity } from '../common/exam-live-socket';
import { ExamSessionService } from '../exam-session/exam-session.service';
import { ExamSessionEntity } from '../exam-session/entities/exam-session.entity';
import { RequiredDeliverableEntryEntity } from '../exam-session/entities/required-deliverable-entry.entity';
import { renderFilename, FilenameContext } from '../exam-session/filename-template';
import { StorageService } from '../storage/storage.service';
import { SubmissionEntity } from './entities/submission.entity';
import { RequestUploadUrlDto } from './dto/request-upload-url.dto';
import { ClassEntity } from '../course/entities/class.entity';
import { ConfirmSubmissionDto } from './dto/confirm-submission.dto';
import { SearchSubmissionsDto } from './dto/search-submissions.dto';
import {
  ConfirmSubmissionAck,
  LobbySubmissionStatus,
  RequestUploadUrlAck,
  SubmissionAckError,
  SubmissionErrorCode,
  SUBMISSION_GRACE_PERIOD_MS,
} from './submission.types';
import { isCollectionOpen } from '../exam-session/exam-session.types';
import { ARCHIVE_CHECK_QUEUE } from './archive-check/archive-check.constants';
import { ArchiveCheckJob, ARCHIVE_CHECK_JOB_OPTIONS } from './archive-check/archive-check.types';

/** Postgres unique_violation. */
const UNIQUE_VIOLATION = '23505';

export interface ConfirmSubmissionOutcome {
  ack: ConfirmSubmissionAck;
  /** Non-null only when a row was written and the teacher should be told. */
  broadcast: LobbySubmissionStatus | null;
}

export interface SubmissionStatusView {
  studentMssv: string;
  studentNameInput: string;
  requiredDeliverableId: string;
  status: SubmissionEntity['status'];
  submittedAt: Date | null;
  fileSize: string | null;
  downloadUrl: string | null;
  /**
   * Lớp GỐC của sinh viên, và tên của nó.
   *
   * Khác `exam_session.class_id` nghĩa là em THI BÙ — ngồi ở phiên của
   * lớp khác. Không cần cột mới: `submission.home_class_id` đã được ghi
   * từ lúc thu bài, chính là thứ định tuyến bài về đúng giảng viên.
   *
   * Kèm TÊN chứ không chỉ id: biết "thi bù" mà không biết "từ lớp nào"
   * thì giảng viên vẫn phải đi tra.
   */
  homeClassId: string;
  homeClassName: string | null;
}

/**
 * A submission as seen from the cross-session "Quản lý bài thu" page —
 * SubmissionStatusView plus the two facts that page needs and a
 * single-session view already knows without asking (which session, which
 * deliverable).
 */
export interface TeacherSubmissionView {
  id: string;
  examSessionId: string;
  examSessionName: string;
  requiredFilename: string;
  studentMssv: string;
  studentNameInput: string;
  status: SubmissionEntity['status'];
  submittedAt: Date | null;
  fileSize: string | null;
  downloadUrl: string | null;
}

/**
 * Collection-side business logic. Returns discriminated results rather than
 * throwing, because every caller is a WebSocket acknowledgement callback
 * that has to turn the outcome into `{ok:false, code, message}` anyway —
 * this keeps SubmissionGateway to validation and wiring, with no branching
 * of its own to test separately.
 */
@Injectable()
export class SubmissionService {
  private readonly logger = new Logger(SubmissionService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(SubmissionEntity)
    private readonly submissions: Repository<SubmissionEntity>,
    private readonly examSessions: ExamSessionService,
    private readonly storage: StorageService,
    @InjectQueue(ARCHIVE_CHECK_QUEUE)
    private readonly archiveCheckQueue: Queue<ArchiveCheckJob>,
  ) {}

  /**
   * Mints a presigned PUT for one deliverable. Writes nothing: a URL handed
   * out is not evidence of anything, and a row created here would have to
   * be cleaned up for every agent that asked and then crashed. The row is
   * created by confirm(), once the object actually exists.
   */
  async requestUploadUrl(
    identity: AgentSocketIdentity,
    dto: RequestUploadUrlDto,
  ): Promise<RequestUploadUrlAck> {
    const guard = await this.resolveTarget(identity, dto.requiredDeliverableId);
    if (!guard.ok) {
      return guard.error;
    }

    const storageKey = this.storage.buildSubmissionKey(
      identity.examSessionId,
      identity.studentId,
      dto.requiredDeliverableId,
    );
    const { uploadUrl, expiresIn } = await this.storage.generateUploadUrl(storageKey);
    return { ok: true, uploadUrl, storageKey, expiresIn };
  }

  /**
   * Records a completed upload.
   *
   * Two independent checks stand between an agent and a `collected` row,
   * because the agent is unauthenticated and "I uploaded it, trust me" is
   * not a thing the server can accept:
   *
   *  1. the confirmed storageKey must equal the key this exact
   *     (session, student, deliverable) triple would have been signed for —
   *     so a key belonging to another student cannot be claimed;
   *  2. the object must actually be in storage.
   */
  async confirmSubmission(
    identity: AgentSocketIdentity,
    dto: ConfirmSubmissionDto,
  ): Promise<ConfirmSubmissionOutcome> {
    const guard = await this.resolveTarget(identity, dto.requiredDeliverableId);
    if (!guard.ok) {
      return { ack: guard.error, broadcast: null };
    }

    const expectedKey = this.storage.buildSubmissionKey(
      identity.examSessionId,
      identity.studentId,
      dto.requiredDeliverableId,
    );
    if (dto.storageKey !== expectedKey) {
      this.logger.warn(
        `submission:confirm rejected: student ${identity.studentId} confirmed key ` +
          `${dto.storageKey}, expected ${expectedKey}`,
      );
      return {
        ack: error(
          'STORAGE_KEY_MISMATCH',
          'The confirmed storage key does not match the one issued for this deliverable.',
        ),
        broadcast: null,
      };
    }

    let exists: boolean;
    try {
      exists = await this.storage.objectExists(expectedKey);
    } catch {
      // Storage said neither yes nor no. Recording `collected` here would
      // claim a file we cannot see; recording `invalid` would condemn a
      // submission that may be perfectly fine. Tell the agent to retry.
      return {
        ack: error(
          'STORAGE_UNAVAILABLE',
          'Could not reach object storage to verify the upload. Please retry.',
        ),
        broadcast: null,
      };
    }
    if (!exists) {
      this.logger.warn(
        `submission:confirm rejected: no object at ${expectedKey} (student ${identity.studentId})`,
      );
      return {
        ack: error(
          'OBJECT_NOT_FOUND',
          'No uploaded file was found at that storage key.',
        ),
        broadcast: null,
      };
    }

    const saved = await this.upsertCollected(identity, dto, expectedKey, guard.session.roomName);
    // Không thể null ở đây: `upsertCollected` vừa ghi `submittedAt` trên
    // MỌI nhánh của nó. Vế `??` là để trình biên dịch không phải tin lời
    // tôi — nếu một nhánh tương lai quên ghi, ack sẽ nói giờ hiện tại
    // thay vì nổ ở giữa một lượt nộp bài đang diễn ra.
    const submittedAt = (saved.submittedAt ?? new Date()).toISOString();

    // NGOÀI giao dịch, có chủ ý — `upsertCollected` đã commit trước khi
    // Promise của nó resolve. Enqueue TRONG giao dịch để worker nhấc job
    // lên và đọc dòng TRƯỚC KHI commit — thấy dòng chưa có bản chụp, hoặc
    // chưa tồn tại (spec §5.3.1).
    //
    // Cái giá: enqueue hỏng ở đúng khe này (Redis rớt) để lại một dòng
    // `pending` không có job. Không có timeout nào tự vớt — đó là việc
    // của POST :id/archive-recheck (Task 7).
    if (saved.archiveCheckStatus === 'pending') {
      try {
        await this.archiveCheckQueue.add(
          'check',
          { submissionId: saved.id },
          ARCHIVE_CHECK_JOB_OPTIONS,
        );
      } catch (enqueueError) {
        this.logger.error(
          `Không đẩy được job kiểm file nén cho submission ${saved.id} — ` +
            `dùng "Kiểm lại" để chạy tay`,
          enqueueError instanceof Error ? enqueueError.stack : String(enqueueError),
        );
      }
    }

    return {
      ack: { ok: true, status: saved.status, submittedAt },
      broadcast: {
        studentId: identity.studentId,
        requiredDeliverableId: dto.requiredDeliverableId,
        // Narrowed by upsertCollected: it only ever leaves a row terminal.
        status: saved.status as LobbySubmissionStatus['status'],
        submittedAt,
      },
    };
  }

  /**
   * Everything collected so far for one session. Powers the teacher page's
   * initial render — the live `lobby:submission_status` events only cover
   * what happens while the page is open, so without this a refresh would
   * show an empty table.
   *
   * One query, no joins: the page already has the deliverable list from the
   * session detail it fetched, and pairs the two client-side.
   */
  async listForSession(examSessionId: string): Promise<SubmissionStatusView[]> {
    const [rows, deliverables] = await Promise.all([
      // `NULLS LAST` tường minh dù ASC của Postgres vốn đã thế. Mặc định
      // đó LẬT khi ai đó đổi sang DESC — và không có gì ở dòng `'ASC'`
      // nói cho họ biết điều ấy. `listForTeacher` đã phải trả giá đúng
      // một lần; chỗ này viết rõ để không phải trả lần hai.
      this.submissions
        .createQueryBuilder('sub')
        // Một JOIN, chỉ để lấy TÊN lớp gốc. Nhãn "thi bù" mà không nói
        // từ lớp nào thì giảng viên vẫn phải đi tra, nên cái tên là
        // phần có giá trị chứ không phải cái id.
        .leftJoin(ClassEntity, 'hc', 'hc.id = sub.home_class_id')
        .addSelect('hc.name', 'homeClassName')
        .where('sub.examSessionId = :examSessionId', { examSessionId })
        .orderBy('sub.submittedAt', 'ASC', 'NULLS LAST')
        .getRawAndEntities<{ homeClassName: string | null }>(),
      // For the download URL's filename only (see below) — still no SQL
      // JOIN, and still through ExamSessionService rather than a second
      // repository over exam-session's own table (this module's own
      // reasoning for importing ExamSessionModule in the first place).
      this.examSessions.listRequiredDeliverables(examSessionId),
    ]);
    const filenameById = new Map(deliverables.map((d) => [d.id, d.requiredFilename]));

    return Promise.all(
      rows.entities.map(async (row, index) => ({
        studentMssv: row.studentMssv,
        studentNameInput: row.studentNameInput,
        requiredDeliverableId: row.requiredDeliverableId,
        status: row.status,
        submittedAt: row.submittedAt,
        fileSize: row.fileSize,
        homeClassId: row.homeClassId,
        // `?.` chứ không `[index].`: `getRawAndEntities` trả raw song song
        // với entities, nhưng nếu một ngày chúng lệch nhau thì thứ hỏng phải
        // là MỘT cái nhãn, không phải cả trang bài nộp.
        homeClassName: rows.raw[index]?.homeClassName ?? null,
        // QA-reported gap: the storage key is a bare id, no extension —
        // nothing a browser follows this URL could ever name the saved
        // file after. filename is the declared requiredFilename, the same
        // ground truth submission identity already uses everywhere else
        // (exact-filename-match collection) — not a guess.
        downloadUrl: row.storageKey
          ? (
              await this.storage.generateDownloadUrl(row.storageKey, {
                filename: filenameById.get(row.requiredDeliverableId),
              })
            ).downloadUrl
          : null,
      })),
    );
  }

  /**
   * Everything collected across EVERY session this teacher owns — powers
   * "Quản lý bài thu" (QA-reported gap: there was no way to see a
   * submission without first knowing which session it belonged to).
   *
   * Scoped through `exam_session.teacher_id`, the exact same ownership
   * fact `ExamSessionService.findAllForOwner` scopes "Quản lý kỳ thi" by —
   * deliberately NOT `submission.home_teacher_id` (that column exists for
   * routing a make-up student's grading to their OWN class teacher, a
   * different question from "which sessions did I run").
   */
  async listForTeacher(
    teacherId: string,
    query: SearchSubmissionsDto,
  ): Promise<{ items: TeacherSubmissionView[]; total: number }> {
    const qb = this.submissions
      .createQueryBuilder('sub')
      .innerJoinAndSelect('sub.examSession', 'session')
      .innerJoinAndSelect('sub.requiredDeliverable', 'deliverable')
      .where('session.teacherId = :teacherId', { teacherId });

    if (query.examSessionId) {
      qb.andWhere('sub.examSessionId = :examSessionId', {
        examSessionId: query.examSessionId,
      });
    }
    if (query.status) {
      qb.andWhere('sub.status = :status', { status: query.status });
    }
    if (query.search) {
      qb.andWhere('(sub.studentMssv ILIKE :search OR sub.studentNameInput ILIKE :search)', {
        search: `%${query.search}%`,
      });
    }

    const [rows, total] = await qb
      // NULLS LAST tường minh. Postgres mặc định NULLS FIRST cho DESC,
      // nên từ khi `submitted_at` được phép NULL (§7.1.2 gieo dòng chưa
      // nộp), trang này sẽ mở ra bằng một trang đầy những dòng KHÔNG CÓ
      // FILE — sắp theo một cột mà chúng không có giá trị. Bài nộp thật
      // gần nhất là thứ trang "Quản lý bài thu" phải dẫn đầu.
      .orderBy('sub.submittedAt', 'DESC', 'NULLS LAST')
      .skip((query.page - 1) * query.pageSize)
      .take(query.pageSize)
      .getManyAndCount();

    const items = await Promise.all(
      rows.map(async (row) => ({
        id: row.id,
        examSessionId: row.examSessionId,
        examSessionName: row.examSession.name,
        requiredFilename: row.requiredDeliverable.requiredFilename,
        studentMssv: row.studentMssv,
        studentNameInput: row.studentNameInput,
        status: row.status,
        submittedAt: row.submittedAt,
        fileSize: row.fileSize,
        // filename set (unlike listForSession above, not yet updated on
        // this branch) — the storage key alone has no extension for a
        // browser to name the downloaded file after.
        downloadUrl: row.storageKey
          ? (
              await this.storage.generateDownloadUrl(row.storageKey, {
                filename: row.requiredDeliverable.requiredFilename,
              })
            ).downloadUrl
          : null,
      })),
    );

    return { items, total };
  }

  /**
   * Shared precondition check for both handlers: the session must exist and
   * be accepting uploads, and the deliverable must belong to it.
   */
  private async resolveTarget(
    identity: AgentSocketIdentity,
    requiredDeliverableId: string,
  ): Promise<
    | { ok: true; session: ExamSessionEntity }
    | { ok: false; error: SubmissionAckError }
  > {
    const session = await this.examSessions.findById(identity.examSessionId);
    if (!session) {
      // The socket joined this session, so it existed moments ago. Report it
      // as "not accepting uploads" rather than inventing a session-missing
      // code for a state only a concurrent delete could produce.
      return {
        ok: false,
        error: error('SESSION_NOT_FINALIZING', 'This exam session is no longer available.'),
      };
    }

    if (!isAcceptingUploads(session, new Date())) {
      return {
        ok: false,
        error: error(
          'SESSION_NOT_FINALIZING',
          'This exam session is not currently accepting submissions.',
        ),
      };
    }

    const deliverable = await this.examSessions.findDeliverable(
      identity.examSessionId,
      requiredDeliverableId,
    );
    if (!deliverable) {
      return {
        ok: false,
        error: error(
          'DELIVERABLE_NOT_FOUND',
          'No required deliverable with that id belongs to this exam session.',
        ),
      };
    }

    return { ok: true, session };
  }

  /**
   * Writes the row, walking the DB's own lifecycle
   * (received -> validated -> collected) rather than trying to insert
   * `collected` directly — trg_submission_lifecycle rejects that outright,
   * and the trigger is the schema-level copy of CLAUDE.md's state machine,
   * not something to work around.
   *
   * A row that is already terminal (`collected`, or `invalid` from some
   * future flow) has its file metadata refreshed with the status left
   * alone: the trigger only objects when the status actually changes, and
   * re-uploading the same deliverable is a legitimate thing for an agent to
   * do after a failed attempt.
   */
  private async upsertCollected(
    identity: AgentSocketIdentity,
    dto: ConfirmSubmissionDto,
    storageKey: string,
    roomName: string,
    attempt = 1,
  ): Promise<SubmissionEntity> {
    try {
      return await this.dataSource.transaction((manager) =>
        this.writeCollected(manager, identity, dto, storageKey, roomName),
      );
    } catch (caught) {
      // Two agents (or one agent retrying) confirming the same deliverable
      // at once: whichever loses the insert re-reads and takes the update
      // path. Bounded to a single retry — a second collision would mean
      // something other than a race.
      if (attempt === 1 && isUniqueViolation(caught)) {
        this.logger.debug(
          `submission:confirm hit uq_submission_identity for ${identity.studentId}; retrying as update`,
        );
        return this.upsertCollected(identity, dto, storageKey, roomName, attempt + 1);
      }
      throw caught;
    }
  }

  /**
   * Chụp danh sách kỳ vọng bên trong một deliverable dạng nén — spec
   * `2026-09-21-archive-content-validation-design.md` §5.2.
   *
   * BẮT BUỘC chụp ở đây, TRONG cùng giao dịch với lượt `collected`, không
   * render lại trong job archive-check: `identity.machineName` chỉ sống
   * trong `client.data` của socket (xem `AgentSocketIdentity`), và job chạy
   * sau khi socket có thể đã đóng từ lâu. Render với `null` sẽ cho ra
   * `{SOMAY}` -> `'UNKNOWN'` và đánh trượt oan đúng nhóm em dùng token đó.
   *
   * Không phải deliverable nào cũng có entry — trả `false` khi không, để
   * gọi ngoài (writeCollected) biết KHÔNG cần enqueue.
   */
  private async snapshotArchiveExpectations(
    manager: EntityManager,
    submissionId: string,
    requiredDeliverableId: string,
    identity: AgentSocketIdentity,
    roomName: string,
  ): Promise<void> {
    const entries = await manager.getRepository(RequiredDeliverableEntryEntity).find({
      where: { requiredDeliverableId },
      order: { createdAt: 'ASC' },
    });
    const submissionRepo = manager.getRepository(SubmissionEntity);

    if (entries.length === 0) {
      // Vô hại khi gọi lại nhiều lần (nộp lại một deliverable không khai
      // entry): luôn ghi lại đúng cùng một kết luận.
      await submissionRepo.update(submissionId, {
        archiveCheckStatus: 'not_applicable',
        archiveExpectedEntries: null,
        archiveMissingEntries: null,
        archiveCheckError: null,
      });
      return;
    }

    const context: FilenameContext = {
      studentMssv: identity.studentId,
      studentName: identity.fullName,
      roomName,
      machineName: identity.machineName,
    };
    const expected = entries.map((entry) => renderFilename(entry.entryName, context));

    // MỘT câu UPDATE, hai cột — `ck_submission_archive_snapshot` đòi
    // `archive_expected_entries` có mặt CÙNG LÚC với `archive_check_status
    // = 'pending'`; tách thành hai lệnh sẽ có một khoảnh khắc vi phạm nó.
    await submissionRepo.update(submissionId, {
      archiveCheckStatus: 'pending',
      archiveExpectedEntries: expected,
      // Xoá kết quả lần trước — nộp lại thì tính lại, không kẹt kết luận cũ
      // (spec §5.4, thứ mà việc không dùng 'invalid' mua được).
      archiveMissingEntries: null,
      archiveCheckError: null,
    });
  }

  private async writeCollected(
    manager: EntityManager,
    identity: AgentSocketIdentity,
    dto: ConfirmSubmissionDto,
    storageKey: string,
    roomName: string,
  ): Promise<SubmissionEntity> {
    const repo = manager.getRepository(SubmissionEntity);
    const submittedAt = new Date();
    const fileFields = {
      storageKey,
      checksum: dto.checksum,
      // bigint round-trips as a string in TypeORM/pg; keeping it a string
      // here means the column and the entity agree on the way in and out.
      fileSize: String(dto.fileSize),
      submittedAt,
      studentNameInput: identity.fullName,
    };

    const existing = await repo.findOne({
      where: {
        examSessionId: identity.examSessionId,
        requiredDeliverableId: dto.requiredDeliverableId,
        studentMssv: identity.studentId,
      },
    });

    if (!existing) {
      const created = await repo.save(
        repo.create({
          examSessionId: identity.examSessionId,
          requiredDeliverableId: dto.requiredDeliverableId,
          studentMssv: identity.studentId,
          // Routed from the Enrollment that agent:join resolved, carried on
          // the socket identity. These were NULL for the whole submission
          // module because nothing could answer them; now nothing can be
          // collected without an enrollment, so they always can be.
          homeClassId: identity.homeClassId,
          homeTeacherId: identity.homeTeacherId,
          submittedVia: 'normal',
          status: 'received',
          ...fileFields,
        }),
      );
      // Separate statements on purpose: the trigger evaluates OLD -> NEW per
      // statement, so this is the declared path walked one step at a time.
      await repo.update(created.id, { status: 'validated' });
      await repo.update(created.id, { status: 'collected' });
      await this.snapshotArchiveExpectations(
        manager,
        created.id,
        dto.requiredDeliverableId,
        identity,
        roomName,
      );
      return (await repo.findOneByOrFail({ id: created.id })) as SubmissionEntity;
    }

    // NGHỈ HƯU, không phải việc còn dở: 'invalid' sẽ KHÔNG BAO GIỜ có một
    // luồng sinh ra nó nữa — quyết định 2026-09-22, spec
    // 2026-09-21-archive-content-validation-design.md §8.2. Kết quả kiểm
    // nội dung file nén (bao gồm cả ca "thiếu file lúc hết giờ" mà TODO cũ
    // ở đây nhắm tới) đi qua archive_check_status trên chính dòng này,
    // KHÔNG qua status='invalid' — đó là toàn bộ lý do spec §3.3 chọn
    // "kết quả là dữ liệu, không phải trạng thái": trigger vòng đời không
    // có đường ra khỏi 'invalid', nên đi qua nó sẽ tái tạo đúng cái bẫy
    // TODO cũ đã cảnh báo. Đừng viết một nhánh sinh 'invalid' ở đây — đọc
    // archiveExpectedEntries/archiveCheckStatus trên submission-overview
    // và submission-attention.ts (web) thay vào đó.
    if (existing.status === 'collected' || existing.status === 'invalid') {
      await repo.update(existing.id, fileFields);
    } else {
      // Dòng GIEO SẴN lúc đóng băng (`not_submitted`), và dòng đã bị kết
      // luận vắng thi rồi mới có bài về (`absent` — spec collecting §3.1
      // cố ý KHÔNG chặn upload sau khi xác nhận), đều bước vào đường
      // chính ở đây thay vì nhảy thẳng tới `collected`.
      //
      // Đi từng bước chứ không tắt: `collected` phải luôn nghĩa là "đã
      // đi hết đường kiểm tra". Một dòng nhảy cóc tới `collected` trông
      // giống hệt một bài đã qua kiểm, và trigger vòng đời cũng sẽ từ
      // chối nó — đúng như thiết kế.
      if (existing.status === 'not_submitted' || existing.status === 'absent') {
        await repo.update(existing.id, { status: 'received' });
      }
      if (existing.status !== 'validated') {
        await repo.update(existing.id, { status: 'validated' });
      }
      await repo.update(existing.id, { ...fileFields, status: 'collected' });
    }

    // Nộp lại thì tính lại (spec §5.4): chụp lại kỳ vọng, về `pending`, xoá
    // kết quả cũ — đây đúng là thứ quyết định "không dùng 'invalid'" mua
    // được. Áp dụng cho cả lần đầu (existing seeded lúc đóng băng) lẫn tái
    // nộp sau khi đã `collected`.
    await this.snapshotArchiveExpectations(
      manager,
      existing.id,
      dto.requiredDeliverableId,
      identity,
      roomName,
    );

    return (await repo.findOneByOrFail({ id: existing.id })) as SubmissionEntity;
  }
}

function error(code: SubmissionErrorCode, message: string): SubmissionAckError {
  return { ok: false, code, message };
}

/**
 * Uploads are allowed from `start_time` until `end_time` plus a grace
 * period, and only for a session that is running or has been finalized.
 *
 * The window is deliberately wider than "only while finalizing": an agent
 * that loses its socket right as `exam:finalize` goes out reconnects and
 * uploads a moment later, and a session whose scheduled sweep has already
 * flipped it to `completed` is precisely when most uploads arrive. Refusing
 * either would throw away real work. `draft`/`scheduled`/`cancelled`, and
 * anything before start_time, are refused.
 */
function isAcceptingUploads(session: ExamSessionEntity, now: Date): boolean {
  // `isCollectionOpen` gồm cả `collecting` — thiếu nó thì mọi file bay
  // về TRONG lúc thu bài bị từ chối, tức hỏng đúng thứ giai đoạn đó sinh
  // ra để phục vụ.
  if (!isCollectionOpen(session.status)) {
    return false;
  }
  const at = now.getTime();
  return (
    at >= session.startTime.getTime() &&
    at <= session.endTime.getTime() + SUBMISSION_GRACE_PERIOD_MS
  );
}

function isUniqueViolation(error: unknown): boolean {
  if (!(error instanceof QueryFailedError)) {
    return false;
  }
  return (error as QueryFailedError & { code?: string }).code === UNIQUE_VIOLATION;
}

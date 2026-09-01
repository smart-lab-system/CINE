import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, QueryFailedError, Repository } from 'typeorm';
import { AgentSocketIdentity } from '../common/exam-live-socket';
import { ExamSessionService } from '../exam-session/exam-session.service';
import { ExamSessionEntity } from '../exam-session/entities/exam-session.entity';
import { StorageService } from '../storage/storage.service';
import { SubmissionEntity } from './entities/submission.entity';
import { RequestUploadUrlDto } from './dto/request-upload-url.dto';
import { ConfirmSubmissionDto } from './dto/confirm-submission.dto';
import {
  ConfirmSubmissionAck,
  LobbySubmissionStatus,
  RequestUploadUrlAck,
  SubmissionAckError,
  SubmissionErrorCode,
  SUBMISSION_GRACE_PERIOD_MS,
} from './submission.types';

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
  submittedAt: Date;
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

    const saved = await this.upsertCollected(identity, dto, expectedKey);
    const submittedAt = saved.submittedAt.toISOString();

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
      this.submissions.find({
        where: { examSessionId },
        order: { submittedAt: 'ASC' },
      }),
      // For the download URL's filename only (see below) — still no SQL
      // JOIN, and still through ExamSessionService rather than a second
      // repository over exam-session's own table (this module's own
      // reasoning for importing ExamSessionModule in the first place).
      this.examSessions.listRequiredDeliverables(examSessionId),
    ]);
    const filenameById = new Map(deliverables.map((d) => [d.id, d.requiredFilename]));

    return Promise.all(
      rows.map(async (row) => ({
        studentMssv: row.studentMssv,
        studentNameInput: row.studentNameInput,
        requiredDeliverableId: row.requiredDeliverableId,
        status: row.status,
        submittedAt: row.submittedAt,
        fileSize: row.fileSize,
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
   * Shared precondition check for both handlers: the session must exist and
   * be accepting uploads, and the deliverable must belong to it.
   */
  private async resolveTarget(
    identity: AgentSocketIdentity,
    requiredDeliverableId: string,
  ): Promise<{ ok: true } | { ok: false; error: SubmissionAckError }> {
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

    return { ok: true };
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
    attempt = 1,
  ): Promise<SubmissionEntity> {
    try {
      return await this.dataSource.transaction((manager) =>
        this.writeCollected(manager, identity, dto, storageKey),
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
        return this.upsertCollected(identity, dto, storageKey, attempt + 1);
      }
      throw caught;
    }
  }

  private async writeCollected(
    manager: EntityManager,
    identity: AgentSocketIdentity,
    dto: ConfirmSubmissionDto,
    storageKey: string,
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
      return (await repo.findOneByOrFail({ id: created.id })) as SubmissionEntity;
    }

    // TODO: nothing produces 'invalid' yet. When a flow does (a required
    // file still missing at the deadline, say), decide deliberately whether
    // a later successful upload should clear it — the DB trigger allows no
    // transition OUT of 'invalid', so that would need a schema change, not
    // just a branch here.
    if (existing.status === 'collected' || existing.status === 'invalid') {
      await repo.update(existing.id, fileFields);
    } else {
      if (existing.status === 'received') {
        await repo.update(existing.id, { status: 'validated' });
      }
      await repo.update(existing.id, { ...fileFields, status: 'collected' });
    }

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
  if (session.status !== 'active' && session.status !== 'completed') {
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

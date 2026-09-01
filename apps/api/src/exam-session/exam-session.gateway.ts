import {
  ForbiddenException,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Server, Socket } from 'socket.io';
import { Subscription } from 'rxjs';
import { AccessTokenPayload } from '../auth/types';
import { agentRoom, teacherRoom } from '../common/exam-live-rooms';
import { extractAccessTokenFromCookie, isPlainObject } from '../common/exam-live-socket';
import { AgentJoinDto } from './dto/agent-join.dto';
import { TeacherSubscribeDto } from './dto/teacher-subscribe.dto';
import { ExamSessionService } from './exam-session.service';
import { ExamFinalizeReason, ExamSessionEvents } from './exam-session.events';
import { EnrollmentService } from '../course/enrollment.service';
import { AccessRequestStore } from './access-request.store';
import { AgentJoinLockStore } from './agent-join-lock.store';
import { AttendanceService } from '../agent-connection/attendance.service';
import { StorageService } from '../storage/storage.service';
import { renderFilename } from './filename-template';
import { ExamMaterialService } from './exam-material.service';
import { STUDENT_MSSV_REGEX } from '../common/student-mssv';

// Server -> Agent. No teacher_id, no other ExamSession field leaks to the
// agent.
//
// `requiredDeliverables` was added for the submission phase. Every
// submission event is keyed by requiredDeliverableId — never by filename,
// so nothing downstream ever has to match a file by name — and this ack is
// where the agent learns those ids. `requiredFiles` is kept alongside it,
// unchanged: it is what the agent uses to create the working files on disk,
// and dropping it would break the existing flow for no gain.
interface AgentJoinAckDeliverable {
  id: string;
  /**
   * RESOLVED for this student, not the pattern the teacher declared.
   *
   * A deliverable may be declared as `{PHONG}_{MSSV}_{TEN}.docx`; the
   * server fills it from the roster and the room and sends the finished
   * name. The agent creates exactly what it is told and never composes a
   * filename itself — submission identity is still decided before the exam,
   * it just now depends on who is sitting it.
   */
  requiredFilename: string;
  deliverableType: string;
}

interface AgentJoinAck {
  examSessionId: string;
  sessionName: string;
  requiredFiles: string[];
  requiredDeliverables: AgentJoinAckDeliverable[];
  // The name on the roster, not the one the student typed. Comparing a
  // typed name against the roster would be fuzzy matching ("Nguyen Van A"
  // vs "Nguyễn Văn A"), so the comparison is removed rather than solved:
  // the server answers with the authoritative spelling and the agent shows
  // it back for confirmation.
  studentName: string;
  endTime: string;
  /**
   * How many exam materials this session has, and when they open.
   *
   * The COUNT, never the files. An agent learns there is something to
   * fetch and when it may fetch it; the bytes come from a separate request
   * that re-checks the clock (Security rule 2). Telling it "there are two
   * files, here they are" on join is exactly the leak the rule names.
   */
  examMaterialCount: number;
  materialsReleaseAt: string;
  /**
   * Whether a snapshot of this student's folder is waiting in storage.
   *
   * Reported on every join, not only on a rejoin the SERVER can see: a
   * machine that was wiped and re-imaged runs an agent with no memory of
   * having joined before, so the agent cannot work this out for itself.
   * False on a genuine first join, which is the common case.
   */
  backupAvailable: boolean;
}

// NOT_ENROLLED closes CLAUDE.md Security rule 1: knowing the session code
// is not access. Every refusal here has a human override — see the
// access-request flow — because a student missing from an imported roster
// must not be locked out of an exam with no recourse.
//
// RATE_LIMITED (spec §5.2) is the one code that overrides whatever the
// underlying outcome would have been: once an MSSV is locked out, every
// attempt gets this code back, regardless of whether the code/session it
// sent this time was actually correct.
type AgentJoinErrorCode =
  | 'SESSION_NOT_FOUND'
  | 'SESSION_NOT_ACTIVE'
  | 'INVALID_INPUT'
  | 'NOT_ENROLLED'
  | 'RATE_LIMITED';

interface AgentJoinError {
  code: AgentJoinErrorCode;
  message: string;
  /** Only set for RATE_LIMITED — how long until this MSSV may try again.
   *  Server-computed and sent explicitly so the UI renders a real
   *  countdown, never a client-guessed one. */
  retryAfterMs?: number;
}

interface LobbyStudentJoined {
  studentId: string;
  fullName: string;
  joinedAt: string;
}

/**
 * Spec §6.1. Broadcast to the teacher room when a join fails because the
 * session isn't open yet/anymore — the one failure mode that both reaches
 * the server and isn't the student's fault. No more PII than
 * LobbyStudentJoined already carries.
 */
interface LobbyJoinAttemptFailed {
  studentId: string;
  code: 'SESSION_NOT_ACTIVE';
  occurredAt: string;
}

// Server -> agents (and the watching teacher). Carries no student data
// at all, which is why the same payload can safely go to both rooms.
interface ExamFinalize {
  examSessionId: string;
  reason: ExamFinalizeReason;
}

interface AgentDisconnected {
  studentId: string;
  disconnectedAt: string;
}

/**
 * Reply to `agent:request-materials`.
 *
 * NOT_YET_RELEASED carries the time rather than just saying no: an agent
 * that connected early should be able to come back at exactly the right
 * moment instead of polling, and a student watching should be told when the
 * paper opens rather than that something failed.
 */
type AgentMaterialsAck =
  | { ok: true; materials: { id: string; fileName: string; fileSize: number; downloadUrl?: string }[] }
  | { ok: false; code: 'NOT_JOINED' | 'STORAGE_UNAVAILABLE'; message: string }
  | { ok: false; code: 'NOT_YET_RELEASED'; message: string; releaseAt: string };

// Added to the contract after Task 3 flagged the original gap: no error
// event existed for `teacher:subscribe` failures (see plan commit
// 86fdd7d). Does not replace/rename any of the 6 originally-defined
// events.
type TeacherSubscribeErrorCode = 'UNAUTHORIZED' | 'SESSION_NOT_FOUND' | 'FORBIDDEN';

interface TeacherSubscribeError {
  code: TeacherSubscribeErrorCode;
  message: string;
}

// Agent always connects OUT to this server (never the reverse) — the
// riskiest architectural bet of the exam-live demo. Namespace and every
// event name/payload shape below are the shared contract with the
// frontend lobby, the agent CLI, and the mock agent (Tasks 4-8) — do not
// rename or reshape anything here without updating the plan's Global
// Constraints section first.
@WebSocketGateway({
  namespace: '/exam-live',
  cors: {
    origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000',
    credentials: true,
  },
})
export class ExamSessionGateway
  implements OnGatewayDisconnect, OnModuleInit, OnModuleDestroy
{
  @WebSocketServer()
  private readonly server!: Server;

  private readonly logger = new Logger(ExamSessionGateway.name);

  // `agent:join` rate limiting — a DoS guard against a single client
  // spamming this handler (each attempt hits the DB). Sliding window,
  // keyed by `client.id` (this socket's own connection id, not IP) so the
  // limit is strictly per-connection — never shared across sockets, which
  // matters because in dev/test many sockets share the same source IP
  // (localhost). Every entry is deleted in handleDisconnect, so the Map
  // can never grow past "currently connected sockets" — bounded by
  // connection count, not by elapsed time, so it can't leak/OOM over a
  // long-running demo.
  private static readonly AGENT_JOIN_RATE_LIMIT = 5;
  private static readonly AGENT_JOIN_RATE_WINDOW_MS = 60_000;
  private readonly agentJoinAttempts = new Map<string, number[]>();

  private finalizedSubscription?: Subscription;

  constructor(
    private readonly examSessions: ExamSessionService,
    private readonly jwt: JwtService,
    private readonly events: ExamSessionEvents,
    private readonly enrollments: EnrollmentService,
    private readonly accessRequests: AccessRequestStore,
    private readonly agentJoinLocks: AgentJoinLockStore,
    private readonly attendance: AttendanceService,
    private readonly storage: StorageService,
    private readonly materials: ExamMaterialService,
  ) {}

  /**
   * Turns the service's domain event into the wire event. The service
   * owns the status transition and publishes; this owns the socket and
   * broadcasts — see ExamSessionEvents for why they talk through a bus
   * instead of injecting each other.
   */
  onModuleInit(): void {
    this.finalizedSubscription = this.events.finalized$.subscribe(
      ({ examSessionId, reason }) => {
        const payload: ExamFinalize = { examSessionId, reason };
        // Both rooms: agents need the command, and the teacher watching
        // the page needs to see the session flip to "Đã kết thúc"
        // without polling. Safe to share one payload — it contains no
        // student data (see ExamFinalize).
        this.server.to(agentRoom(examSessionId)).emit('exam:finalize', payload);
        this.server.to(teacherRoom(examSessionId)).emit('exam:finalize', payload);
        this.logger.log(
          `exam:finalize broadcast for session ${examSessionId} (reason=${reason})`,
        );
      },
    );
  }

  onModuleDestroy(): void {
    // Without this, a torn-down module (every e2e test file does one)
    // leaves a live subscriber holding a dead `server` reference.
    this.finalizedSubscription?.unsubscribe();
  }

  /**
   * Agent -> Server. Public (no JWT — an exam-taking machine has no
   * teacher/student login of its own). Validates the payload, resolves
   * `sessionCode` (case-insensitively — codes are stored uppercase-only,
   * see EXAM_SESSION_CODE_ALPHABET) to a session, and checks it's
   * currently joinable before letting the agent in.
   */
  @SubscribeMessage('agent:join')
  async handleAgentJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: AgentJoinDto,
  ): Promise<void> {
    // Rate limit first, before any validation/DB work — the point is to
    // stop a spamming client from burning DB queries on every attempt,
    // not just the ones that would otherwise succeed. Never emits an
    // event back to the client: rate-limit internals aren't part of the
    // `agent:join` event contract, so a limited client just gets
    // disconnected and the reason is logged server-side only.
    if (this.isAgentJoinRateLimited(client)) {
      this.logger.warn(
        `agent:join rate limit exceeded for socket ${client.id} (ip=${client.handshake.address}) — disconnecting`,
      );
      client.disconnect(true);
      return;
    }

    // Idempotency guard (deferred Minor from an earlier review, bundled
    // into this fix): a socket that already completed `agent:join` once
    // has `client.data.examSessionId` set. Letting a second `agent:join`
    // through would overwrite `client.data.studentId`/`examSessionId` —
    // desyncing handleDisconnect's broadcast target from reality — and
    // would re-broadcast a duplicate `lobby:student_joined` for a student
    // already showing in the lobby. None of the contract's 3 error codes
    // fit "already joined", so this is intentionally silent (ignored, not
    // errored) rather than inventing a 4th code for it.
    if (client.data.examSessionId) {
      this.logger.debug(
        `agent:join ignored: socket ${client.id} already joined session ${client.data.examSessionId as string}`,
      );
      return;
    }

    // `plainToInstance`/`validate()` assume an object to walk — a
    // string/number/array/null payload (`socket.emit('agent:join',
    // 'foo')`) isn't one, and `validate()` throws a raw TypeError on it
    // instead of returning validation errors, which would otherwise
    // surface as Nest's generic internal-error event instead of the
    // contracted `agent:join:error`/`INVALID_INPUT`. Reject it here,
    // before either call.
    if (!isPlainObject(body)) {
      this.emitJoinFailure(
        client,
        null,
        'INVALID_INPUT',
        'fullName, studentId, and sessionCode are required and must be within length limits.',
      );
      return;
    }

    // Spec §5.2: keyed by MSSV, so it survives a reconnect (unlike the
    // per-socket limiter above). Extracted from the RAW body, before
    // validation — a lockout must intercept even a malformed follow-up
    // attempt, not just a well-formed one. Only a syntactically valid MSSV
    // is treated as a key: there is nothing meaningful to lock out for a
    // payload with no usable studentId, and the per-socket limiter above
    // already guards that case. Checking never extends or resets a lock —
    // see AgentJoinLockStore.checkLock.
    const candidateMssv = this.extractCandidateMssv(body);
    if (candidateMssv) {
      const lock = this.agentJoinLocks.checkLock(candidateMssv);
      if (lock.locked) {
        this.emitJoinError(
          client,
          'RATE_LIMITED',
          'Quá nhiều lần thử sai. Vui lòng thử lại sau.',
          lock.retryAfterMs,
        );
        return;
      }
    }

    const dto = plainToInstance(AgentJoinDto, body ?? {});
    const errors = await validate(dto);
    if (errors.length > 0) {
      this.emitJoinFailure(
        client,
        candidateMssv,
        'INVALID_INPUT',
        'fullName, studentId, and sessionCode are required and must be within length limits.',
      );
      return;
    }

    // Codes are generated and stored uppercase-only (see
    // EXAM_SESSION_CODE_ALPHABET) — normalize whatever the agent typed so
    // matching never cares about case.
    const normalizedCode = dto.sessionCode.trim().toUpperCase();
    const session = await this.examSessions.findByCode(normalizedCode);
    if (!session) {
      this.emitJoinFailure(client, dto.studentId, 'SESSION_NOT_FOUND', 'No exam session matches this code.');
      return;
    }

    const now = Date.now();
    const isActive =
      session.status === 'active' &&
      now >= session.startTime.getTime() &&
      now <= session.endTime.getTime();
    if (!isActive) {
      // Does NOT count toward the lockout (§5.2) — a patient early student
      // retrying is not spam. Does get its own, separate throttle (§6.3)
      // for the teacher broadcast below, so a repeatedly-retrying student
      // doesn't flood the lobby with one repeated event.
      this.emitJoinError(client, 'SESSION_NOT_ACTIVE', 'This exam session is not currently active.');
      if (this.agentJoinLocks.shouldNotify(dto.studentId)) {
        const failed: LobbyJoinAttemptFailed = {
          studentId: dto.studentId,
          code: 'SESSION_NOT_ACTIVE',
          occurredAt: new Date().toISOString(),
        };
        client.to(teacherRoom(session.id)).emit('lobby:join_attempt_failed', failed);
      }
      return;
    }

    // Security rule 1. Checked at COURSE level, never at class level —
    // that is what allows a student to sit a make-up exam with another
    // class's session without a special case.
    const enrollment = await this.enrollments.findForCourse(session.courseId, dto.studentId);
    if (!enrollment) {
      this.logger.warn(
        `agent:join refused: ${dto.studentId} has no enrollment for course ${session.courseId}`,
      );
      this.emitJoinError(
        client,
        'NOT_ENROLLED',
        'Mã số sinh viên này không có trong danh sách của môn thi. Hãy gửi yêu cầu cho giảng viên.',
      );
      return;
    }

    const deliverables = await this.examSessions.listRequiredDeliverables(session.id);

    // Rendered once, here, and used for both fields of the ack — the agent
    // must never see two different names for the same deliverable.
    const filenameContext = {
      studentMssv: dto.studentId,
      // The roster spelling, the same one the ack confirms back to the
      // student. A name they typed is not identity and must not end up in a
      // filename either.
      studentName: enrollment.studentName,
      roomName: session.room?.name ?? '',
      machineName: dto.machineName ?? null,
    };
    const resolved = deliverables.map((deliverable) => ({
      id: deliverable.id,
      requiredFilename: renderFilename(deliverable.requiredFilename, filenameContext),
      deliverableType: deliverable.deliverableType,
    }));

    // Stashed on the socket for handleDisconnect — a disconnecting socket
    // has no other way to know which room/student it was. Note: the agent
    // socket itself never joins any room (see teacherRoom's doc comment) —
    // `client.data` is enough for handleDisconnect to know which teacher
    // room to broadcast `agent:disconnected` to.
    client.data.studentId = dto.studentId;
    client.data.examSessionId = session.id;
    // Read back by SubmissionGateway for submission.student_name_input.
    // Taken from the enrollment rather than from `dto.fullName`: the
    // roster is authoritative, and a name the student typed is not
    // identity.
    client.data.fullName = enrollment.studentName;
    // Carried so collection never has to look the enrollment up again.
    client.data.homeClassId = enrollment.homeClassId;
    client.data.homeTeacherId = enrollment.homeTeacherId;

    // Joined AFTER all validation passed, and only to the agents room —
    // never teacherRoom (see its comment: that would leak every
    // classmate's {studentId, fullName} to an unauthenticated socket).
    // Needed so `exam:finalize` can reach this agent.
    await client.join(agentRoom(session.id));

    // A storage hiccup must not cost a student their exam: not knowing
    // whether a backup exists is worth strictly less than getting in.
    let backupAvailable = false;
    try {
      backupAvailable = await this.storage.objectExists(
        this.storage.buildBackupKey(session.id, dto.studentId),
      );
    } catch (error) {
      this.logger.warn(
        `could not check for a backup for ${dto.studentId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    const materialState = await this.materials.listForAgent(session, new Date());

    const ack: AgentJoinAck = {
      examSessionId: session.id,
      backupAvailable,
      examMaterialCount: materialState.released ? materialState.materials.length : 0,
      materialsReleaseAt: session.startTime.toISOString(),
      sessionName: session.name,
      studentName: enrollment.studentName,
      requiredFiles: resolved.map((deliverable) => deliverable.requiredFilename),
      requiredDeliverables: resolved,
      endTime: session.endTime.toISOString(),
    };
    // Awaited BEFORE the ack, not fired off after it. The agent replies to
    // the ack — including by dying and reconnecting — so an unawaited write
    // here can land after the disconnect it precedes, and the log comes out
    // in an order that never happened. One extra round-trip buys an event
    // stream that can be trusted to be in sequence.
    await this.attendance.recordJoin(session.id, dto.studentId, session.startTime);

    // A join that actually succeeds is strong evidence this MSSV isn't
    // being abused — see AgentJoinLockStore.clear for why this also wipes
    // the escalation history, not just the failure count.
    this.agentJoinLocks.clear(dto.studentId);

    client.emit('agent:join:ack', ack);

    // Broadcast to the teacher room only. Agents are never members of any
    // room (see teacherRoom's doc comment), so this can never echo back to
    // the joining agent regardless of `client.to` vs `this.server.to` —
    // `client.to` is kept anyway since it costs nothing and matches the
    // "don't echo to sender" intent explicitly.
    const joined: LobbyStudentJoined = {
      studentId: dto.studentId,
      fullName: enrollment.studentName,
      joinedAt: new Date().toISOString(),
    };
    client.to(teacherRoom(session.id)).emit('lobby:student_joined', joined);
  }

  /**
   * Agent -> Server. The exam materials, or the time they open.
   *
   * A separate request rather than a field on the join ack, and that is the
   * point: Security rule 2 says an agent may sit in the lobby before the
   * exam starts and still not hold the paper. The clock is re-checked here,
   * on the read, every time — so an agent that connected early and waited
   * gets the files at start_time and not a second before.
   */
  @SubscribeMessage('agent:request-materials')
  async handleRequestMaterials(
    @ConnectedSocket() client: Socket,
  ): Promise<AgentMaterialsAck> {
    const examSessionId = client.data?.examSessionId as string | undefined;
    if (!examSessionId) {
      return { ok: false, code: 'NOT_JOINED', message: 'This connection has not joined an exam session.' };
    }

    const session = await this.examSessions.findById(examSessionId);
    if (!session) {
      return { ok: false, code: 'NOT_JOINED', message: 'This exam session no longer exists.' };
    }

    try {
      const state = await this.materials.listForAgent(session, new Date());
      if (!state.released) {
        return {
          ok: false,
          code: 'NOT_YET_RELEASED',
          message: 'Đề thi chưa được mở.',
          releaseAt: state.releaseAt,
        };
      }
      return { ok: true, materials: state.materials };
    } catch (error) {
      this.logger.error(
        `agent:request-materials failed for session ${examSessionId}`,
        error instanceof Error ? error.stack : String(error),
      );
      return {
        ok: false,
        code: 'STORAGE_UNAVAILABLE',
        message: 'Không lấy được đề thi. Hãy thử lại.',
      };
    }
  }

  /**
   * Frontend teacher -> Server. Requires a valid `access_token` cookie
   * (httpOnly — the browser attaches it automatically on the handshake
   * when the client is created with `withCredentials: true`; there is no
   * JS-readable token store to put in `socket.handshake.auth.token`) AND
   * ownership of the target session. Any failure emits
   * `teacher:subscribe:error` (added to the contract after Task 3 — see
   * plan commit 86fdd7d) instead of failing silently; the socket stays
   * connected either way.
   */
  @SubscribeMessage('teacher:subscribe')
  async handleTeacherSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: TeacherSubscribeDto,
  ): Promise<void> {
    // Same non-object guard as handleAgentJoin — a string/number/array/
    // null payload would otherwise reach `plainToInstance`/`validate()`
    // and throw a raw TypeError before the `teacher:subscribe:error`
    // path below ever runs.
    if (!isPlainObject(body)) {
      this.logger.warn(`teacher:subscribe rejected: non-object payload from ${client.id}`);
      this.emitSubscribeError(client, 'SESSION_NOT_FOUND', 'No exam session matches this id.');
      return;
    }

    const dto = plainToInstance(TeacherSubscribeDto, body ?? {});
    const errors = await validate(dto);
    if (errors.length > 0) {
      // The contract's 3 error codes don't include a payload-shape code
      // (UNAUTHORIZED/SESSION_NOT_FOUND/FORBIDDEN are all about identity
      // or the target session) — a malformed examSessionId trivially
      // "doesn't resolve to a row" either, so it's bucketed under
      // SESSION_NOT_FOUND rather than inventing a 4th code.
      this.logger.warn(`teacher:subscribe rejected: invalid payload from ${client.id}`);
      this.emitSubscribeError(client, 'SESSION_NOT_FOUND', 'No exam session matches this id.');
      return;
    }

    const token = extractAccessTokenFromCookie(client.handshake.headers.cookie);
    if (!token) {
      this.logger.warn(`teacher:subscribe rejected: no access_token cookie from ${client.id}`);
      this.emitSubscribeError(client, 'UNAUTHORIZED', 'Missing or invalid access token.');
      return;
    }

    let payload: AccessTokenPayload;
    try {
      // Same JwtService + secret AuthService already uses for HTTP
      // (see AuthService.refresh) — just a different entry point, not a
      // reimplementation.
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        secret: process.env.ACCESS_TOKEN_SECRET,
      });
    } catch {
      this.logger.warn(`teacher:subscribe rejected: invalid/expired token from ${client.id}`);
      this.emitSubscribeError(client, 'UNAUTHORIZED', 'Missing or invalid access token.');
      return;
    }

    let examSessionId: string;
    try {
      // findByIdForOwner already 404s if missing / 403s if `payload.sub`
      // isn't `teacher_id` — reused as-is instead of the gateway
      // re-deriving that check itself. The two exception types map onto
      // the contract's two distinct failure codes below.
      const session = await this.examSessions.findByIdForOwner(dto.examSessionId, payload.sub);
      examSessionId = session.id;
    } catch (error) {
      if (error instanceof ForbiddenException) {
        this.logger.warn(
          `teacher:subscribe rejected: ${payload.sub} does not own session ${dto.examSessionId}`,
        );
        this.emitSubscribeError(client, 'FORBIDDEN', 'You do not own this exam session.');
        return;
      }
      // NotFoundException, or anything else unexpected — never let an
      // error escape this handler unhandled; default to the closest
      // contract code.
      if (!(error instanceof NotFoundException)) {
        this.logger.error(
          `teacher:subscribe: unexpected error looking up session ${dto.examSessionId}`,
          error instanceof Error ? error.stack : undefined,
        );
      } else {
        this.logger.warn(`teacher:subscribe rejected: session ${dto.examSessionId} not found`);
      }
      this.emitSubscribeError(client, 'SESSION_NOT_FOUND', 'No exam session matches this id.');
      return;
    }

    await client.join(teacherRoom(examSessionId));

    // Replay whatever is still waiting for a decision. Access requests live
    // in server memory, not in the socket that first announced them, so a
    // teacher who refreshed mid-exam would otherwise never see a student who
    // asked before the reload — and that student waits forever.
    for (const pending of this.accessRequests.listForSession(examSessionId)) {
      client.emit('lobby:access_request', {
        requestId: pending.requestId,
        studentId: pending.studentId,
        fullName: pending.fullName,
        reason: pending.reason,
        requestedAt: pending.requestedAt,
      });
    }
  }

  /**
   * Broadcasts `agent:disconnected` if this socket had successfully
   * joined a session as an agent. Teacher sockets (and agent sockets that
   * never got past `agent:join`) never set `client.data.studentId`, so
   * this is a no-op for them.
   */
  handleDisconnect(client: Socket): void {
    // Always clean up this socket's rate-limit entry, regardless of
    // whether it ever joined a session — otherwise the Map would keep an
    // entry for every socket that ever connected, for as long as the
    // process runs.
    this.agentJoinAttempts.delete(client.id);

    const studentId = client.data?.studentId as string | undefined;
    const examSessionId = client.data?.examSessionId as string | undefined;
    if (!studentId || !examSessionId) {
      return;
    }

    const disconnected: AgentDisconnected = {
      studentId,
      disconnectedAt: new Date().toISOString(),
    };
    this.server.to(teacherRoom(examSessionId)).emit('agent:disconnected', disconnected);

    // handleDisconnect is synchronous by socket.io's contract, so this is
    // fire-and-forget by necessity as well as by design. Without it, a
    // student whose machine died stays "present" forever and the headcount
    // counts a chair that is empty.
    void this.attendance.recordDisconnect(examSessionId, studentId);
  }

  /**
   * Sliding window: at most AGENT_JOIN_RATE_LIMIT attempts per
   * AGENT_JOIN_RATE_WINDOW_MS, per socket. Expired timestamps are pruned
   * on every call — no separate timer/interval needed, and a socket that
   * stops spamming self-heals within one window without ever
   * disconnecting.
   */
  private isAgentJoinRateLimited(client: Socket): boolean {
    const now = Date.now();
    const windowStart = now - ExamSessionGateway.AGENT_JOIN_RATE_WINDOW_MS;
    const attempts = (this.agentJoinAttempts.get(client.id) ?? []).filter(
      (timestamp) => timestamp > windowStart,
    );
    attempts.push(now);
    this.agentJoinAttempts.set(client.id, attempts);
    return attempts.length > ExamSessionGateway.AGENT_JOIN_RATE_LIMIT;
  }

  private emitJoinError(
    client: Socket,
    code: AgentJoinErrorCode,
    message: string,
    retryAfterMs?: number,
  ): void {
    const error: AgentJoinError = { code, message, ...(retryAfterMs !== undefined && { retryAfterMs }) };
    client.emit('agent:join:error', error);
  }

  /**
   * Records one SESSION_NOT_FOUND/INVALID_INPUT failure against `mssv`
   * (spec §5.2) and emits either the code that was actually about to be
   * sent, or RATE_LIMITED if this failure is the one that just tipped the
   * count over the threshold — the 5th failing attempt gets the lockout
   * countdown, not a generic error a student has no way to act on
   * differently.
   *
   * `mssv` is null when the payload had no syntactically valid MSSV to key
   * on at all (see the `extractCandidateMssv` call site) — nothing to
   * record in that case, so this just falls through to the plain error.
   */
  private emitJoinFailure(
    client: Socket,
    mssv: string | null,
    code: 'SESSION_NOT_FOUND' | 'INVALID_INPUT',
    message: string,
  ): void {
    if (mssv) {
      const result = this.agentJoinLocks.recordFailure(mssv);
      if (result.locked) {
        this.emitJoinError(
          client,
          'RATE_LIMITED',
          'Quá nhiều lần thử sai. Vui lòng thử lại sau.',
          result.retryAfterMs,
        );
        return;
      }
    }
    this.emitJoinError(client, code, message);
  }

  /**
   * Pulls a usable MSSV out of the raw `agent:join` payload, before any
   * class-validator pass — spec §5.2's lock check has to run ahead of full
   * DTO validation (see the call site), so it needs the studentId straight
   * off the wire. Returns null rather than the raw value when it isn't
   * even shaped like a real MSSV: the lock store is keyed by MSSV, and
   * there is nothing meaningful to lock out for a value that could never
   * belong to a real student either way.
   */
  private extractCandidateMssv(body: Record<string, unknown>): string | null {
    const raw = body.studentId;
    return typeof raw === 'string' && STUDENT_MSSV_REGEX.test(raw) ? raw : null;
  }

  private emitSubscribeError(client: Socket, code: TeacherSubscribeErrorCode, message: string): void {
    const error: TeacherSubscribeError = { code, message };
    client.emit('teacher:subscribe:error', error);
  }

}

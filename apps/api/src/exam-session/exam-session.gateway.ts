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
import { isPlainObject } from '../common/exam-live-socket';
import { AgentJoinDto } from './dto/agent-join.dto';
import { TeacherSubscribeDto } from './dto/teacher-subscribe.dto';
import { ExamSessionService } from './exam-session.service';
import { ExamFinalizeReason, ExamSessionEvents } from './exam-session.events';
import { EnrollmentService } from '../course/enrollment.service';

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
}

// NOT_ENROLLED closes CLAUDE.md Security rule 1: knowing the session code
// is not access. Every refusal here has a human override — see the
// access-request flow — because a student missing from an imported roster
// must not be locked out of an exam with no recourse.
type AgentJoinErrorCode =
  | 'SESSION_NOT_FOUND'
  | 'SESSION_NOT_ACTIVE'
  | 'INVALID_INPUT'
  | 'NOT_ENROLLED';

interface AgentJoinError {
  code: AgentJoinErrorCode;
  message: string;
}

interface LobbyStudentJoined {
  studentId: string;
  fullName: string;
  joinedAt: string;
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
      this.emitJoinError(
        client,
        'INVALID_INPUT',
        'fullName, studentId, and sessionCode are required and must be within length limits.',
      );
      return;
    }

    const dto = plainToInstance(AgentJoinDto, body ?? {});
    const errors = await validate(dto);
    if (errors.length > 0) {
      this.emitJoinError(
        client,
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
      this.emitJoinError(client, 'SESSION_NOT_FOUND', 'No exam session matches this code.');
      return;
    }

    const now = Date.now();
    const isActive =
      session.status === 'active' &&
      now >= session.startTime.getTime() &&
      now <= session.endTime.getTime();
    if (!isActive) {
      this.emitJoinError(client, 'SESSION_NOT_ACTIVE', 'This exam session is not currently active.');
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

    const ack: AgentJoinAck = {
      examSessionId: session.id,
      sessionName: session.name,
      studentName: enrollment.studentName,
      requiredFiles: deliverables.map((deliverable) => deliverable.requiredFilename),
      requiredDeliverables: deliverables.map((deliverable) => ({
        id: deliverable.id,
        requiredFilename: deliverable.requiredFilename,
        deliverableType: deliverable.deliverableType,
      })),
      endTime: session.endTime.toISOString(),
    };
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

    const token = this.extractAccessTokenFromCookie(client.handshake.headers.cookie);
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

  private emitJoinError(client: Socket, code: AgentJoinErrorCode, message: string): void {
    const error: AgentJoinError = { code, message };
    client.emit('agent:join:error', error);
  }

  private emitSubscribeError(client: Socket, code: TeacherSubscribeErrorCode, message: string): void {
    const error: TeacherSubscribeError = { code, message };
    client.emit('teacher:subscribe:error', error);
  }

  // Cookie header comes across as one raw string, e.g.
  // "access_token=xyz; other=1" — pulling one value out of it doesn't
  // need a full cookie-parsing dependency (`cookie` is only a transitive
  // dependency of cookie-parser here, not declared in this package's own
  // package.json, and this pnpm workspace doesn't hoist phantom deps).
  private extractAccessTokenFromCookie(cookieHeader: string | undefined): string | null {
    if (!cookieHeader) {
      return null;
    }
    for (const pair of cookieHeader.split(';')) {
      const separatorIndex = pair.indexOf('=');
      if (separatorIndex === -1) {
        continue;
      }
      const key = pair.slice(0, separatorIndex).trim();
      if (key === 'access_token') {
        const rawValue = pair.slice(separatorIndex + 1).trim();
        try {
          return decodeURIComponent(rawValue);
        } catch {
          return rawValue;
        }
      }
    }
    return null;
  }
}

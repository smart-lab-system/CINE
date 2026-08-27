import { ForbiddenException, Logger, NotFoundException } from '@nestjs/common';
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
import { AccessTokenPayload } from '../auth/types';
import { AgentJoinDto } from './dto/agent-join.dto';
import { TeacherSubscribeDto } from './dto/teacher-subscribe.dto';
import { ExamSessionService } from './exam-session.service';

// Server -> Agent, exactly these 4 fields per the WebSocket Event Contract
// — no teacher_id, no other ExamSession field leaks to the agent.
interface AgentJoinAck {
  examSessionId: string;
  sessionName: string;
  requiredFiles: string[];
  endTime: string;
}

type AgentJoinErrorCode = 'SESSION_NOT_FOUND' | 'SESSION_NOT_ACTIVE' | 'INVALID_INPUT';

interface AgentJoinError {
  code: AgentJoinErrorCode;
  message: string;
}

interface LobbyStudentJoined {
  studentId: string;
  fullName: string;
  joinedAt: string;
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

function examSessionRoom(examSessionId: string): string {
  return `exam-session:${examSessionId}`;
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
export class ExamSessionGateway implements OnGatewayDisconnect {
  @WebSocketServer()
  private readonly server!: Server;

  private readonly logger = new Logger(ExamSessionGateway.name);

  constructor(
    private readonly examSessions: ExamSessionService,
    private readonly jwt: JwtService,
  ) {}

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

    const deliverables = await this.examSessions.listRequiredDeliverables(session.id);

    // Stashed on the socket for handleDisconnect — a disconnecting socket
    // has no other way to know which room/student it was.
    client.data.studentId = dto.studentId;
    client.data.examSessionId = session.id;

    const room = examSessionRoom(session.id);
    await client.join(room);

    const ack: AgentJoinAck = {
      examSessionId: session.id,
      sessionName: session.name,
      requiredFiles: deliverables.map((deliverable) => deliverable.requiredFilename),
      endTime: session.endTime.toISOString(),
    };
    client.emit('agent:join:ack', ack);

    // Broadcast to the room WITHOUT echoing back to the agent that just
    // joined — `client.to(room)`, never `this.server.to(room)`.
    const joined: LobbyStudentJoined = {
      studentId: dto.studentId,
      fullName: dto.fullName,
      joinedAt: new Date().toISOString(),
    };
    client.to(room).emit('lobby:student_joined', joined);
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

    await client.join(examSessionRoom(examSessionId));
  }

  /**
   * Broadcasts `agent:disconnected` if this socket had successfully
   * joined a session as an agent. Teacher sockets (and agent sockets that
   * never got past `agent:join`) never set `client.data.studentId`, so
   * this is a no-op for them.
   */
  handleDisconnect(client: Socket): void {
    const studentId = client.data?.studentId as string | undefined;
    const examSessionId = client.data?.examSessionId as string | undefined;
    if (!studentId || !examSessionId) {
      return;
    }

    const disconnected: AgentDisconnected = {
      studentId,
      disconnectedAt: new Date().toISOString(),
    };
    this.server.to(examSessionRoom(examSessionId)).emit('agent:disconnected', disconnected);
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

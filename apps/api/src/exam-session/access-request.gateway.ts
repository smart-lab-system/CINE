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
import { teacherRoom } from '../common/exam-live-rooms';
import { extractAccessTokenFromCookie, isPlainObject } from '../common/exam-live-socket';
import { AuditLogService } from '../admin/audit-log.service';
import { CourseService } from '../course/course.service';
import { EnrollmentService } from '../course/enrollment.service';
import { ExamSessionService } from './exam-session.service';
import { AccessRequestStore, PendingAccessRequest } from './access-request.store';
import { RequestAccessDto, ResolveAccessRequestDto } from './dto/access-request.dto';

type AccessErrorCode =
  | 'SESSION_NOT_FOUND'
  | 'INVALID_INPUT'
  | 'ALREADY_ENROLLED'
  | 'REQUEST_NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'CLASS_REQUIRED';

interface AccessAckError {
  ok: false;
  code: AccessErrorCode;
  message: string;
}

type RequestAccessAck = { ok: true; requestId: string } | AccessAckError;
type ResolveAccessAck = { ok: true } | AccessAckError;

/** Server -> teacher room. Carries student data, so this room only. */
interface LobbyAccessRequest {
  requestId: string;
  studentId: string;
  fullName: string;
  reason: string;
  requestedAt: string;
}

/**
 * The human override for `agent:join`'s enrollment check.
 *
 * Enforcing Security rule 1 without this would trade a security gap for an
 * availability one: a student the registrar missed would be locked out on
 * exam day with nothing anyone could do. The machine enforces, a human can
 * open, and every opening is written to `audit_log`.
 *
 * A separate gateway on the same namespace because ExamSessionGateway is at
 * CLAUDE.md's 500-line limit — the same split SubmissionGateway already
 * uses. `client.data` and the teacher rooms are shared across all three.
 */
@WebSocketGateway({
  namespace: '/exam-live',
  cors: {
    origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000',
    credentials: true,
  },
})
export class AccessRequestGateway implements OnGatewayDisconnect {
  @WebSocketServer()
  private readonly server!: Server;

  private readonly logger = new Logger(AccessRequestGateway.name);

  constructor(
    private readonly examSessions: ExamSessionService,
    private readonly courses: CourseService,
    private readonly enrollments: EnrollmentService,
    private readonly auditLog: AuditLogService,
    private readonly pending: AccessRequestStore,
    private readonly jwt: JwtService,
  ) {}

  /**
   * Agent -> Server. Unauthenticated, exactly like `agent:join` — the whole
   * point is that this student cannot prove anything yet.
   */
  @SubscribeMessage('agent:request-access')
  async handleRequestAccess(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
  ): Promise<RequestAccessAck> {
    if (!isPlainObject(body)) {
      return fail('INVALID_INPUT', 'Dữ liệu yêu cầu không hợp lệ.');
    }
    const dto = plainToInstance(RequestAccessDto, body);
    if ((await validate(dto)).length > 0) {
      return fail('INVALID_INPUT', 'Vui lòng nhập đủ MSSV, họ tên và lý do.');
    }

    const session = await this.examSessions.findByCode(dto.sessionCode.trim().toUpperCase());
    if (!session) {
      return fail('SESSION_NOT_FOUND', 'Không tìm thấy phiên thi với mã này.');
    }

    // Nothing to approve if the roster already has them — they should just
    // join. Saying so is more useful than queueing a request the invigilator
    // would approve into a no-op.
    const existing = await this.enrollments.findForCourse(session.courseId, dto.studentId);
    if (existing) {
      return fail('ALREADY_ENROLLED', 'Bạn đã có trong danh sách — hãy thử tham gia lại.');
    }

    const request = this.pending.create({
      examSessionId: session.id,
      studentId: dto.studentId,
      fullName: dto.fullName,
      reason: dto.reason,
      socketId: client.id,
    });

    this.broadcast(session.id, request);
    this.logger.log(
      `access request ${request.requestId}: ${dto.studentId} for session ${session.id}`,
    );
    return { ok: true, requestId: request.requestId };
  }

  /**
   * Teacher -> Server. Authenticated by the httpOnly cookie on the handshake
   * and checked for ownership of the session, the same two gates
   * `teacher:subscribe` applies — otherwise any logged-in teacher could
   * admit students to any exam.
   */
  @SubscribeMessage('teacher:resolve-access-request')
  async handleResolve(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
  ): Promise<ResolveAccessAck> {
    if (!isPlainObject(body)) {
      return fail('INVALID_INPUT', 'Dữ liệu không hợp lệ.');
    }
    const dto = plainToInstance(ResolveAccessRequestDto, body);
    if ((await validate(dto)).length > 0) {
      return fail('INVALID_INPUT', 'Dữ liệu không hợp lệ.');
    }

    const request = this.pending.get(dto.requestId);
    if (!request) {
      // Already resolved by another invigilator, or the student gave up and
      // disconnected. Not an error worth alarming anyone about.
      return fail('REQUEST_NOT_FOUND', 'Yêu cầu này không còn chờ xử lý.');
    }

    const actor = await this.authenticate(client);
    if (!actor) {
      return fail('UNAUTHORIZED', 'Phiên đăng nhập không hợp lệ.');
    }

    let session;
    try {
      session = await this.examSessions.findByIdForOwner(request.examSessionId, actor.sub);
    } catch (error) {
      if (error instanceof ForbiddenException) {
        this.logger.warn(
          `resolve refused: ${actor.sub} does not own session ${request.examSessionId}`,
        );
        return fail('FORBIDDEN', 'Bạn không phải là chủ của phiên thi này.');
      }
      if (error instanceof NotFoundException) {
        return fail('SESSION_NOT_FOUND', 'Không tìm thấy phiên thi.');
      }
      throw error;
    }

    if (!dto.approve) {
      this.pending.remove(request.requestId);
      this.server.to(request.socketId).emit('agent:access-denied', {
        examSessionId: request.examSessionId,
        message: 'Giảng viên đã từ chối yêu cầu. Hãy liên hệ giám thị.',
      });
      this.logger.log(`access request ${request.requestId} denied by ${actor.sub}`);
      return { ok: true };
    }

    if (!dto.homeClassId) {
      // Approving writes an enrollment, and an enrollment names the class a
      // submission gets routed to. Refusing here is what keeps that from
      // being inferred.
      return fail('CLASS_REQUIRED', 'Hãy chọn lớp cho sinh viên này trước khi duyệt.');
    }

    const homeClass = await this.courses.findClassForCourse(session.courseId, dto.homeClassId);
    if (!homeClass) {
      return fail('CLASS_REQUIRED', 'Lớp được chọn không thuộc môn thi này.');
    }

    await this.enrollments.addManually({
      courseId: session.courseId,
      studentMssv: request.studentId,
      studentName: request.fullName,
      homeClassId: homeClass.id,
      homeTeacherId: homeClass.teacherId,
    });

    // Written before the student is told, so a trace can never be missing for
    // access that was actually granted.
    await this.auditLog.recordUserAction({
      actorId: actor.sub,
      action: 'exam_session.access_granted',
      targetType: 'exam_session',
      targetId: session.id,
      newValue: {
        studentMssv: request.studentId,
        studentName: request.fullName,
        reason: request.reason,
        homeClassId: homeClass.id,
      },
    });

    this.pending.remove(request.requestId);
    this.server.to(request.socketId).emit('agent:access-granted', {
      examSessionId: session.id,
      message: 'Giảng viên đã duyệt. Đang vào phòng thi...',
    });
    this.logger.log(
      `access request ${request.requestId} approved by ${actor.sub} for ${request.studentId}`,
    );
    return { ok: true };
  }

  /**
   * A student who closes the agent while waiting should stop occupying a card
   * the invigilator would otherwise have to clear by hand.
   */
  handleDisconnect(client: Socket): void {
    this.pending.removeForSocket(client.id);
  }

  /** Also used by ExamSessionGateway to replay pending requests on subscribe. */
  broadcast(examSessionId: string, request: PendingAccessRequest): void {
    const payload: LobbyAccessRequest = {
      requestId: request.requestId,
      studentId: request.studentId,
      fullName: request.fullName,
      reason: request.reason,
      requestedAt: request.requestedAt,
    };
    this.server.to(teacherRoom(examSessionId)).emit('lobby:access_request', payload);
  }

  private async authenticate(client: Socket): Promise<AccessTokenPayload | null> {
    const token = extractAccessTokenFromCookie(client.handshake.headers.cookie);
    if (!token) {
      return null;
    }
    try {
      return await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        secret: process.env.ACCESS_TOKEN_SECRET,
      });
    } catch {
      return null;
    }
  }
}

function fail(code: AccessErrorCode, message: string): AccessAckError {
  return { ok: false, code, message };
}

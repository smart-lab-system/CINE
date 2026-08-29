import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Server, Socket } from 'socket.io';
import { teacherRoom } from '../common/exam-live-rooms';
import { AgentSocketIdentity, isPlainObject, readAgentIdentity } from '../common/exam-live-socket';
import { SubmissionService } from './submission.service';
import { RequestUploadUrlDto } from './dto/request-upload-url.dto';
import { ConfirmSubmissionDto } from './dto/confirm-submission.dto';
import {
  ConfirmSubmissionAck,
  RequestUploadUrlAck,
  SubmissionAckError,
  SubmissionErrorCode,
} from './submission.types';

/**
 * The submission half of the `/exam-live` namespace.
 *
 * A second gateway on the SAME namespace rather than more handlers in
 * ExamSessionGateway: that file is already near CLAUDE.md's 500-line
 * soft limit, and these handlers are a different concern. Nest attaches
 * both to one Socket.IO namespace, so `client.data` written by
 * `agent:join` over there is readable here, and `server.to(teacherRoom())`
 * reaches the same teachers.
 *
 * Both handlers reply through Socket.IO's acknowledgement callback rather
 * than a matching `:ack`/`:error` event pair. That is what the phase
 * contract specifies, and it means a reply can never be delivered to the
 * wrong in-flight request when an agent uploads several deliverables
 * concurrently.
 */
@WebSocketGateway({
  namespace: '/exam-live',
  cors: {
    origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000',
    credentials: true,
  },
})
export class SubmissionGateway {
  @WebSocketServer()
  private readonly server!: Server;

  private readonly logger = new Logger(SubmissionGateway.name);

  constructor(private readonly submissions: SubmissionService) {}

  /**
   * Agent -> Server. Answers with a presigned PUT for one deliverable.
   */
  @SubscribeMessage('submission:request-upload-url')
  async handleRequestUploadUrl(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
  ): Promise<RequestUploadUrlAck> {
    const parsed = await this.authorize(client, body, RequestUploadUrlDto);
    if (!parsed.ok) {
      return parsed.error;
    }

    try {
      return await this.submissions.requestUploadUrl(parsed.identity, parsed.dto);
    } catch (error) {
      // Never let an exception escape into Nest's generic WS error event:
      // the agent is waiting on this callback and would otherwise hang
      // until its own timeout.
      this.logger.error(
        `submission:request-upload-url failed for ${parsed.identity.studentId}`,
        error instanceof Error ? error.stack : String(error),
      );
      return fail('STORAGE_UNAVAILABLE', 'Could not issue an upload URL. Please retry.');
    }
  }

  /**
   * Agent -> Server, after the PUT succeeded. Verifies the object really
   * landed, writes the Submission row, and tells the teacher room.
   */
  @SubscribeMessage('submission:confirm')
  async handleConfirm(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
  ): Promise<ConfirmSubmissionAck> {
    const parsed = await this.authorize(client, body, ConfirmSubmissionDto);
    if (!parsed.ok) {
      return parsed.error;
    }

    try {
      const { ack, broadcast } = await this.submissions.confirmSubmission(
        parsed.identity,
        parsed.dto,
      );
      if (broadcast) {
        // Teacher room only. The agent room is unauthenticated, and this
        // payload names a student — see exam-live-rooms.ts.
        this.server
          .to(teacherRoom(parsed.identity.examSessionId))
          .emit('lobby:submission_status', broadcast);
      }
      return ack;
    } catch (error) {
      this.logger.error(
        `submission:confirm failed for ${parsed.identity.studentId}`,
        error instanceof Error ? error.stack : String(error),
      );
      return fail('STORAGE_UNAVAILABLE', 'Could not record the submission. Please retry.');
    }
  }

  /**
   * Shape-validates the payload, then checks it against the identity this
   * socket actually joined as.
   *
   * The identity check is the security property of this file. An agent
   * connection is unauthenticated — it presents only a session code — so
   * the examSessionId/studentId in the payload are claims, not credentials.
   * Trusting them would let any connected agent request an upload URL for,
   * and overwrite, any classmate's deliverable. `client.data` was written by
   * `agent:join` after that handler resolved the session itself, so it is
   * the only identity here that means anything.
   */
  private async authorize<T extends { examSessionId: string; studentId: string }>(
    client: Socket,
    body: unknown,
    dtoClass: new () => T,
  ): Promise<
    | { ok: true; identity: AgentSocketIdentity; dto: T }
    | { ok: false; error: SubmissionAckError }
  > {
    if (!isPlainObject(body)) {
      return { ok: false, error: fail('NOT_JOINED', 'Malformed submission payload.') };
    }

    const dto = plainToInstance(dtoClass, body);
    const errors = await validate(dto as object);
    if (errors.length > 0) {
      return {
        ok: false,
        error: fail(
          'DELIVERABLE_NOT_FOUND',
          'Submission payload failed validation (check ids, checksum and fileSize).',
        ),
      };
    }

    const identity = readAgentIdentity(client);
    if (!identity) {
      return {
        ok: false,
        error: fail('NOT_JOINED', 'This connection has not joined an exam session.'),
      };
    }

    if (
      dto.examSessionId !== identity.examSessionId ||
      dto.studentId !== identity.studentId
    ) {
      this.logger.warn(
        `submission payload identity mismatch on socket ${client.id}: claimed ` +
          `${dto.studentId}@${dto.examSessionId}, joined as ` +
          `${identity.studentId}@${identity.examSessionId}`,
      );
      return {
        ok: false,
        error: fail(
          'NOT_JOINED',
          'The payload does not match the session and student this connection joined as.',
        ),
      };
    }

    return { ok: true, identity, dto };
  }
}

function fail(code: SubmissionErrorCode, message: string): SubmissionAckError {
  return { ok: false, code, message };
}

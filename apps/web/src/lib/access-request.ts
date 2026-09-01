import { socket } from '@/lib/socket';

/**
 * The teacher side of the access-request valve — client for
 * apps/api/src/exam-session/access-request.gateway.ts's
 * `teacher:resolve-access-request`.
 *
 * Not under lib/api/ with the rest of the REST wrappers: this is a
 * socket.io emit-with-ack, not a `fetch`, and mixing the two under one
 * folder would make every file there look interchangeable when they are
 * not — a REST call gets its own connection per request, this reuses the
 * one shared socket the lobby page already keeps open.
 */

export interface PendingAccessRequest {
  requestId: string;
  studentId: string;
  fullName: string;
  reason: string;
  requestedAt: string;
}

export type AccessRequestErrorCode =
  | 'SESSION_NOT_FOUND'
  | 'INVALID_INPUT'
  | 'ALREADY_ENROLLED'
  | 'REQUEST_NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'CLASS_REQUIRED';

export type ResolveAccessRequestAck =
  | { ok: true }
  | { ok: false; code: AccessRequestErrorCode; message: string };

export interface ResolveAccessRequestPayload {
  requestId: string;
  approve: boolean;
  /** Required to approve, ignored to reject — the server enforces this,
   *  not this function. */
  homeClassId?: string;
}

const ACK_TIMEOUT_MS = 15_000;

export function resolveAccessRequest(
  payload: ResolveAccessRequestPayload,
): Promise<ResolveAccessRequestAck> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('Máy chủ không phản hồi yêu cầu duyệt trong thời gian cho phép.'));
    }, ACK_TIMEOUT_MS);

    socket.emit('teacher:resolve-access-request', payload, (ack: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // The server is not a trusted source for shape any more than the
      // client is — same stance the agent CLI takes with its own acks.
      if (typeof ack !== 'object' || ack === null || Array.isArray(ack)) {
        reject(new Error('Máy chủ trả về phản hồi không hợp lệ.'));
        return;
      }
      resolve(ack as ResolveAccessRequestAck);
    });
  });
}

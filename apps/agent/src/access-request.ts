/**
 * The student side of the access-request valve.
 *
 * `agent:join` now refuses a student with no Enrollment for the course. That
 * closes the security hole, but on its own it would strand a student the
 * registrar missed — on exam day, with nothing they can do. This is the way
 * out: ask, wait for the invigilator, and join if they say yes.
 *
 * Client side of the contract in
 * apps/api/src/exam-session/access-request.gateway.ts. The Electron app's
 * own form (electron/renderer/src/components/JoinScreen.tsx's
 * AccessRequestForm, states f/g) collects fullName/reason and calls
 * `sendAccessRequest` below directly — the readline-based prompt this file
 * used to also export (`promptAccessRequest`, for `cli.ts`'s terminal UI,
 * plus the `NoTerminalError` it threw when there was no TTY to ask
 * through) was removed when `cli.ts` was retired (design spec §8.4);
 * nothing else ever called either one.
 */

import type { Socket } from 'socket.io-client';

export interface RequestAccessPayload {
  sessionCode: string;
  studentId: string;
  fullName: string;
  reason: string;
}

export type AccessErrorCode =
  | 'SESSION_NOT_FOUND'
  | 'INVALID_INPUT'
  | 'ALREADY_ENROLLED'
  | 'REQUEST_NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'CLASS_REQUIRED';

export type RequestAccessAck =
  | { ok: true; requestId: string }
  | { ok: false; code: AccessErrorCode; message: string };

/** How long to wait for the acknowledgement, not for the human decision. */
const ACK_TIMEOUT_MS = 20_000;

/**
 * Sends the request and resolves with the server's acknowledgement. The
 * acknowledgement only means "the invigilator can see it now" — the decision
 * arrives later as `agent:access-granted` or `agent:access-denied`.
 */
export function sendAccessRequest(
  socket: Socket,
  payload: RequestAccessPayload,
): Promise<RequestAccessAck> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`server không phản hồi yêu cầu trong ${ACK_TIMEOUT_MS}ms`));
    }, ACK_TIMEOUT_MS);

    socket.emit('agent:request-access', payload, (ack: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // The server is not a trusted source for shape, the same stance the
      // rest of this agent takes with every reply.
      if (typeof ack !== 'object' || ack === null || Array.isArray(ack)) {
        reject(new Error('server trả về agent:request-access không hợp lệ'));
        return;
      }
      resolve(ack as RequestAccessAck);
    });
  });
}

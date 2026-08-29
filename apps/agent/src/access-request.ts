/**
 * The student side of the access-request valve.
 *
 * `agent:join` now refuses a student with no Enrollment for the course. That
 * closes the security hole, but on its own it would strand a student the
 * registrar missed — on exam day, with nothing they can do. This is the way
 * out: ask, wait for the invigilator, and join if they say yes.
 *
 * Extracted from cli.ts rather than added to it: that file is already a long
 * argument parser plus a socket lifecycle, and this is a self-contained
 * conversation with its own prompts.
 *
 * Client side of the contract in
 * apps/api/src/exam-session/access-request.gateway.ts.
 */

import * as readline from 'node:readline/promises';
import process from 'node:process';
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
 * Thrown when there is no terminal to ask through. The caller reports it and
 * exits rather than waiting on input that can never arrive.
 */
export class NoTerminalError extends Error {
  constructor() {
    super('không có terminal để nhập thông tin');
    this.name = 'NoTerminalError';
  }
}

/**
 * Asks the two things the server cannot supply for someone who is not on the
 * roster: who they say they are, and why they should be let in. Both go on
 * the invigilator's screen, so a blank answer helps nobody.
 */
export async function promptAccessRequest(studentId: string): Promise<{
  fullName: string;
  reason: string;
}> {
  // Without a TTY there is nobody to answer, and readline would wait for
  // a line that never comes — the agent would hang silently at the exact
  // moment a student needs it to say something. Piped input is no
  // substitute either: readline delivers buffered lines as fast as it can
  // read them, so the second prompt loses its answer to the first.
  if (!process.stdin.isTTY) {
    throw new NoTerminalError();
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log('');
    console.log(`MSSV ${studentId} không có trong danh sách lớp của môn thi này.`);
    console.log('Bạn có thể gửi yêu cầu để giảng viên duyệt cho vào thi.');
    const fullName = await askNonEmpty(rl, 'Họ và tên của bạn: ');
    const reason = await askNonEmpty(rl, 'Lý do (vd: đăng ký muộn, thi bù): ');
    return { fullName, reason };
  } finally {
    rl.close();
  }
}

async function askNonEmpty(rl: readline.Interface, question: string): Promise<string> {
  for (;;) {
    const answer = (await rl.question(question)).trim();
    if (answer.length > 0) {
      return answer;
    }
    console.log('Giá trị không được để trống, vui lòng nhập lại.');
  }
}

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

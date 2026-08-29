/**
 * The finalize -> upload loop, shared by the real agent (src/cli.ts) and
 * the mock agent (src/mock-agent.ts).
 *
 * The two differ only in where a deliverable's bytes come from — the real
 * agent reads the student's file off disk, the mock agent synthesizes it in
 * memory — so that is the single injected dependency (`readContent`).
 * Everything else, including the exact order of request-upload-url -> PUT ->
 * confirm and every failure rule, is identical, and must stay that way:
 * a mock agent that uploads differently from the real one tests nothing.
 *
 * Client side of the WebSocket Event Contract implemented by
 * apps/api/src/submission/submission.gateway.ts.
 */

import { createHash } from 'node:crypto';
import type { Socket } from 'socket.io-client';

// ---------------------------------------------------------------------------
// Contract shapes
// ---------------------------------------------------------------------------

/** One entry of `agent:join:ack`.requiredDeliverables. */
export interface RequiredDeliverable {
  id: string;
  requiredFilename: string;
  deliverableType: string;
}

/** Server -> agents, broadcast when a session is finalized. */
export interface ExamFinalizePayload {
  examSessionId: string;
  reason: 'scheduled' | 'manual';
}

export type SubmissionErrorCode =
  | 'NOT_JOINED'
  | 'DELIVERABLE_NOT_FOUND'
  | 'SESSION_NOT_FINALIZING'
  | 'STORAGE_KEY_MISMATCH'
  | 'OBJECT_NOT_FOUND'
  | 'STORAGE_UNAVAILABLE';

export interface SubmissionAckError {
  ok: false;
  code: SubmissionErrorCode;
  message: string;
}

export type RequestUploadUrlAck =
  | { ok: true; uploadUrl: string; storageKey: string; expiresIn: number }
  | SubmissionAckError;

export type ConfirmSubmissionAck =
  | { ok: true; status: string; submittedAt: string }
  | SubmissionAckError;

// ---------------------------------------------------------------------------
// Result reporting
// ---------------------------------------------------------------------------

export type DeliverableOutcome = 'uploaded' | 'missing' | 'failed';

export interface DeliverableResult {
  deliverable: RequiredDeliverable;
  outcome: DeliverableOutcome;
  /** Bytes actually PUT — only set when `outcome` is 'uploaded'. */
  byteLength?: number;
  /** Why it did not upload — set for 'missing' and 'failed'. */
  reason?: string;
}

export interface UploadSummary {
  results: DeliverableResult[];
  uploaded: number;
  missing: number;
  failed: number;
  total: number;
  elapsedMs: number;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/**
 * How long to wait for the server's acknowledgement callback. Socket.IO
 * gives no answer at all if a handler throws before replying, and an agent
 * that waits forever at the end of an exam is worse than one that reports a
 * failure the student can be told about.
 */
const ACK_TIMEOUT_MS = 30_000;

/** PUT timeout, per deliverable. Generous — a lab network under load. */
const PUT_TIMEOUT_MS = 120_000;

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------

/**
 * Reads one deliverable's bytes. Returning `null` means "the student does
 * not have this file" — a normal, expected outcome that must not abort the
 * other uploads. Throwing means something went genuinely wrong reading it.
 */
export type ReadDeliverableContent = (
  deliverable: RequiredDeliverable,
) => Promise<Buffer | null>;

export interface UploadAllOptions {
  socket: Socket;
  examSessionId: string;
  studentId: string;
  deliverables: RequiredDeliverable[];
  readContent: ReadDeliverableContent;
  /** Per-deliverable progress line. Defaults to no output. */
  log?: (message: string) => void;
}

/**
 * Uploads every deliverable, sequentially.
 *
 * Sequential rather than parallel on purpose: an exam ends for 40 machines
 * at the same instant, and each one firing all its uploads at once turns a
 * staggered load into a spike. The count per student is small (2-5 files),
 * so the serial cost is a few seconds.
 *
 * One deliverable failing NEVER stops the others. A student who deleted
 * Cau2.docx must still have Cau1.docx and Cau3.docx collected — losing the
 * whole submission over one missing file would be the single worst bug this
 * code could have.
 */
export async function uploadAllDeliverables(
  options: UploadAllOptions,
): Promise<UploadSummary> {
  const { socket, examSessionId, studentId, deliverables, readContent } = options;
  const log = options.log ?? (() => {});
  const startedAt = Date.now();
  const results: DeliverableResult[] = [];

  for (const deliverable of deliverables) {
    results.push(
      await uploadOne(socket, examSessionId, studentId, deliverable, readContent, log),
    );
  }

  const uploaded = results.filter((r) => r.outcome === 'uploaded').length;
  const missing = results.filter((r) => r.outcome === 'missing').length;
  const failed = results.filter((r) => r.outcome === 'failed').length;

  return {
    results,
    uploaded,
    missing,
    failed,
    total: deliverables.length,
    elapsedMs: Date.now() - startedAt,
  };
}

async function uploadOne(
  socket: Socket,
  examSessionId: string,
  studentId: string,
  deliverable: RequiredDeliverable,
  readContent: ReadDeliverableContent,
  log: (message: string) => void,
): Promise<DeliverableResult> {
  const label = deliverable.requiredFilename;

  let content: Buffer | null;
  try {
    content = await readContent(deliverable);
  } catch (error) {
    const reason = describe(error);
    log(`  [LỖI] ${label}: không đọc được file — ${reason}`);
    return { deliverable, outcome: 'failed', reason };
  }

  if (content === null) {
    // The student never created it, or deleted it. Reported, not fatal.
    log(`  [THIẾU] ${label}: không tìm thấy file, bỏ qua và nộp tiếp các file khác.`);
    return { deliverable, outcome: 'missing', reason: 'file không tồn tại' };
  }

  // Computed here, before the upload, over exactly the bytes about to be
  // sent — so the checksum the server stores always describes what was
  // actually PUT, not what was on disk at some other moment.
  const checksum = createHash('sha256').update(content).digest('hex');

  try {
    const urlAck = await emitWithAck<RequestUploadUrlAck>(
      socket,
      'submission:request-upload-url',
      { examSessionId, studentId, requiredDeliverableId: deliverable.id },
    );
    if (!urlAck.ok) {
      const reason = `${urlAck.code}: ${urlAck.message}`;
      log(`  [LỖI] ${label}: server từ chối cấp URL — ${reason}`);
      return { deliverable, outcome: 'failed', reason };
    }

    const put = await fetchWithTimeout(urlAck.uploadUrl, {
      method: 'PUT',
      body: new Uint8Array(content),
    });
    if (!put.ok) {
      const reason = `PUT trả về HTTP ${put.status}`;
      log(`  [LỖI] ${label}: tải file lên thất bại — ${reason}`);
      return { deliverable, outcome: 'failed', reason };
    }

    const confirmAck = await emitWithAck<ConfirmSubmissionAck>(
      socket,
      'submission:confirm',
      {
        examSessionId,
        studentId,
        requiredDeliverableId: deliverable.id,
        storageKey: urlAck.storageKey,
        checksum,
        fileSize: content.byteLength,
      },
    );
    if (!confirmAck.ok) {
      const reason = `${confirmAck.code}: ${confirmAck.message}`;
      log(`  [LỖI] ${label}: server không ghi nhận bài nộp — ${reason}`);
      return { deliverable, outcome: 'failed', reason };
    }

    log(`  [OK] ${label}: đã nộp (${content.byteLength} bytes).`);
    return { deliverable, outcome: 'uploaded', byteLength: content.byteLength };
  } catch (error) {
    const reason = describe(error);
    log(`  [LỖI] ${label}: ${reason}`);
    return { deliverable, outcome: 'failed', reason };
  }
}

/**
 * Socket.IO acknowledgement with a timeout and a shape guard.
 *
 * The server is not a trusted input source for shape any more than the
 * client is — the same stance cli.ts already takes with `agent:join:ack`.
 * A malformed ack must surface as a failed deliverable, not as a TypeError
 * thrown inside a socket callback where nothing can catch it.
 */
function emitWithAck<T extends { ok: boolean }>(
  socket: Socket,
  event: string,
  payload: unknown,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`server không phản hồi ${event} trong ${ACK_TIMEOUT_MS}ms`));
    }, ACK_TIMEOUT_MS);

    socket.emit(event, payload, (ack: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (typeof ack !== 'object' || ack === null || Array.isArray(ack)) {
        reject(new Error(`server trả về ${event} không hợp lệ (không phải object)`));
        return;
      }
      if (typeof (ack as { ok?: unknown }).ok !== 'boolean') {
        reject(new Error(`server trả về ${event} thiếu trường "ok"`));
        return;
      }
      resolve(ack as T);
    });
  });
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  // Without this, a storage host that accepts the connection and then goes
  // quiet would hang the whole upload loop past the end of the exam.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PUT_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The one-line summary both agents print when the loop finishes. Shared so
 * the mock agent's output stays directly comparable to the real one's.
 */
export function formatSummary(summary: UploadSummary): string {
  const parts = [`Đã nộp ${summary.uploaded}/${summary.total} file bắt buộc.`];
  if (summary.missing > 0) {
    parts.push(`${summary.missing} file thiếu.`);
  }
  if (summary.failed > 0) {
    parts.push(`${summary.failed} file lỗi.`);
  }
  parts.push(`(${summary.elapsedMs}ms)`);
  return parts.join(' ');
}

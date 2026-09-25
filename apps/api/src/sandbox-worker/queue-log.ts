import { EventEmitter } from 'node:events';
import { throttledErrorLog } from '../shared/redis-connection';

/**
 * Worker của BullMQ không có listener nào thì hỏng IM LẶNG: lỗi kết nối chỉ ra `console.error`
 * thô của BullMQ, không nói hàng đợi nào; job mà handler ném thì không để lại dòng nào ở máy
 * sandbox — phía API chỉ thấy "sandbox không trả lời". `label` = hàng đợi và nguồn, vd.
 * `exec (eval)`. Lỗi kết nối được gộp; job hỏng thì mỗi job một dòng (mỗi jobId là một ngữ cảnh).
 */
export function logWorkerEvents(
  worker: EventEmitter,
  label: string,
  log: (line: string) => void,
  opts: { now?: () => number } = {},
): void {
  const report = throttledErrorLog(log, opts);
  worker.on('error', (error: unknown) => report(`LỖI hàng đợi ${label}`, error));
  worker.on('failed', (job: { id?: string } | undefined, error: unknown) =>
    report(`LỖI job ${label} ${job?.id ?? '?'}`, error),
  );
}

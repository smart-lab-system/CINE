import type { GradingProgress } from '@/lib/api/grading';

/**
 * Bài "kẹt": còn việc đang chấm nhưng hàng đợi không còn việc nào sống. Công thức giữ nguyên như trước, chỉ tách
 * ra để khối đang chấm (nói cho giảng viên biết) và đầu phiên (nút chấm lại duy nhất) cùng dùng một phép đếm.
 *
 * Không tính khi máy mất mạng hoặc máy chủ không trả lời: lúc đó không biết hàng đợi có sống hay không.
 */
export function isStuck(progress: GradingProgress, online: boolean, progressError: Error | null): boolean {
  const serverDown = online && progressError !== null;
  const idle = progress.queue.active === 0 && progress.queue.waiting === 0;
  return online && !serverDown && progress.pending > 0 && idle;
}

/** Số bài kẹt, hoặc 0 khi không kẹt. */
export function stuckCountOf(progress: GradingProgress, online: boolean, progressError: Error | null): number {
  return isStuck(progress, online, progressError) ? (progress.byStatus.ai_grading ?? progress.pending) : 0;
}

import { canonicalStringify } from './canonical-json';
import { ToolName } from './types';

/** Hạn mức cùng chữ ký của §7.1 cho bốn công cụ của bước 2. */
export const DUPLICATE_LIMITS: Record<ToolName, number> = {
  run: 8,
  read_file: 4,
  run_tests: 2,
  list_files: 2,
};
export const MAX_CONSECUTIVE_BLOCKED = 3;

/**
 * `{tên}::{chữ ký tham số đã sắp đệ quy}` (§7.1). Khoá CHỈ theo tên là sai và đã có tiền
 * lệ đo được: nó chặn truy vấn hợp lệ, rồi model báo phần bị chặn là "không tìm thấy".
 */
export function signatureOf(tool: ToolName, args: Record<string, unknown>): string {
  return `${tool}::${canonicalStringify(args)}`;
}

export class DuplicateGuard {
  private readonly counts = new Map<string, number>();
  private consecutiveBlocked = 0;

  /** Gọi TRƯỚC khi chạy. Chặn thì trả câu nói rõ đã bị chặn — không ném (§7.1). */
  admit(
    tool: ToolName,
    args: Record<string, unknown>,
  ): { admitted: true } | { admitted: false; message: string } {
    const key = signatureOf(tool, args);
    const used = this.counts.get(key) ?? 0;
    if (used >= DUPLICATE_LIMITS[tool]) {
      this.consecutiveBlocked++;
      return {
        admitted: false,
        message:
          `Đã chặn: ${tool} với đúng tham số này đã chạy ${used} lần (tối đa ${DUPLICATE_LIMITS[tool]}). ` +
          'Kết quả sẽ không đổi — xem lại lời gọi trước, hoặc đổi tham số.',
      };
    }
    this.counts.set(key, used + 1);
    this.consecutiveBlocked = 0;
    return { admitted: true };
  }

  /** Bị chặn ≥ 3 lần LIÊN TIẾP → agent đang kẹt, không đang đào sâu (§7.1, T-AG-5). */
  get stuck(): boolean {
    return this.consecutiveBlocked >= MAX_CONSECUTIVE_BLOCKED;
  }
}

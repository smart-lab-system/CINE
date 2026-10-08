import type { RecomputeSummary } from './api/rules';
import { formatVnPoints } from './format';

/** Điểm trừ lưu dạng chuỗi thập phân ("1.50") → hiện "−1,5"; chưa có → "—". */
export function formatDeductionString(deduction: string | null): string {
  if (deduction === null) return '—';
  const n = Number(deduction);
  if (n === 0) return '0';
  return formatVnPoints(-n);
}

/** Nhãn một điểm trừ trong danh sách: "−1,5" hoặc chữ "chưa có điểm trừ". */
export function deductionLabel(deduction: string | null): string {
  return deduction === null ? 'chưa có điểm trừ' : formatDeductionString(deduction);
}

const DEDUCTION_ERROR = 'Điểm trừ: số không âm, tối đa hai chữ số lẻ.';

/**
 * Ô nhập điểm trừ → giá trị gửi lên API. Server chỉ nhận CHUỖI khớp `/^(\d{1,4})(?:\.(\d{1,2}))?$/` hoặc `null`;
 * số JSON bị 400. Nhận cả dấu phẩy (giảng viên gõ "1,5"); để trống = chưa có điểm trừ (`null`).
 */
export function parseDeductionInput(raw: string): { ok: true; value: string | null } | { ok: false; message: string } {
  const text = raw.trim();
  if (text === '') return { ok: true, value: null };
  const normalized = text.replace(',', '.');
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(normalized)) return { ok: false, message: DEDUCTION_ERROR };
  return { ok: true, value: normalized };
}

/**
 * Kết quả tính lại đọc bằng lời. `null` = lỗi do AI đọc bài không áp ngược cho bài đã chấm (T-FAIR-1) — nói ra,
 * không im lặng.
 */
export function describeRecompute(r: RecomputeSummary | null): string {
  if (r === null) return 'Lỗi này không tính lại bài nào đã chấm — chỉ áp cho phiên chấm sau.';
  if (r.recomputed === 0) return 'Không có bài nào bị ảnh hưởng.';
  const parts: string[] = [];
  if (r.promoted > 0) parts.push(`${r.promoted} bài đủ điều kiện tự quyết`);
  if (r.demoted > 0) parts.push(`${r.demoted} bài chuyển về "Cần bạn xem"`);
  if (r.belowFloor > 0) parts.push(`${r.belowFloor} bài chưa cho điểm được (dưới sàn)`);
  if (parts.length === 0) return `Đã tính lại ${r.recomputed} bài, không bài nào đổi nhóm.`;
  return `Đã tính lại ${r.recomputed} bài: ${parts.join('; ')}.`;
}

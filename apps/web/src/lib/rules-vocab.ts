import type { RecomputeSummary } from './api/rules';
import { formatVnPoints } from './format';

/**
 * Cách một luật "khớp" — đọc từ dữ liệu, không tự suy (spec §2.2):
 * - `machine`: máy đo được ở bản này (`checkedBy = 'machine'`, hôm nay chỉ mẫu *nhóm test trượt*);
 * - `unmeasured`: CÓ điều kiện (`predicate`) nhưng máy chưa đo được (`checkedBy = 'model'`, §4.6) —
 *   mô hình phán đoán luật này, và tiêu chí chứa nó tính là *chưa được kiểm tới*;
 * - `words`: không có điều kiện, mô tả bằng lời.
 *
 * `unmeasured` KHÔNG được hiện như "Máy kiểm/Máy quyết": hứa độ tin 1,0 cho thứ máy chưa đo là nói dối.
 */
export type MatchKind = 'machine' | 'unmeasured' | 'words';

export function matchKindOf(rule: { checkedBy: 'machine' | 'model'; revision: { predicate: unknown } }): MatchKind {
  if (rule.checkedBy === 'machine') return 'machine';
  return rule.revision.predicate === null || rule.revision.predicate === undefined ? 'words' : 'unmeasured';
}

export const MATCH_KIND_LABEL: Record<MatchKind, string> = {
  machine: 'Máy kiểm',
  unmeasured: 'Máy chưa đo được',
  words: 'Bằng lời',
};

const ORIGIN_LABEL: Record<string, string> = {
  teacher: 'của bạn',
  seed: 'luật mồi',
  agent_reported: 'agent đề xuất',
};

export function originLabel(origin: string): string {
  return ORIGIN_LABEL[origin] ?? origin;
}

/** Mức trừ lưu dạng chuỗi thập phân ("1.50") → hiện "−1,5"; chưa có giá → "—". */
export function formatDeductionString(deduction: string | null): string {
  if (deduction === null) return '—';
  const n = Number(deduction);
  if (n === 0) return '0';
  return formatVnPoints(-n);
}

const DEDUCTION_ERROR = 'Mức trừ: số không âm, tối đa hai chữ số lẻ.';

/**
 * Ô nhập mức trừ → giá trị gửi lên API. Server chỉ nhận CHUỖI khớp
 * `/^(\d{1,4})(?:\.(\d{1,2}))?$/` hoặc `null`; số JSON bị 400. Ở đây nhận cả dấu phẩy
 * (giảng viên gõ "1,5"), và để trống nghĩa là *chưa có giá* (`null`, gửi rõ ràng — bỏ qua thì API 400).
 */
export function parseDeductionInput(raw: string): { ok: true; value: string | null } | { ok: false; message: string } {
  const text = raw.trim();
  if (text === '') return { ok: true, value: null };
  const normalized = text.replace(',', '.');
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(normalized)) return { ok: false, message: DEDUCTION_ERROR };
  return { ok: true, value: normalized };
}

/** Khoá luật (`rule_key`, server: `/^[a-z0-9_]{1,64}$/`) sinh từ tên: bỏ dấu tiếng Việt, gạch dưới. */
export function slugifyRuleKey(name: string): string {
  const slug = name
    .replace(/[đĐ]/g, 'd')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64)
    .replace(/_+$/g, '');
  return slug === '' ? 'luat_moi' : slug;
}

/**
 * Kết quả tính lại đọc bằng lời (spec §3.1: "sau khi lưu hiện kết quả tính lại … đọc bằng lời").
 * `null` = luật bằng lời không áp ngược cho bài đã chấm (T-FAIR-1) — nói ra, không im lặng.
 */
export function describeRecompute(r: RecomputeSummary | null): string {
  if (r === null) return 'Luật này không tính lại bài nào đã chấm — chỉ áp cho phiên chấm sau.';
  if (r.recomputed === 0) return 'Không có bài nào bị ảnh hưởng.';
  const parts: string[] = [];
  if (r.promoted > 0) parts.push(`${r.promoted} bài đủ điều kiện tự quyết`);
  if (r.demoted > 0) parts.push(`${r.demoted} bài chuyển về "Cần bạn xem"`);
  if (r.belowFloor > 0) parts.push(`${r.belowFloor} bài chưa cho điểm được (dưới sàn)`);
  if (parts.length === 0) return `Đã tính lại ${r.recomputed} bài, không bài nào đổi nhóm.`;
  return `Đã tính lại ${r.recomputed} bài: ${parts.join('; ')}.`;
}

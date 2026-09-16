/**
 * Dẫn chứng model trích có THẬT SỰ nằm trong bài làm không.
 *
 * Đây là guard giá trị nhất của cả đường chấm, và nó là một PHÉP ĐO chứ
 * không phải một phán đoán: `indexOf`, 0 token, chạy được trên 100% số bài
 * mà không gọi model lần nào. Nó bắt được loại lỗi nguy hiểm nhất — AI
 * trích một câu không có trong bài rồi trừ điểm sinh viên dựa trên nó.
 * Không model nào phát hiện điều đó hộ bạn.
 *
 * FILE LEAF: không import gì. Nó phải test được mà không dựng gì cả.
 */

export type EvidenceCheck = 'ok' | 'empty' | 'unverified';

/**
 * Dưới ngưỡng này thì một trích dẫn khớp bừa vào gần như mọi văn bản.
 * "là", "và", "của" đều là chuỗi con của hầu hết bài làm tiếng Việt.
 */
export const MIN_EVIDENCE_CHARS = 10;

/**
 * Tập biến thể CHỮ IN mà model thường tự chuẩn hoá khi tái tạo trích dẫn.
 *
 * ĐẾM ĐƯỢC và HỮU HẠN — đó là toàn bộ lý do xử lý đúng tập này thay vì xoá
 * sạch dấu câu. Xoá sạch dấu câu làm phép kiểm yếu đi ở MỌI NƠI để vá một
 * chỗ hẹp, và còn xoá cả dấu nối trong thuật ngữ kỹ thuật ("top-down",
 * "quick-sort"). Khác kiểu chữ in KHÔNG BAO GIỜ là bịa đặt, nên chuẩn hoá
 * đúng chúng giảm báo động giả mà không làm yếu phép kiểm.
 */
const TYPOGRAPHIC_FOLD: [RegExp, string][] = [
  [/[‘’‚‛]/g, "'"], // ' ' ‚ ‛
  [/[“”„‟]/g, '"'], // " " „ ‟
  [/[‐-―−]/g, '-'], // ‐ ‑ ‒ – — ― −
  [/[  -   　]/g, ' '], // NBSP + khoảng trắng lạ
  [/[​-‍﻿]/g, ''], // zero-width
];

export function normalizeForMatch(s: string): string {
  let out = s.normalize('NFC');
  for (const [re, to] of TYPOGRAPHIC_FOLD) {
    out = out.replace(re, to);
  }
  return out.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Model hay rút gọn trích dẫn dài bằng "…" — cắt ra, GIỮ THỨ TỰ.
 *
 * Không xử lý elision thì mọi trích dẫn rút gọn đều bị coi là không định vị
 * được, và guard này sẽ bị tắt đi sau tuần đầu vì quá ồn.
 */
function splitElision(evidence: string): string[] {
  return evidence
    .split(/\s*(?:…|\.{3,})\s*/)
    .map(normalizeForMatch)
    .filter((part) => part.length > 0);
}

/**
 * `'unverified'`, KHÔNG phải `'fabricated'` — tên gọi có chủ đích.
 *
 * "Không định vị được" là điều ta BIẾT. "Bịa đặt" là điều ta SUY DIỄN. Một
 * hệ thống tuyên bố AI bịa đặt trong khi thật ra nó chỉ đổi một dấu ngoặc
 * là một hệ thống nói dối về chính nó — và người dùng sẽ học cách bỏ qua
 * cảnh báo của nó.
 */
export function verifyEvidence(studentText: string, evidence: string): EvidenceCheck {
  if (evidence.trim() === '') {
    // Rỗng nghĩa là sinh viên KHÔNG ĐỀ CẬP tiêu chí này. Đó là tín hiệu
    // hợp lệ — và là đầu vào của cổng Advocate — không phải lỗi.
    return 'empty';
  }

  const haystack = normalizeForMatch(studentText);
  const parts = splitElision(evidence);
  if (parts.length === 0) {
    return 'unverified';
  }

  // Mỗi mẩu phải xuất hiện SAU mẩu trước. Ràng buộc thứ tự là thứ chặn việc
  // ghép hai đoạn không liên quan từ hai chỗ xa nhau trong bài — không có
  // nó thì việc tách elision tự mở một lỗ mới.
  let cursor = 0;
  for (const part of parts) {
    if (part.length < MIN_EVIDENCE_CHARS) {
      return 'unverified';
    }
    const at = haystack.indexOf(part, cursor);
    if (at === -1) {
      return 'unverified';
    }
    cursor = at + part.length;
  }
  return 'ok';
}

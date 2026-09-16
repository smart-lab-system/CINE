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

/** Vị trí một mẩu dẫn chứng trong bài làm, theo toạ độ chuỗi ĐÃ NFC. */
export interface EvidenceSpan {
  start: number;
  /** Loại trừ, như `String.prototype.slice`. */
  end: number;
}

export interface EvidenceLocation {
  check: EvidenceCheck;
  /** Một span mỗi mẩu elision, theo thứ tự. Rỗng khi `check !== 'ok'`. */
  spans: EvidenceSpan[];
}

/**
 * Bản không trạng thái của `TYPOGRAPHIC_FOLD`, dựng MỘT LẦN lúc nạp module.
 *
 * Hai lý do, và lý do thứ hai mới là lý do nó nằm ở đây chứ không trong vòng
 * lặp:
 *
 * ① `re` gốc mang cờ `g`, và `RegExp.test` với cờ `g` NHỚ `lastIndex` giữa
 *    các lời gọi — dùng thẳng nó cho từng ký tự sẽ cho kết quả đổi theo thứ
 *    tự ký tự đi qua, tức một phép chuẩn hoá không tất định.
 * ② `new RegExp(...)` bên trong vòng lặp ký tự là ~5 lần cấp phát cho MỖI ký
 *    tự của MỖI bài — sáu chữ số cho một lượt chấm, trên đúng đường nóng mà
 *    `verifyEvidence` chạy cho mọi tiêu chí của mọi bài.
 */
const TYPOGRAPHIC_FOLD_CHAR: [RegExp, string][] = TYPOGRAPHIC_FOLD.map(
  ([re, to]) => [new RegExp(re.source), to] as [RegExp, string],
);

/** Một ký tự qua bảng gấp kiểu chữ in. Trả chuỗi vì có ca 1→0 (zero-width). */
function foldChar(ch: string): string {
  for (const [re, to] of TYPOGRAPHIC_FOLD_CHAR) {
    if (re.test(ch)) {
      return to;
    }
  }
  return ch;
}

/**
 * Chuẩn hoá KÈM bảng ánh xạ ngược về chuỗi gốc.
 *
 * Làm đúng cùng một phép biến đổi với `normalizeForMatch`, nhưng từng ký tự
 * một, nên nó ghi lại được ký tự gốc nào sinh ra ký tự chuẩn hoá nào. Thứ
 * tự PHẢI khớp bản regex: gấp kiểu chữ in TRƯỚC, gộp khoảng trắng SAU.
 * Đảo lại thì `U+FEFF` — vốn nằm trong `\s` của JS — biến thành dấu cách
 * thay vì bị xoá, và hai hàm lệch nhau đúng ở những bài có ký tự đó.
 *
 * `withMap = false` bỏ hẳn mảng ánh xạ: đường chấm gọi hàm này cho mọi tiêu
 * chí của mọi bài và không cần vị trí, nên nó không phải trả giá cho một
 * mảng n phần tử.
 */
function normalizeWithMap(
  nfc: string,
  withMap: boolean,
): { text: string; map: number[] | null } {
  const out: string[] = [];
  const map: number[] | null = withMap ? [] : null;
  let pendingSpace = false;

  for (let i = 0; i < nfc.length; i += 1) {
    const folded = foldChar(nfc[i]);
    if (folded === '') {
      continue;
    }
    if (/\s/.test(folded)) {
      // Gộp cả một dải khoảng trắng thành MỘT dấu cách, kể cả xuống dòng.
      // Đây chính là lý do một trích dẫn vắt qua hai đoạn vẫn khớp.
      pendingSpace = true;
      continue;
    }

    if (pendingSpace) {
      pendingSpace = false;
      // Không phát dấu cách ở đầu chuỗi — tương đương `.trim()` đầu.
      if (out.length > 0) {
        out.push(' ');
        map?.push(i);
      }
    }

    for (const piece of folded.toLowerCase()) {
      out.push(piece);
      map?.push(i);
    }
  }

  return { text: out.join(''), map };
}

/**
 * Dẫn chứng nằm Ở ĐÂU trong bài làm.
 *
 * `check` LUÔN bằng `verifyEvidence(studentText, evidence)` — hàm kia giờ
 * chỉ là một lời gọi tới đây, nên chúng không có cách nào bất đồng.
 *
 * Toạ độ nói về chuỗi SAU `normalize('NFC')`. Người gọi phải NFC hoá trước
 * khi cắt: tiếng Việt gõ bằng một số bộ gõ ra dạng tổ hợp, và cắt chuỗi
 * chưa NFC bằng offset của chuỗi đã NFC sẽ lệch dần theo từng dấu.
 */
export function locateEvidence(
  studentText: string,
  evidence: string,
  opts?: { spans?: boolean },
): EvidenceLocation {
  if (evidence.trim() === '') {
    // Rỗng nghĩa là sinh viên KHÔNG ĐỀ CẬP tiêu chí này. Đó là tín hiệu
    // hợp lệ — và là đầu vào của cổng Advocate — không phải lỗi.
    return { check: 'empty', spans: [] };
  }

  const parts = splitElision(evidence);
  if (parts.length === 0) {
    return { check: 'unverified', spans: [] };
  }

  const wantSpans = opts?.spans === true;
  const nfc = studentText.normalize('NFC');
  const { text: haystack, map } = normalizeWithMap(nfc, wantSpans);

  // Mỗi mẩu phải xuất hiện SAU mẩu trước. Ràng buộc thứ tự là thứ chặn việc
  // ghép hai đoạn không liên quan từ hai chỗ xa nhau trong bài — không có
  // nó thì việc tách elision tự mở một lỗ mới.
  const spans: EvidenceSpan[] = [];
  let cursor = 0;
  for (const part of parts) {
    if (part.length < MIN_EVIDENCE_CHARS) {
      return { check: 'unverified', spans: [] };
    }
    const at = haystack.indexOf(part, cursor);
    if (at === -1) {
      return { check: 'unverified', spans: [] };
    }
    if (map) {
      spans.push({
        start: map[at],
        // Cuối = vị trí gốc của ký tự khớp CUỐI CÙNG, cộng một.
        end: map[at + part.length - 1] + 1,
      });
    }
    cursor = at + part.length;
  }

  return { check: 'ok', spans };
}

/**
 * `'unverified'`, KHÔNG phải `'fabricated'` — tên gọi có chủ đích.
 *
 * "Không định vị được" là điều ta BIẾT. "Bịa đặt" là điều ta SUY DIỄN. Một
 * hệ thống tuyên bố AI bịa đặt trong khi thật ra nó chỉ đổi một dấu ngoặc
 * là một hệ thống nói dối về chính nó — và người dùng sẽ học cách bỏ qua
 * cảnh báo của nó.
 *
 * Một cài đặt, hai câu hỏi. Hai thân hàm là hai thứ sẽ trôi khỏi nhau, và
 * triệu chứng sẽ là màn hình báo "không tìm thấy trong bài làm" cho đúng
 * câu mà guard đã chấm `ok`.
 */
export function verifyEvidence(studentText: string, evidence: string): EvidenceCheck {
  return locateEvidence(studentText, evidence).check;
}

import { canonicalStringify } from './canonical-json';

const TAG = '(?:think|thinking|reasoning)';
const CLOSED_BLOCK = new RegExp(`<(${TAG})\\b[^>]*>[\\s\\S]*?</\\1\\s*>`, 'gi');
const OPEN_TAG = new RegExp(`<${TAG}\\b[^>]*>`, 'i');

/**
 * T-PARSE-1 (§5.2 luật 1): khối suy luận có thẻ đóng bị xoá; thẻ mở KHÔNG có thẻ đóng thì
 * cắt từ đó tới hết chuỗi. Một phản hồi bị cắt cụt để lại phán quyết NHÁP trong phần suy
 * luận, và bộ đọc chỉ tìm thẻ đóng sẽ trích nó ra như thật — một điểm bịa không kèm tín
 * hiệu lỗi nào.
 */
export function stripReasoning(content: string): string {
  const closedRemoved = content.replace(CLOSED_BLOCK, '');
  const open = OPEN_TAG.exec(closedRemoved);
  return open ? closedRemoved.slice(0, open.index) : closedRemoved;
}

/** Các đối tượng JSON cấp ngoài cùng — đếm ngoặc, biết chuỗi và escape bên trong đối tượng. */
export function topLevelObjects(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    // Dấu nháy ở văn xuôi NGOÀI đối tượng không mở chuỗi — văn xuôi có thể lệch nháy.
    if (ch === '"' && depth > 0) {
      inString = true;
      continue;
    }
    if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}' && depth > 0) {
      depth--;
      if (depth === 0) {
        out.push(text.slice(start, i + 1));
        start = -1;
      }
    }
  }
  return out;
}

export type ReadResult =
  | { ok: true; value: unknown }
  | { ok: false; reason: 'empty' | 'unparseable' | 'conflicting' };

/**
 * Đúng MỘT phán quyết. T-PARSE-2 (§5.2 luật 2): nhiều phán quyết khác nhau trong một phản
 * hồi → rỗng, không bao giờ chọn lấy một — chọn một là đoán, và đoán ở đây cho ra điểm
 * của sinh viên. Rỗng đi cùng `bad_output`: người gọi rơi bậc.
 */
export function readSingleJson(content: string): ReadResult {
  const text = stripReasoning(content).trim();
  if (!text) return { ok: false, reason: 'empty' };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    // lẫn văn xuôi, rào markdown, hay nhiều khối — tìm từng đối tượng
  }
  const parsed = topLevelObjects(text).flatMap((s) => {
    try {
      return [JSON.parse(s) as unknown];
    } catch {
      return [];
    }
  });
  if (parsed.length === 0) return { ok: false, reason: 'unparseable' };
  const first = canonicalStringify(parsed[0]);
  if (parsed.some((p) => canonicalStringify(p) !== first)) return { ok: false, reason: 'conflicting' };
  return { ok: true, value: parsed[0] };
}

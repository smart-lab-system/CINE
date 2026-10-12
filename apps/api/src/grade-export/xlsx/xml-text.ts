/**
 * Chữ và địa chỉ trong SpreadsheetML — hàm thuần, không phụ thuộc thư viện nào.
 */
export function decodeXml(text: string): string {
  return text
    .replace(/&(#x[0-9A-Fa-f]+|#[0-9]+|amp|lt|gt|quot|apos);/g, (_match, body: string) => {
      switch (body) {
        case 'amp': return '&';
        case 'lt': return '<';
        case 'gt': return '>';
        case 'quot': return '"';
        case 'apos': return "'";
      }
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    })
    // Excel viết ký tự điều khiển là _xHHHH_; một lượt duy nhất nên `_x005F_x000D_` (dấu gạch dưới được thoát) đọc ra `_x000D_`.
    .replace(/_x([0-9A-Fa-f]{4})_/g, (_match, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

/** Thoát chữ để đưa vào nội dung/thuộc tính XML, bỏ ký tự XML 1.0 cấm. */
export function encodeXml(text: string): string {
  return text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** `A`=1 … `Z`=26, `AA`=27. */
export function colToIndex(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

export function indexToCol(index: number): string {
  let s = '';
  let n = index;
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** `F12` → `{ col: 6, row: 12 }`; mọi thứ khác (kể cả `a1`, `A0`, `A1:B2`) → null. */
export function parseRef(ref: string): { col: number; row: number } | null {
  const match = /^([A-Z]{1,3})([1-9]\d{0,6})$/.exec(ref);
  return match ? { col: colToIndex(match[1]!), row: Number(match[2]) } : null;
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Giá trị thuộc tính (nháy kép hoặc đơn), đã giải mã; null nếu không có. `attrs` là chuỗi thuộc tính của một thẻ. */
export function readAttr(attrs: string, name: string): string | null {
  const match = new RegExp(`(?:^|\\s)${escapeRegExp(name)}=(?:"([^"]*)"|'([^']*)')`).exec(attrs);
  return match ? decodeXml(match[1] ?? match[2] ?? '') : null;
}

/** Như `readAttr` nhưng cho thuộc tính có tiền tố namespace bất kỳ (`r:id`, `ns1:id`…); `sheetId` không khớp. */
export function readPrefixedAttr(attrs: string, local: string): string | null {
  const match = new RegExp(`(?:^|\\s)[A-Za-z_][\\w.-]*:${escapeRegExp(local)}=(?:"([^"]*)"|'([^']*)')`).exec(attrs);
  return match ? decodeXml(match[1] ?? match[2] ?? '') : null;
}

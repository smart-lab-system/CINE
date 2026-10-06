/**
 * Đọc ô của file nhập. Mọi ô đến server dạng CHỮ (trình duyệt đọc xlsx rồi gửi `cell.text`), nên việc hiểu số/ngày/học kỳ
 * nằm ở MỘT chỗ, và hiểu CHẶT: chỉ nhận dạng không mơ hồ (spec §6.3). `01/02/2026` đọc là ngày-tháng-năm (1 tháng 2) vì
 * đó là cách trường ghi; `2026-02-01` thì đã rõ. Không đoán tháng-ngày-năm — một lần đoán nhầm là một học kỳ lệch cả tháng
 * mà bản xem trước vẫn trông hợp lệ.
 */

/** Số nguyên không âm; chấp nhận đuôi `.0…` vì ô số định dạng hai chữ số thập phân hiện `40.00`. */
export function parseCellInt(text: string): number | null {
  const match = /^(\d{1,9})(?:\.0+)?$/.exec(text.trim());
  return match ? Number(match[1]) : null;
}

/** `yyyy-mm-dd` hoặc `dd/mm/yyyy` → `yyyy-mm-dd`; `null` nếu không phải ngày có thật. */
export function parseCellDate(text: string): string | null {
  const value = text.trim();
  let year: number;
  let month: number;
  let day: number;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  if (iso) {
    [year, month, day] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  } else if (dmy) {
    [day, month, year] = [Number(dmy[1]), Number(dmy[2]), Number(dmy[3])];
  } else {
    return null;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** `1`, `2`, `3` hoặc `HK2`. */
export function parseTermCell(text: string): number | null {
  const match = /^(?:HK\s*)?([123])$/i.exec(text.trim());
  return match ? Number(match[1]) : null;
}

const SEMESTER_CELL = /^(?:HK|H\.K\.?|Học\s*kỳ)?\s*([123])\s+(\d{4})\s*[-–/]\s*(\d{4})$/i;

/**
 * Nhãn học kỳ như trường ghi: `HK1 2026-2027`, `Học kỳ 1 2026-2027`, hoặc chỉ `1 2026-2027`. Hai năm phải liền nhau.
 * Chuẩn hoá NFC trước vì Excel/Mac hay gửi chữ có dấu ở dạng tổ hợp, và `Học` ở dạng đó không khớp mẫu.
 */
export function parseSemesterCell(text: string): { academicYearStart: number; term: number } | null {
  const match = SEMESTER_CELL.exec(text.normalize('NFC').trim());
  if (!match) return null;
  const start = Number(match[2]);
  if (Number(match[3]) !== start + 1) return null;
  return { academicYearStart: start, term: Number(match[1]) };
}

/** Một ô trong câu báo lỗi: `(trống)` hoặc `"giá trị"`. */
export function shown(text: string): string {
  const value = text.trim();
  return value === '' ? '(trống)' : `"${value}"`;
}

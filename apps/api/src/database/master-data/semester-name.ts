export interface ParsedSemester {
  year: number;
  term: 1 | 2 | 3;
}

/**
 * Dạng giảng viên từng gõ vào `exam_session.semester_name`: `HK1 2026-2027` và `Học kỳ 1 2026-2027` (hai cách viết cùng một kỳ — dữ liệu thật 04/10).
 * Chấp nhận thêm chữ hoa/thường, `kỳ`/`kì`, gạch ngang dài, khoảng trắng thừa, và chữ tiếng Việt ở dạng tổ hợp. KHÔNG chấp nhận thứ gì khác: backfill
 * dừng thay vì đoán (spec §8.2), nên một chuỗi không khớp phải đi ra là `null`, không phải một kỳ gần đúng.
 */
const SEMESTER_NAME = /^(?:hk|học k[ỳìi]|hoc k[yi])\s*([123])\s+(\d{4})\s*[-–]\s*(\d{4})$/iu;

export function parseSemesterName(raw: string): ParsedSemester | null {
  const match = SEMESTER_NAME.exec(raw.normalize('NFC').replace(/\s+/g, ' ').trim());
  if (!match) return null;
  const year = Number(match[2]);
  // Năm sau phải đúng bằng năm + 1: `2026-2028` là một lỗi gõ, không phải một kỳ. Khoảng 2000–2999 là ràng buộc `ck_semester_year` của DB.
  if (Number(match[3]) !== year + 1 || year < 2000 || year > 2999) return null;
  return { year, term: Number(match[1]) as 1 | 2 | 3 };
}

/**
 * Ngày TẠM của một học kỳ do backfill tạo (spec §8.2 "migration không có cách biết ngày thật; admin sửa trên giao diện sau"): kỳ 1 từ 01/09 tới
 * 31/01 năm sau, kỳ 2 từ 01/02 tới 31/05, kỳ 3 từ 01/06 tới 31/08. Ba kỳ và kỳ 1 của năm kế nối nhau không chồng ngày, nên `ex_semester_dates_overlap`
 * không bao giờ chặn việc tạo hàng loạt.
 */
export function defaultSemesterDates(year: number, term: 1 | 2 | 3): { startDate: string; endDate: string } {
  if (term === 1) return { startDate: `${year}-09-01`, endDate: `${year + 1}-01-31` };
  if (term === 2) return { startDate: `${year + 1}-02-01`, endDate: `${year + 1}-05-31` };
  return { startDate: `${year + 1}-06-01`, endDate: `${year + 1}-08-31` };
}

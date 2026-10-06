import { formatDmy } from '../common/semester-label';

/**
 * MỘT lớp kiểm tra học kỳ cho cả hai đường nhập (spec §6.2 nguyên tắc 6): nhập
 * tay gọi nó qua `SemesterService`, và import (plan E) gọi đúng hàm này cho từng
 * dòng. Hai bản kiểm tra là hai chỗ để chúng lệch nhau — rồi một file nhập được
 * thứ mà form từ chối, hoặc ngược lại.
 *
 * Trả MỌI lỗi (không dừng ở lỗi đầu), để người sửa file không phải chạy lại
 * nhiều lần mới hết lỗi.
 */
export interface SemesterInput {
  academicYearStart: number;
  term: number;
  /** `yyyy-mm-dd`. */
  startDate: string;
  endDate: string;
}

const YEAR_MIN = 2000;
const YEAR_MAX = 2999;

/** Ngày có thật theo dạng `yyyy-mm-dd` (từ chối `2026-02-30`, `31/01/2027`, rỗng). */
function isRealIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

export function semesterProblems(input: SemesterInput): string[] {
  const problems: string[] = [];
  const yearOk = Number.isInteger(input.academicYearStart) && input.academicYearStart >= YEAR_MIN && input.academicYearStart <= YEAR_MAX;
  if (!yearOk) {
    problems.push(`Năm học phải từ ${YEAR_MIN} đến ${YEAR_MAX}.`);
  }
  if (!Number.isInteger(input.term) || input.term < 1 || input.term > 3) {
    problems.push('Kỳ phải là 1, 2 hoặc 3 (một năm học có ba kỳ).');
  }
  const startOk = isRealIsoDate(input.startDate);
  const endOk = isRealIsoDate(input.endDate);
  if (!startOk) problems.push('Ngày bắt đầu phải là ngày có thật theo dạng yyyy-mm-dd.');
  if (!endOk) problems.push('Ngày kết thúc phải là ngày có thật theo dạng yyyy-mm-dd.');
  if (startOk && endOk && input.endDate < input.startDate) {
    problems.push('Ngày kết thúc không được trước ngày bắt đầu.');
  }
  // Cả hai ngày phải nằm trong cửa sổ của năm học: từ 01/06 năm đầu tới 31/10 năm sau. Chặn gõ lệch năm một đơn vị, nhầm chữ số của năm, hay lấy
  // ngày của năm học khác — những lỗi mà "ngày có thật" và "không chồng ngày" đều cho qua. Cửa sổ rộng có chủ ý (trường bắt đầu kỳ ở nhiều tháng khác nhau).
  // Bỏ qua khi năm học đã sai: lỗi đó đã được báo, không nói thêm một lỗi hệ quả.
  if (yearOk) {
    const year = input.academicYearStart;
    const low = `${year}-06-01`;
    const high = `${year + 1}-10-31`;
    const window = `năm học ${year}-${year + 1} là từ ${formatDmy(low)} đến ${formatDmy(high)}`;
    if (startOk && (input.startDate < low || input.startDate > high)) problems.push(`Ngày bắt đầu phải nằm trong cửa sổ của ${window}.`);
    if (endOk && (input.endDate < low || input.endDate > high)) problems.push(`Ngày kết thúc phải nằm trong cửa sổ của ${window}.`);
  }
  return problems;
}

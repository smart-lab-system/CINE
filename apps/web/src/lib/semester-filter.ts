/**
 * Phần THUẦN của bộ lọc Năm học → Học kỳ dùng chung (spec §7.2). Thay ba bản lọc theo CHUỖI (`semester-filter.tsx`,
 * `FilterRail.tsx`, `lib/session-list.ts`), đều dựng danh sách lựa chọn từ các dòng đã tải — nên "HK1 2026-2027" và "Học kỳ 1
 * 2026-2027" là hai mục lọc, và kỳ không có dòng nào trên trang đang xem thì không thể chọn.
 *
 * Ở đây lựa chọn đến từ bảng `semester` và lọc bằng KHOÁ. Bộ lọc chỉ hẹp tầm nhìn, không bao giờ chặn thao tác (CLAUDE.md §1.2).
 */

/** Phần của một học kỳ mà bộ lọc cần — `Semester` của `lib/api/semesters` thoả kiểu này. */
export interface SemesterRef {
  id: string;
  academicYearStart: number;
  term: number;
  label: string;
}

/**
 * `academicYear = null` và `semesterId = null` là "Tất cả". `semesterId` khác null luôn đi kèm `academicYear` của nó
 * (`selectSemester` và `reconcileSelection` giữ bất biến đó) — một kỳ không có năm là trạng thái không hiểu được trên hai ô liên kết.
 */
export interface SemesterSelection {
  academicYear: number | null;
  semesterId: string | null;
}

/** MẶC ĐỊNH ở mọi màn hình: bản học kỳ 10/09 từng phải thêm riêng "nhắc việc tồn đọng của kỳ trước" vì bộ lọc mặc định che mất bài chưa chấm của kỳ cũ. */
export const ALL_SEMESTERS: SemesterSelection = { academicYear: null, semesterId: null };

export function academicYearLabel(start: number): string {
  return `${start}-${start + 1}`;
}

/** Mỗi năm một lần, năm mới nhất trước. */
export function academicYearOptions(
  semesters: readonly SemesterRef[],
): Array<{ value: number; label: string }> {
  const years = [...new Set(semesters.map((s) => s.academicYearStart))].sort((a, b) => b - a);
  return years.map((value) => ({ value, label: academicYearLabel(value) }));
}

/**
 * Các kỳ để chọn ở ô thứ hai. Đã chọn năm: các kỳ của năm đó, kỳ 1 trước (thứ tự đọc). Chưa chọn năm: MỌI kỳ, mới nhất trước — để
 * chọn thẳng một kỳ vẫn được mà không phải chọn năm trước.
 */
export function termOptions(semesters: readonly SemesterRef[], academicYear: number | null): SemesterRef[] {
  if (academicYear === null) {
    return [...semesters].sort((a, b) => b.academicYearStart - a.academicYearStart || b.term - a.term);
  }
  return semesters.filter((s) => s.academicYearStart === academicYear).sort((a, b) => a.term - b.term);
}

/**
 * Đổi năm học. Chọn năm không chọn kỳ là cả ba kỳ; đổi năm thì ô kỳ về "tất cả" nếu kỳ đang chọn không thuộc năm mới (spec §7.2);
 * về "tất cả năm" xoá luôn kỳ.
 */
export function selectYear(
  current: SemesterSelection,
  year: number | null,
  semesters: readonly SemesterRef[],
): SemesterSelection {
  if (year === null) return ALL_SEMESTERS;
  const keep = semesters.some((s) => s.id === current.semesterId && s.academicYearStart === year);
  return { academicYear: year, semesterId: keep ? current.semesterId : null };
}

/** Chọn một kỳ: năm học đi theo kỳ. `null` là "tất cả kỳ" — quay về "cả năm" đang chọn. Id lạ về "tất cả" thay vì lưu id mồ côi. */
export function selectSemester(
  semesterId: string | null,
  current: SemesterSelection,
  semesters: readonly SemesterRef[],
): SemesterSelection {
  if (semesterId === null) return { academicYear: current.academicYear, semesterId: null };
  const found = semesters.find((s) => s.id === semesterId);
  return found ? { academicYear: found.academicYearStart, semesterId } : ALL_SEMESTERS;
}

/**
 * Dọn một lựa chọn trỏ vào thứ không còn (học kỳ vừa bị admin xoá) hoặc không nhất quán. Trả về CHÍNH đối tượng nếu không có gì
 * phải sửa, để `useMemo`/`useEffect` ở hook không chạy lại vô ích. Danh sách rỗng không làm mất lựa chọn trống.
 */
export function reconcileSelection(
  selection: SemesterSelection,
  semesters: readonly SemesterRef[],
): SemesterSelection {
  if (selection.semesterId !== null) {
    const found = semesters.find((s) => s.id === selection.semesterId);
    if (!found) return ALL_SEMESTERS;
    return selection.academicYear === found.academicYearStart
      ? selection
      : { academicYear: found.academicYearStart, semesterId: selection.semesterId };
  }
  if (selection.academicYear !== null) {
    return semesters.some((s) => s.academicYearStart === selection.academicYear) ? selection : ALL_SEMESTERS;
  }
  return selection;
}

/**
 * Một dòng đã tải có khớp lựa chọn không — cho các trang lọc trong trình duyệt (spec §7.2). Lọc bằng KHOÁ trên dòng, không bằng chữ.
 * Dòng chưa có học kỳ (lớp cũ chưa backfill) khớp khi KHÔNG lọc và KHÔNG khớp khi đang lọc — không bao giờ nổ vì `null`.
 */
export function matchesSemester(
  selection: SemesterSelection,
  item: { semesterId: string | null; academicYear: number | null },
): boolean {
  if (selection.semesterId !== null) return item.semesterId === selection.semesterId;
  if (selection.academicYear !== null) return item.academicYear === selection.academicYear;
  return true;
}

/**
 * Tham số cho các truy vấn lọc ở server. Có kỳ thì chỉ gửi `semesterId` (chính xác hơn năm); không lọc thì KHÔNG gửi gì — vắng mặt
 * là "tất cả", không phải lỗi.
 */
export function toQueryParams(selection: SemesterSelection): { semesterId?: string; academicYear?: number } {
  if (selection.semesterId !== null) return { semesterId: selection.semesterId };
  if (selection.academicYear !== null) return { academicYear: selection.academicYear };
  return {};
}

export function isFiltering(selection: SemesterSelection): boolean {
  return selection.semesterId !== null || selection.academicYear !== null;
}

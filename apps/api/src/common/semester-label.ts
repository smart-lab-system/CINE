/**
 * Nhãn một học kỳ: `HK1 2026-2027`. Không có cột `name` riêng (spec §2.1) —
 * tên là biểu thức của (năm học, kỳ), nên không có hai chỗ để nhãn lệch nhau.
 * Phải khớp hàm SQL `examcollect.semester_label` (migration
 * `ExpandMasterDataEntities`): test e2e Task 3 so hai bên.
 */
export function semesterLabel(academicYearStart: number, term: number): string {
  return `HK${term} ${academicYearStart}-${academicYearStart + 1}`;
}

/** `2026-09-01` -> `01/09/2026`, cho câu báo lỗi người đọc. */
export function formatDmy(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
}

/** Tên mặc định khi nhập catalog master-data trên UI admin. */

export const SEMESTER_CODES = ['HK1', 'HK2', 'HE'] as const;
export type SemesterCode = (typeof SEMESTER_CODES)[number];

const SEMESTER_LABEL: Record<SemesterCode, string> = {
  HK1: 'Học kỳ 1',
  HK2: 'Học kỳ 2',
  HE: 'Học kỳ hè',
};

export function academicYearNameFromCode(code: string): string {
  const trimmed = code.trim();
  return trimmed ? `Năm học ${trimmed}` : '';
}

export function semesterLabelFromCode(code: SemesterCode): string {
  return SEMESTER_LABEL[code];
}

/** Ví dụ: "Học kỳ 1 năm học 2026-2027" */
export function semesterNameFromCodeAndYear(
  code: SemesterCode,
  academicYearCode: string | undefined,
): string {
  const label = SEMESTER_LABEL[code];
  const year = academicYearCode?.trim();
  return year ? `${label} năm học ${year}` : label;
}

export function nominalClassNameFromCode(code: string): string {
  const trimmed = code.trim();
  return trimmed ? `Lớp ${trimmed}` : '';
}

export function cohortYearBounds(now = new Date()) {
  return { min: 2000, max: now.getFullYear() + 1 };
}

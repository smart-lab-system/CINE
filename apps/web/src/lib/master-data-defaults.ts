/** Tên mặc định + nhãn trạng thái UI (DB vẫn giữ enum tiếng Anh). */

export const SEMESTER_CODES = ['HK1', 'HK2', 'HE'] as const;
export type SemesterCode = (typeof SEMESTER_CODES)[number];

const SEMESTER_LABEL: Record<SemesterCode, string> = {
  HK1: 'Học kỳ 1',
  HK2: 'Học kỳ 2',
  HE: 'Học kỳ hè',
};

export const ACADEMIC_STATUSES = ['planned', 'active', 'closed'] as const;
export type AcademicStatus = (typeof ACADEMIC_STATUSES)[number];

export const CATALOG_ACTIVE_STATUSES = ['active', 'inactive'] as const;
export type CatalogActiveStatus = (typeof CATALOG_ACTIVE_STATUSES)[number];

export const STUDENT_STATUSES = [
  'active',
  'inactive',
  'graduated',
  'withdrawn',
] as const;
export type StudentStatusLabel = (typeof STUDENT_STATUSES)[number];

export const FACILITY_STATUSES = ['active', 'maintenance', 'inactive'] as const;
export type FacilityStatus = (typeof FACILITY_STATUSES)[number];

const ACADEMIC_STATUS_LABEL: Record<AcademicStatus, string> = {
  planned: 'Sắp diễn ra',
  active: 'Đang diễn ra',
  closed: 'Đã kết thúc',
};

const CATALOG_ACTIVE_STATUS_LABEL: Record<CatalogActiveStatus, string> = {
  active: 'Hoạt động',
  inactive: 'Ngừng hoạt động',
};

const STUDENT_STATUS_LABEL: Record<StudentStatusLabel, string> = {
  active: 'Hoạt động',
  inactive: 'Ngừng hoạt động',
  graduated: 'Đã tốt nghiệp',
  withdrawn: 'Đã thôi học',
};

const FACILITY_STATUS_LABEL: Record<FacilityStatus, string> = {
  active: 'Hoạt động',
  maintenance: 'Bảo trì',
  inactive: 'Ngừng hoạt động',
};

export function academicStatusLabel(status: AcademicStatus): string {
  return ACADEMIC_STATUS_LABEL[status];
}

export function catalogActiveStatusLabel(status: CatalogActiveStatus): string {
  return CATALOG_ACTIVE_STATUS_LABEL[status];
}

export function studentStatusLabel(status: StudentStatusLabel): string {
  return STUDENT_STATUS_LABEL[status];
}

export function facilityStatusLabel(status: FacilityStatus): string {
  return FACILITY_STATUS_LABEL[status];
}

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

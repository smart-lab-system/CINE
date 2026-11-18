import type { Rubric } from '@/lib/api/grading';
import type { TeachingClass } from '@/lib/api/teaching';
import { resolveSemester } from '@/lib/resolve-semester';

export interface QsRubricListRow {
  id: string;
  name: string;
  courseId: string | null;
  courseLabel: string;
  approachCount: number;
  createdByName: string;
  /** Học kỳ · năm học suy từ createdAt (catalog semester). */
  createdTermLabel: string;
}

export interface SemesterForInfer {
  id: string;
  name: string;
  academicYearId: string;
  startDate: string;
  endDate: string;
  status?: string;
}

/** Nhãn học kỳ (đã gồm năm học trong tên catalog) suy từ mốc tạo. */
export function formatCreatedTermLabel(
  createdAt: string | undefined,
  updatedAt: string | undefined,
  semesters: readonly SemesterForInfer[],
): string {
  if (!createdAt || semesters.length === 0) return '-';
  const hit = resolveSemester(createdAt, updatedAt ?? createdAt, semesters);
  if (!hit) return '-';
  const sem = semesters.find((s) => s.id === hit.id);
  return sem?.name.trim() || '-';
}

export function activeQsRubrics(rubrics: Rubric[]): Rubric[] {
  return rubrics.filter((r) => (r.kind ?? 'qa') === 'qs' && r.isActive);
}

/** courseId có trong lớp dạy khớp năm/kỳ đã chọn. */
export function courseIdsForTerm(
  classes: TeachingClass[],
  opts: {
    academicYearId: string | null;
    semesterId: string | null;
    /** semesterId → academicYearId */
    semesterYearById: Map<string, string>;
  },
): Set<string> | null {
  const { academicYearId, semesterId, semesterYearById } = opts;
  if (!academicYearId && !semesterId) return null;

  const ids = new Set<string>();
  for (const klass of classes) {
    if (!klass.courseId || !klass.semesterId) continue;
    if (semesterId && klass.semesterId !== semesterId) continue;
    if (academicYearId) {
      const yearId = semesterYearById.get(klass.semesterId);
      if (yearId !== academicYearId) continue;
    }
    ids.add(klass.courseId);
  }
  return ids;
}

export function filterQsRubricRows(
  rows: QsRubricListRow[],
  opts: {
    search: string;
    courseId: string | null;
    allowedCourseIds: Set<string> | null;
  },
): QsRubricListRow[] {
  const q = opts.search.trim().toLowerCase();
  return rows.filter((row) => {
    if (opts.courseId && row.courseId !== opts.courseId) return false;
    if (opts.allowedCourseIds && (!row.courseId || !opts.allowedCourseIds.has(row.courseId))) {
      return false;
    }
    if (!q) return true;
    return row.name.toLowerCase().includes(q);
  });
}

export function buildQsRubricRows(
  rubrics: Rubric[],
  courseLabelById: Map<string, string>,
  createdByName: string,
  semesters: readonly SemesterForInfer[],
): QsRubricListRow[] {
  return activeQsRubrics(rubrics)
    .map((r) => ({
      id: r.id,
      name: r.name,
      courseId: r.courseId ?? null,
      courseLabel:
        r.courseId && courseLabelById.has(r.courseId)
          ? courseLabelById.get(r.courseId)!
          : '-',
      approachCount: r.approaches?.length ?? 0,
      createdByName,
      createdTermLabel: formatCreatedTermLabel(r.createdAt, r.updatedAt, semesters),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
}

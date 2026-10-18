import type { TeachingClass } from '@/lib/api/teaching';

/** Lọc client-side trên danh sách lớp đã phân công (đã tải hết). */
export function filterTeachingClasses(
  classes: TeachingClass[],
  opts: {
    search: string;
    courseName: string | null;
    semesterName: string | null;
  },
): TeachingClass[] {
  const q = opts.search.trim().toLowerCase();
  return classes.filter((klass) => {
    if (opts.courseName && klass.courseName !== opts.courseName) return false;
    if (opts.semesterName && klass.semesterName !== opts.semesterName) return false;
    if (!q) return true;
    return (
      klass.name.toLowerCase().includes(q) ||
      klass.courseName.toLowerCase().includes(q)
    );
  });
}

/** Cùng bộ loại với `exam_session.exam_type`. */
export const COURSE_EXAM_TYPES = ['TK', 'GK', 'CK'] as const;
export type CourseExamType = (typeof COURSE_EXAM_TYPES)[number];

export const COURSE_EXAM_TYPE_LABELS: Record<CourseExamType, string> = {
  TK: 'thường kỳ',
  GK: 'giữa kỳ',
  CK: 'cuối kỳ',
};

/**
 * Cùng tập với playground (`PlaygroundLanguage`) — ngôn ngữ biên dịch
 * hoặc cấu trúc project chạy source.
 */
export const COURSE_EXAM_LANGUAGES = [
  'c',
  'cpp',
  'java',
  'python',
  'static',
  'spring-boot',
  'vite-react',
  'express',
] as const;
export type CourseExamLanguage = (typeof COURSE_EXAM_LANGUAGES)[number];

/** Tiêu đề bắt buộc dạng: Đề thi {loại} — {tên môn}. */
export function buildCourseExamTitle(examType: CourseExamType, courseName: string): string {
  return `Đề thi ${COURSE_EXAM_TYPE_LABELS[examType]} — ${courseName}`;
}

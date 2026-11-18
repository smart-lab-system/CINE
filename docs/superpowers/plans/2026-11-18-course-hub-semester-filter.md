# Plan — Hub môn học + lọc học kỳ theo ngày

**Spec:** `docs/superpowers/specs/2026-11-18-course-hub-semester-filter-design.md`  
**Ngày:** 2026-11-18

## Tasks

- [x] Spec
- [x] `resolveSemester` (API util + unit test)
- [x] Migration `rubric.course_id` + backfill
- [x] Entity / DTO / RubricService / TeachingClassView.courseId
- [x] Web: RubricDialog + QsRubricForm gửi `courseId`; types/tests
- [x] Admin API: list exams/rubrics theo course (+ filter kỳ)
- [x] Admin UI hub `/admin/master-data/courses/[id]` 3 tab + filter năm/kỳ

## Không làm (phase sau)

Filter kỳ trên portal GV; clone đề; NOT NULL toàn bộ `rubric.course_id`.

# Plan — Hub bank soft/hard actions

**Spec:** `docs/superpowers/specs/2026-11-18-hub-bank-soft-hard-actions-design.md`  
**Ngày:** 2026-11-18

## Tasks

- [x] Spec
- [x] Migration `course_exam.is_active` + `rubric.is_archived`
- [x] Entity + CourseHubService list/detail flags
- [x] Admin API deactivate/reactivate/delete exam & rubric (+ gate FK rubric)
- [x] Teacher picker: lọc đề `is_active` / rubric `!is_archived`
- [x] Web: types + hooks mutate
- [x] Web: ExamsTab / RubricsTab cột Thao tác + dialogs

## Không làm (phase sau)

Stub `isAttachedToExamSession` → check FK thật; admin edit nội dung ngân hàng.

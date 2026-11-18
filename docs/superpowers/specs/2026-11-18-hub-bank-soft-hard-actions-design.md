# Hub môn — soft/hard actions cho đề & rubric

**Ngày:** 2026-11-18  
**Trạng thái:** implemented  
**Plan:** `docs/superpowers/plans/2026-11-18-hub-bank-soft-hard-actions.md`

---

## 1. Vấn đề

Hub admin đã có cột Thao tác (Sửa + cập nhật trạng thái) cho **lớp học phần**. Cần cùng UX cho **ngân hàng đề** và **ngân hàng rubric**, và **thống nhất** khi nào vô hiệu hóa (soft) vs xóa cứng.

Ràng buộc đặc biệt: `rubric.is_active` đã mang nghĩa **version hiện hành** (bản mới cùng tên → bản cũ `is_active=false`, badge `(cũ)`). Không được tái dùng cho soft-delete admin.

`course_exam` chưa có cờ soft; liên kết phiên↔đề còn stub (`isAttachedToExamSession` luôn false).

## 2. Quyết định

| # | Quyết định |
|---|---|
| P1 | Rubric: cột `is_archived` cho vô hiệu hóa admin; `is_active` giữ versioning |
| P2 | Soft: luôn được khi đang “đang dùng”; reactivate khi đang vô hiệu; hard delete chỉ khi không còn phụ thuộc |
| P3 | Đề: hard delete **không chặn** đến khi có FK phiên↔đề thật (giữ stub) |
| P4 | Đề: thêm `course_exam.is_active` (không dùng `status` draft/ready làm soft) |
| P5 | Dialog Sửa trên hub: **chỉ đọc** metadata (admin không sửa nội dung ngân hàng của GV) |
| P6 | Soft không đụng flip versioning khi GV save rubric mới |

### Phụ thuộc xóa cứng

| Đối tượng | Chặn DELETE khi |
|---|---|
| Lớp HP | Roster ≠ 0 **hoặc** có phiên thi |
| Đề thi | Stub: không chặn (P3) |
| Rubric | Tham chiếu bởi `course_exam_question.rubric_id`, `exam_session.rubric_id`, `exam_problem.rubric_id`, hoặc `grading_result.rubric_id_version` |

### Ý nghĩa soft

- Lớp / đề (`is_active=false`): ẩn khỏi picker GV; hub admin vẫn list + badge `(vô hiệu)`.
- Rubric (`is_archived=true`): không chọn khi gắn mới; badge `(vô hiệu)` độc lập `(cũ)`.

## 3. Schema

```
course_exam.is_active boolean NOT NULL DEFAULT true
rubric.is_archived    boolean NOT NULL DEFAULT false
```

## 4. API (admin, course hub)

| Method | Path | Hành vi |
|---|---|---|
| PATCH | `/master-data/courses/:id/exams/:examId/deactivate` | `is_active=false` |
| PATCH | `/master-data/courses/:id/exams/:examId/reactivate` | `is_active=true` |
| DELETE | `/master-data/courses/:id/exams/:examId` | Hard delete (stub phụ thuộc) |
| PATCH | `/master-data/courses/:id/rubrics/:rubricId/deactivate` | `is_archived=true` |
| PATCH | `/master-data/courses/:id/rubrics/:rubricId/reactivate` | `is_archived=false` |
| DELETE | `/master-data/courses/:id/rubrics/:rubricId` | Hard delete nếu không còn FK |

List/detail hub trả thêm `isActive` (exam) và `isArchived` (rubric).

## 5. UI

Tab đề / rubric: cột Thao tác căn giữa — Sửa (dialog RO) + Cập nhật trạng thái (vô hiệu / kích hoạt / xóa cứng).

## 6. Ngoài phạm vi

FK thật phiên↔đề; admin sửa nội dung đề/rubric; đổi semantics `rubric.is_active`.

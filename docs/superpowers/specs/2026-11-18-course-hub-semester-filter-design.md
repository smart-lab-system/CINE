# Hub môn học + lọc học kỳ theo ngày — thiết kế

**Ngày:** 2026-11-18  
**Trạng thái:** implemented (phase 1)  
**Plan:** `docs/superpowers/plans/2026-11-18-course-hub-semester-filter.md`

---

## 1. Vấn đề

Admin cần mở một môn và thấy ba ngân hàng vận hành: lớp học phần, đề thi, tiêu chí (rubric), mỗi phần lọc theo **năm học / học kỳ**. Rubric hiện chỉ thuộc giảng viên (đã bỏ `course_id`), nên không neo được vào hub môn. Đề/rubric không nên gắn FK học kỳ cứng — thuộc kỳ suy từ ngày tạo/cập nhật.

## 2. Quyết định

| # | Quyết định |
|---|---|
| D1 | Admin: click môn → hub 3 option (lớp HP / ngân hàng đề / ngân hàng tiêu chí) |
| D2 | Mỗi tab filter tối thiểu: năm học → học kỳ (+ “Tất cả”) |
| D3 | Lớp HP lọc bằng FK `class.semester_id` |
| D4 | Đề / rubric **không** thêm `semester_id`; suy kỳ bằng `resolveSemester(createdAt, updatedAt)` |
| D5 | Thuộc kỳ chính theo **`createdAt`**; `updatedAt` chỉ khi `createdAt` ngoài mọi kỳ; nearest theo `createdAt` |
| D6 | So sánh theo **ngày lịch Asia/Ho_Chi_Minh** |
| D7 | Rubric thêm lại `course_id` nullable (legacy); **bắt buộc** khi tạo mới |
| D8 | Ownership rubric vẫn `teacher_id`; `course_id` chỉ neo ngân hàng môn |
| D9 | Đổi môn: chỉ lúc tạo / bản version mới; không đổi trên bản đã có grading |
| D10 | Phase 1: admin hub + `courseId` trên rubric + resolveSemester. Filter kỳ portal GV = phase sau |

## 3. `resolveSemester`

Input: `createdAt`, `updatedAt`, danh sách kỳ `{ id, startDate, endDate, status }`.

1. Nếu ngày VN của `createdAt` ∈ `[start, end]` → kỳ đó.  
2. Else nếu ngày VN của `updatedAt` ∈ khoảng → kỳ đó.  
3. Else kỳ gần nhất theo khoảng cách từ ngày `createdAt` tới đoạn `[start, end]`; hòa → `startDate` gần hơn → ưu tiên `active` rồi `planned`.

## 4. Schema

```
rubric.course_id uuid NULL  → course(id) ON DELETE RESTRICT
index idx_rubric_course
```

Backfill best-effort: từ `course_exam_question` / `exam_session`+`class`.

## 5. API

| Method | Path | Ai |
|---|---|---|
| POST | `/rubrics` body + `courseId` (required create) | teacher |
| GET | `/master-data/courses/:id/exams?semesterId=&academicYearId=` | admin |
| GET | `/master-data/courses/:id/rubrics?semesterId=&academicYearId=` | admin |

Lớp HP: reuse `GET /admin/course-sections?courseId=&semesterId=`.

## 6. UI

- `/admin/master-data/courses/[id]?tab=classes\|exams\|rubrics`
- `RubricDialog` / `QsRubricForm`: chọn môn bằng `courseId` (từ lớp đang dạy), gửi API
- Badge kỳ suy diễn trên hàng đề/rubric khi đang lọc kỳ

## 7. Ngoài phạm vi (phase sau)

Đồng bộ filter kỳ trên teacher exam-bank / rules; clone đề sang kỳ; bắt buộc `course_id` NOT NULL toàn bảng.

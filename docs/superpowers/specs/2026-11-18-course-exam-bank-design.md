# Kho đề thi theo môn — thiết kế

**Ngày:** 2026-11-18  
**Trạng thái:** implemented (CRUD + UI; Word IO xem spec riêng)  
**Plan:** `docs/superpowers/plans/2026-11-18-course-exam-bank.md`  
**Word IO:** `docs/superpowers/specs/2026-11-18-exam-bank-word-io-design.md`

---

## 1. Vấn đề

Soạn đề (UC18) hiện **không lưu DB** — chỉ sinh rồi gắn phiên. Chưa có chỗ neo đề theo môn để sau này gắn rubric QS / chọn đề khi soạn barem.

## 2. Quyết định

| # | Quyết định |
|---|---|
| D1 | Kho đề **thuộc môn** (`course_id`) — mọi GV đang dạy ≥ 1 lớp của môn đó xem/sửa |
| D2 | Đơn vị = **cả đề** (N câu), không phải từng câu rời |
| D3 | Trạng thái `draft` \| `ready`; chỉ xóa được `draft` |
| D4 | Đợt 1: CRUD + UI list/sửa; **không** gắn phiên, **không** rubric/QS, **không** đáp án/test trong kho |
| D5 | `created_by` chỉ audit — không phải chủ sở hữu |
| D6 | `exam_type` ∈ `TK`\|`GK`\|`CK` (như phiên thi); tiêu đề = `Đề thi {loại} — {tên môn}` (server dựng) |
| D7 | `language` bắt buộc = playground stack (`c`…`express`) |

### Backlog liên quan (không làm trong đợt này)

- UC33: AI **gán hướng** lời giải khi rubric QS (kind đã biết lúc soạn).
- Import `dsa_vi_03`: chỉ **question + rubric** (sau khi có kho + QS).
- UI soạn QS — sau kho đề.

## 3. Mô hình

```
course 1──* course_exam (title, status, language?, created_by)
                1──* course_exam_question (ordinal, title?, statement, points_hundredths)
```

## 4. Quyền

`assertTeachesCourse(teacherId, courseId)`: tồn tại `class` với `teacher_id` và `course_id` khớp. Lớp legacy `course_id IS NULL` không mở kho đề catalog.

## 5. API

| Method | Path |
|---|---|
| GET | `/exam-bank/courses` |
| GET | `/exam-bank?courseId=` |
| GET | `/exam-bank/:id` |
| POST | `/exam-bank` |
| PATCH | `/exam-bank/:id` |
| DELETE | `/exam-bank/:id` (chỉ draft) |

## 6. Ngoài phạm vi

Gắn kho → phiên; `rubric_id` trên câu; lưu từ Soạn đề AI vào kho; versioning đề.

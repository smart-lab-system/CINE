# UI soạn rubric QS + gắn câu kho đề

**Ngày:** 2026-11-18  
**Trạng thái:** implemented  
**Plan:** `docs/superpowers/plans/2026-11-18-qs-rubric-ui.md`  
**Nền:** `2026-11-18-qa-qs-rubric-design.md`, kho đề `course_exam`

---

## 1. Vấn đề

API QS đã có; web chỉ soạn QA phẳng. Kho đề chưa neo rubric theo câu.

## 2. Quyết định

| # | Quyết định |
|---|---|
| D1 | Mở rộng `/teacher/rules` `RubricDialog`: chọn **QA \| QS** khi tạo; sửa QS = approach + bước checklist. |
| D2 | Điểm hiển thị QS = **max** tổng bước các hướng (không cộng mọi hướng). |
| D3 | `course_exam_question.rubric_id` nullable FK → `rubric.id` (ON DELETE SET NULL). |
| D4 | Chỉ gắn rubric `kind = qs` vào câu kho đề; QA không gắn qua field này. |
| D5 | Form kho đề: mỗi câu chọn / gỡ / mở dialog tạo QS rồi gắn id trả về. |
| D6 | Tab lỗi: QA giữ nhóm tiêu chí phẳng; **QS nhóm theo hướng → bước** (overview trả `kind` + `approaches`). Lỗi vẫn gắn `criterion_key` = khoá bước. |

## 3. API

- `POST /rubrics` đã nhận `kind` + `approaches` — web gửi đủ.
- `ExamBankQuestionDto.rubricId?: uuid` (create/update/replaceQuestions).
- Detail câu trả `rubricId`, `rubricName?`, `rubricKind?`.

## 4. Ngoài phạm vi

UC33 AI chọn hướng; gắn phiên thi. Import `dsa_vi_03` — xem spec riêng.

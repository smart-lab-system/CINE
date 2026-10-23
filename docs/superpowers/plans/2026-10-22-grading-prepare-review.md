# Xem lại bước chuẩn bị chấm — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sau khi đã bắt đầu chấm, giảng viên mở lại bước chuẩn bị trên cùng route, chỉ để đọc rubric, tài liệu, ngôn ngữ và gói test đã dùng.

**Architecture:** `view=prepare` trên `/teacher/grading` chỉ có hiệu lực khi màn tự chọn là đang chấm hoặc danh sách bài. `PreparePanel` thêm `mode="review"`: ẩn mọi control ghi, cột phải đổi nhãn thành **Đã dùng để chấm**. `GET grading-readiness` thêm `modelAnswerNote` để hiện câu ghi chú đã lưu. Luật khoá server không đổi.

**Tech Stack:** NestJS, Next.js App Router, TanStack Query, Vitest + Testing Library, e2e Jest của API.

**Spec:** `docs/superpowers/specs/2026-10-22-grading-prepare-review-design.md`

**Ngoài phạm vi:** sửa thước từ màn xem lại; route mới; hiện nội dung file đáp án; đổi `RulerOriginNote`; cấu hình theo từng câu.

---

## Global constraints

- `view=prepare` bị bỏ qua khi màn tự chọn vẫn là chuẩn bị sửa được (chưa có kết quả, hoặc mọi bài không chấm được, và không đang chấm).
- Màn xem lại không có nút bắt đầu và không có ô ghi. Server vẫn 409 khi khoá.
- `useGradingProgress` giữ ở `SessionScreen`. Đang chấm thì có dòng *việc chấm vẫn chạy trên máy chủ* và lối **Quay lại tiến độ chấm**. Hết chấm thì **Quay lại danh sách bài**. Cả hai giữ `sessionId` và `state` hợp lệ, bỏ `view`.
- Nút **Xem bước chuẩn bị** chỉ trên đầu phiên khi đang ở màn đang chấm hoặc danh sách. Không hiện lúc đang tải, lúc đang xem lại, lúc đang ở màn chuẩn bị sửa được.
- Readiness thêm `modelAnswerNote: string | null`. Không trả storage key. Ghi chú rỗng hoặc chỉ khoảng trắng → `null`.
- Cột xem lại không dùng câu *hãy chọn / hãy gắn / hãy lưu*.

---

## File structure

| File | Task | Việc |
|---|---|---|
| `apps/api/src/grading/grading-reference.service.ts` | 1 | Trường `modelAnswerNote` trên readiness |
| `apps/api/test/grading-reference.e2e-spec.ts` | 1 | Chủ phiên thấy ghi chú; không có storage key; không chủ vẫn 403 |
| `apps/web/src/lib/api/grading.ts` | 1 | Type web |
| `apps/web/src/lib/preflight.ts` (+ test) | 2 | `mode: 'review'` — câu sự thật, nhãn số bài đã thu |
| `PreflightColumn.tsx` | 2 | `label` cho `aria-label` |
| `RubricRow.tsx`, `ReferenceForm.tsx`, `DeliverableLanguages.tsx` | 3 | `readOnly` |
| `TestBundleReview.tsx` (+ test) | 3 | Gói ghim + bảng ca; phiên bản khác chỉ tên |
| `PreparePanel.tsx` | 4 | `mode="review"`: băng khoá, không nút bắt đầu |
| `SessionHeader.tsx`, `page.tsx` (+ test) | 5 | Query, lối vào, lối ra, ẩn nhóm duyệt khi đang xem lại |

---

## Task 1: Ghi chú đáp án trên readiness

**Files:** service, e2e, `apps/web/src/lib/api/grading.ts`

- [x] Thêm `modelAnswerNote` vào `GradingReadiness` và mọi nhánh `readiness()`.
- [x] E2e: có ghi chú → đúng chuỗi; chưa có → `null`; body không chứa `storageKey` / `modelAnswerStorageKey`; route người khác vẫn 403.
- [x] Type web thêm trường (tuỳ chọn để fixture cũ vẫn gõ được).

## Task 2: Cột “Đã dùng để chấm”

**Files:** `preflight.ts`, `preflight.test.ts`, `PreflightColumn.tsx`

- [x] `PreflightInput.mode` mặc định `'prepare'`. `'review'` đổi các câu hướng dẫn thành câu sự thật; nhãn đếm là **Số bài đã thu**; bỏ dòng *chưa lưu* (không có form).
- [x] `PreflightColumn` nhận `label`, mặc định **Trước khi bắt đầu**.

## Task 3: Bốn khối chỉ đọc

- [x] Rubric: giữ tên, phiên bản, điểm, số tiêu chí; liên kết **Xem bảng lỗi**; không ô đổi, không nút ghim.
- [x] Tài liệu: tên đề + dòng nguồn; đáp án (tên file hoặc *chỉ có ghi chú* / *chưa có*); nguyên văn ghi chú hoặc *Chưa có ghi chú*; băng chưa kiểm chứng nếu cờ còn. Không radio, không ô file, không nút lưu.
- [x] Ngôn ngữ: chữ, không `<select>`; câu đường chấm (`routeText`), không câu *đã cố định vì có kết quả*.
- [x] `TestBundleReview`: phiên bản + **Đang dùng** trên gói ghim, lúc duyệt, bảng nhóm / input / output. Không nút sinh, duyệt, ghim, chạy, sửa ca. Chưa ghim → *Chưa ghim gói test.*

## Task 4: `PreparePanel mode="review"`

- [x] Băng: *Phiên đã bắt đầu chấm… chỉ để xem lại* kèm *đã có bài mang điểm hoặc đang chấm*.
- [x] Không nút bắt đầu, không đoạn hậu quả của nút đó.
- [x] Truyền `readOnly` / `TestBundleReview` và `preflight` mode review. Màn `edit` giữ nguyên.

## Task 5: Route

- [x] `gradingSessionHref` gắn `sessionId`, `state` nếu là filter thật, `view=prepare` khi vào.
- [x] `SessionHeader` nhận `prepareReviewHref`.
- [x] `page.tsx` chọn review thay thân đang chấm / danh sách; dòng trạng thái khi `pending > 0`; không vẽ `RunningPanel` và không vẽ bảng bài.
- [x] Test trang: ba trạng thái cũ; `view=prepare` trên danh sách và đang chấm; bỏ qua khi chưa có kết quả và khi mọi bài không chấm được; nút đầu trang; quay lại giữ `state`.

## Review focus

1. Xem lại không gửi request ghi.
2. `view=prepare` không khoá màn chuẩn bị khi phiên chưa chấm hoặc đã mở khoá vì mọi bài không chấm được.
3. Đang chấm mà mở xem lại thì poll tiến độ vẫn ở `SessionScreen`.
4. Ghi chú hiện đúng chữ đã lưu; file đáp án không bị tải về.

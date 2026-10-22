# Stepper hub Thiết lập phiên thi — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hub `/teacher/exam-sessions/[id]` thành năm bước ngang. Một dòng tên phiên luôn ở trên. Chỉ bước đang chọn được mount. Ô form giữ trong context + `sessionStorage` khi đổi bước. Loại thi sửa được cùng phòng và giờ khi phiên còn `scheduled`.

**Architecture:** PATCH lịch nhận thêm `examType` (cùng cửa chưa freeze). Web không thêm Redux. `ExamSetupDraftProvider` giữ nháp; React Query vẫn là dữ liệu đã lên server. Lưu nháp và Hoàn tất gọi endpoint đang có. Hoàn tất không gọi `POST …/open`.

**Tech Stack:** NestJS 11, Jest e2e; Next.js App Router, TanStack Query, Vitest + Testing Library; `openapi-typescript` (`@cine/shared generate:api-client`).

**Spec:** `docs/superpowers/specs/2026-10-22-exam-session-setup-stepper-design.md`

**Ngoài phạm vi:** wizard form tạo phiên; status `draft` trên DB; Redux; gộp Hoàn tất với Mở phiên; đổi checklist §5.4; sửa tên, mã, môn, lớp, học kỳ; đưa `File` hoặc từng dòng roster vào `sessionStorage`; lobby `/exam-sessions/[id]`.

---

## Global constraints

- Điều hướng stepper, Quay lại, Tiếp tục không validate và không gọi API.
- Chỉ Hoàn tất chạy `evaluateSetupChecklist`. Lưu nháp không chạy checklist.
- `RubricRow` còn dùng ở `PreparePanel`. Chế độ ghi ngay (nút Gắn / Đổi rubric) là mặc định. Hub truyền chế độ nháp.
- `ExamMaterialsCard` còn dùng ở lobby. Upload / xoá vẫn ghi server ngay. Chỉ thêm callback tùy chọn để hub biết ô file đang treo.
- Sau khi roster đã freeze, PATCH loại thi bị từ chối cùng phòng và giờ (`assertRosterNotFrozen`).
- Giá trị loại thi chỉ `TK` | `GK` | `CK`. Nhãn ô trên hub là **Loại thi**.
- `?step=folder` thành `materials`. `?step=schedule` thành `info`. Thiếu hoặc sai `step` thì mở `info`. Đổi bước dùng `replace`, không đẩy history.
- Commit theo task khi user yêu cầu. Không push.

---

## File structure

| File | Task | Việc |
|---|---|---|
| `apps/api/src/exam-session/dto/update-exam-session.dto.ts` | 1 | `examType?` |
| `apps/api/src/exam-session/exam-session.service.ts` | 1 | `updateSchedule` ghi `examType` |
| `apps/api/test/exam-session.e2e-spec.ts` | 1 | PATCH loại thi: được khi chưa freeze, 400 sai giá trị, 409 sau mở |
| `packages/shared/src/api/schema.d.ts` | 1 | Regen client |
| `apps/web/src/lib/api/exam-session.ts` | 1 | Body PATCH thêm `examType` |
| `apps/web/src/app/teacher/exam-sessions/[id]/_components/setup-draft.ts` (+ test) | 2 | Kiểu nháp, storage, so sánh bẩn |
| `apps/web/src/app/teacher/exam-sessions/[id]/_components/setup-commit.ts` (+ test) | 3 | Trộn checklist, quyết định flush / bước lỗi |
| `apps/web/src/app/teacher/exam-sessions/[id]/_components/SetupDraftProvider.tsx` | 4 | Context, debounce 400ms, `beforeunload` |
| `SetupStepper.tsx`, `SetupFooter.tsx`, `setup-steps.ts` | 4 | Năm bước, query, footer |
| `apps/web/src/app/teacher/exam-sessions/[id]/page.tsx` | 4–8 | Khung: dòng tên, stepper, một bước, footer |
| `SessionInfoStep.tsx` | 5 | Thông tin chung |
| `SessionExamRosterCard.tsx` | 6 | Nháp dialog thêm tay |
| `RequiredDeliverablesEditor.tsx` | 7 | Bỏ nút lưu; nhận / trả giá trị form |
| `ExamMaterialsCard.tsx` | 7 | Callback ô file đang chọn |
| `RubricRow.tsx` (+ test) | 7 | Prop chế độ nháp |
| `SessionReviewStep.tsx` | 8 | Checklist + Mở phiên |

---

## Task 1: PATCH nhận loại thi

**Files:** DTO, `updateSchedule`, e2e, regen schema, `updateExamSessionSchedule` ở web.

Hợp đồng: body có thể chỉ gửi `examType`. Cửa giữ `assertRosterNotFrozen`. `endTime > startTime` vẫn áp khi có giờ. Không đụng tên, lớp, học kỳ.

- [x] **Step 1:** `UpdateExamSessionDto.examType` optional, `@IsIn(EXAM_TYPES)` — cùng hằng form tạo đang dùng.
- [x] **Step 2:** `updateSchedule` coi `examType` là một field có mặt. Nhánh “body rỗng thì trả về phiên” phải tính cả `examType`. Khi có giá trị, `sessions.update` ghi cột `examType`.
- [x] **Step 3:** E2e trên phiên `scheduled`: `PATCH { examType: 'GK' }` → response `GK`. `examType: 'XX'` → 400. Sau `open`, PATCH loại thi → 409 (cùng cửa phòng / giờ).
- [x] **Step 4:** `pnpm --filter @cine/shared generate:api-client`. Kiểm `UpdateExamSessionDto` trong `schema.d.ts` có `examType`.
- [x] **Step 5:** `updateExamSessionSchedule` body thêm `examType?: ExamType`.

---

## Task 2: Kho nháp thuần

**Files:** `setup-draft.ts`, `setup-draft.test.ts`

```ts
type SetupStepId = 'info' | 'roster' | 'materials' | 'rubric' | 'review';

type SetupDraft = {
  sessionId: string;
  updatedAt: string;
  info?: { examType: string; roomId: string; startLocal: string; endLocal: string };
  folder?: ReplaceRequiredDeliverablesFormValues;
  rubricChoice?: string;
  rosterDialog?: { mode: 'add'; fields: Record<string, string> };
  materialsFilePending?: boolean;
};
```

Key: `exam-setup-draft:${sessionId}`.

- [x] **Step 1:** `readSetupDraft` / `writeSetupDraft` / `clearSetupDraft`. Storage throw thì bỏ qua (cùng kiểu `session-list-memory.ts`).
- [x] **Step 2:** `stripClean(draft, server)` xoá nhánh nào giống server. `info` so `examType`, `roomId`, giờ local. `folder` so giá trị form. `rubricChoice` rỗng hoặc trùng rubric đang gắn thì xoá. Hai `sessionId` không đọc chung key.
- [x] **Step 3:** Test đúng bảng spec §11 cho storage: refresh đọc lại; hai phiên không đè; bỏ nháp xoá key.

---

## Task 3: Quyết định Lưu nháp / Hoàn tất

**Files:** `setup-commit.ts`, `setup-commit.test.ts`

Hàm thuần, không gọi `fetch`. Page sẽ gọi mutation sau khi hàm trả về việc cần làm.

- [x] **Step 1:** `infoReady(info)` — có `TK|GK|CK`, có phòng, có hai mốc, `end > start` theo cùng luật form lịch hiện tại.
- [x] **Step 2:** `saveDraftPlan(draft, server)` trả danh sách việc ghi và phần giữ lại trong nháp. Thông tin chung chỉ vào danh sách khi `infoReady`. Thư mục chỉ khi qua `replaceRequiredDeliverablesSchema`. Rubric chỉ khi `choice` khác rỗng và khác id đang gắn. Đề và roster không có việc flush. Phần chưa đủ điều kiện nằm trong `kept`.
- [x] **Step 3:** `finishPlan(draft, server, counts)` trộn draft lên server rồi gọi `evaluateSetupChecklist`. Có `blockReason` → `{ ok: false, step }` với thứ tự `info` rồi `materials`. Không chặn → `{ ok: true, plan }` từ `saveDraftPlan`. Không trả lời `open`.
- [x] **Step 4:** Test: giờ kết thúc trước giờ bắt đầu vẫn không phải lý do chặn điều hướng (hàm này không có nhánh “cấm rời bước”). Hoàn tất thiếu file nộp → `step: 'materials'`, không có PUT. Checklist chỉ cảnh báo thiếu rubric → `ok: true`. Lưu nháp thư mục sai schema nhưng info hợp lệ → PATCH info nằm trong plan, folder nằm trong `kept`.

---

## Task 4: Khung trang

**Files:** provider, stepper, footer, `setup-steps.ts`, `page.tsx`

Năm bước, nhãn và icon đúng spec §5: Thông tin chung `Info`, Danh sách thi `Users`, Đề & thư mục `FolderOpen`, Rubric `ClipboardList`, Xem lại `ListChecks`.

- [x] **Step 1:** `parseStep(search)`: `folder` → `materials`, `schedule` → `info`, còn lại không thuộc năm id thì `info`.
- [x] **Step 2:** Provider bọc hub. Snapshot bước hiện tại đăng ký bằng callback (bước gọi `registerSnapshot`). Rời bước và `beforeunload` gọi snapshot rồi `writeSetupDraft`. Đang gõ: debounce 400ms. Đợi query phiên xong mới đổ nháp lên. Status không còn `scheduled` thì xoá key và không đổ nháp.
- [x] **Step 3:** `page.tsx` xếp: `PageHeader` «Thiết lập phiên thi» + link Danh sách; một dòng chỉ đọc `session.name` (không mã, không badge, không nút); stepper `nav` `aria-label="Các bước thiết lập"`; một bước; footer sticky. Stepper `sticky` trong cột hub, không `fixed` đè sidebar.
- [x] **Step 4:** Stepper ngang, `aria-current="step"` trên bước đang chọn. Không mục nào disabled khi `scheduled`. Trạng thái nhìn: lỗi > đang chọn > bẩn > thường, token spec §8.1. Cạnh dưới 2px khi đang chọn. Hàng `overflow-x-auto`, bước chọn `scrollIntoView`. Dòng «Bước n / 5» trong vùng nội dung. Đổi bước `router.replace` query `step`. Focus vào `h2` của bước mới.
- [x] **Step 5:** Footer spec §4.2. Quay lại disabled ở bước 1. Tiếp tục ẩn ở Xem lại. Hoàn tất chỉ ở Xem lại khi `scheduled`. Lưu nháp và Bỏ nháp chỉ khi `scheduled`; Bỏ nháp chỉ khi draft khác server. Ba nút điều hướng không gọi API.
- [x] **Step 6:** Test stepper: bấm bước bất kỳ khi form info đang sai giờ vẫn đổi `step` và không có toast lỗi. Dòng tên phiên hiện trên bước Rubric.

Bước chưa làm ở task sau thì render heading đúng tên, nội dung trống, để khung chạy được trước.

---

## Task 5: Bước Thông tin chung

**Files:** `SessionInfoStep.tsx`, bỏ card và form lịch khỏi `page.tsx`

- [x] **Step 1:** Heading **Thông tin chung**. Mô tả: «Sửa loại thi, thời gian và phòng thi trước khi mở phiên.» Không lặp tên phiên.
- [x] **Step 2:** Chỉ đọc: badge trạng thái, mã phiên (nút sao chép giữ `copySessionCode`), môn, lớp, học kỳ.
- [x] **Step 3:** Ô sửa khi `scheduled`: **Loại thi** (Thường kỳ / Giữa kỳ / Cuối kỳ), **Thời gian** (Bắt đầu, Kết thúc), **Phòng thi** (`SearchableSelect` catalog active). Hết `scheduled` thì disabled. Không nút «Lưu lịch».
- [x] **Step 4:** Giá trị ô lấy từ draft `info` nếu có, không thì từ server. Effect reset theo server không ghi đè nhánh `info` còn bẩn.
- [x] **Step 5:** Cuối bước, hàng nút cũ của card Thông tin phiên: Vận hành, Huỷ phiên khi `scheduled`, Quản lý bài thu và Chuẩn bị chấm khi `collecting` | `completed`. `cancelled` không có nút mở lại.
- [x] **Step 6:** Xóa card «Thông tin phiên» và card «Lịch & phòng».

---

## Task 6: Danh sách thi

**Files:** `SessionExamRosterCard.tsx`

Thêm, gỡ, import vẫn gọi API ngay. Không đưa dòng roster vào storage.

- [x] **Step 1:** Card nhận draft dialog thêm tay và báo về khi ô chữ đổi. Rời bước thì đóng dialog; quay lại bước thì mở lại và đổ chữ nếu draft còn.
- [x] **Step 2:** File import không khôi phục. Nếu rời bước lúc đã chọn file mà chưa import, giữ cờ trong draft và khi quay lại hiện một dòng rằng file vừa chọn chưa được nhập. Không lưu đối tượng `File`.

---

## Task 7: Đề & thư mục, và Rubric

**Files:** editor, `ExamMaterialsCard`, `RubricRow`

Một bước `materials`, hai khối dọc. Khối trên `ExamMaterialsCard`. Khối dưới editor + preview. Preview vẫn đọc tên file đề đã có trên server (upload xong là query đổi, preview trên cùng bước thấy tên mới).

- [x] **Step 1:** `RequiredDeliverablesEditor` bỏ nút «Lưu cấu hình thư mục». Giá trị form do provider đổ vào và đọc ra (`reset` khi draft hoặc server đổi, theo luật Task 2). Schema không chạy lúc rời bước.
- [x] **Step 2:** `ExamMaterialsCard` thêm callback tùy chọn khi ô file có hoặc mất file đã chọn. Lobby không truyền. Hub ghi `materialsFilePending`. Quay lại bước khi cờ còn: dòng «File vừa chọn chưa được tải lên.» Upload thành công thì xóa cờ.
- [x] **Step 3:** `RubricRow` thêm `persist?: 'immediate' | 'draft'`, mặc định `immediate`. `draft`: không nút Gắn / Đổi; `onChoiceChange` đưa `choice` cho provider. `PreparePanel` không truyền prop, test hiện có của nút gắn vẫn đúng. Hub dùng `draft`.
- [x] **Step 4:** Khi `active`: khối đề vẫn sửa được; khối thư mục chỉ `ExamFolderPreview`. Từ `collecting` trở đi cả hai khối khoá theo ma trận spec 2026-10-18.

---

## Task 8: Xem lại, Lưu nháp, Hoàn tất

**Files:** `SessionReviewStep.tsx`, nối footer với `setup-commit` và các mutation đang có (`useUpdateExamSessionSchedule`, `useReplaceRequiredDeliverables`, `useSetSessionRubric`, `useOpenSession`).

- [x] **Step 1:** Xem lại khi `scheduled`: `SetupChecklist` với input đã trộn (giờ và loại thi từ draft info, số file nộp từ draft folder nếu có, rubric từ `rubricChoice` hoặc id server, số đề và số SV từ query). Nút **Mở phiên thi** trong bước, `disabled` theo `canOpen`, gọi `open` như hiện tại. Footer Hoàn tất không gọi `open`.
- [x] **Step 2:** Lưu nháp: snapshot, chạy `saveDraftPlan`, gọi mutation từng việc. Việc thành công thì xoá nhánh draft đó. Việc API lỗi thì giữ nhánh và hiện lỗi trên bước đó, không `replace` sang bước khác. Nhánh nằm trong `kept`: toast kiểu «Thư mục bài thi vẫn nằm trong bản nháp trên máy này.» Không nhảy bước. Có ít nhất một việc thành công và không có lỗi API: toast «Đã lưu nháp.»
- [x] **Step 3:** Hoàn tất: snapshot, chạy `finishPlan`. `ok: false` → không gọi API, `replace` sang `step`, focus heading, hiện `blockReason` (giờ thì ở nhóm Thời gian, thiếu file thì ở khối thư mục), chấm trạng thái lỗi trên stepper. `ok: true` → ghi như Lưu nháp. Mọi ghi xong: xoá draft, toast «Đã lưu thiết lập.», ở lại Xem lại. Cảnh báo checklist vẫn hiện.
- [x] **Step 4:** Bỏ nháp: `clearSetupDraft`, đổ form từ server, không gọi API.
- [x] **Step 5:** Phiên không `scheduled`: ẩn Lưu nháp, Hoàn tất, Bỏ nháp. Quay lại / Tiếp tục vẫn đổi bước. Xem lại không checklist mở; câu «Đã khoá — phiên đã mở hoặc đã kết thúc.»
- [x] **Step 6:** Test trang hoặc provider theo spec §11 còn lại: refresh khi draft bẩn; Hoàn tất thiếu file không `open` và không PUT rỗng; Hoàn tất chỉ thiếu rubric vẫn lưu và không tự mở; status `active` không có nút ghi, ô loại thi / thời gian / phòng disabled, mã môn lớp học kỳ vẫn hiện.

---

## Review focus

1. Đổi bước không mất chữ đã gõ và không gọi PATCH.
2. Hoàn tất là lúc duy nhất chạy checklist; không mở phiên.
3. Loại thi chỉ sửa khi chưa freeze; nhãn UI là Loại thi.
4. `PreparePanel` vẫn gắn rubric ngay trên màn chấm.
5. Tên phiên là một dòng trên mọi bước, không nằm trong form Thông tin chung.
6. Lobby và form tạo không đổi.

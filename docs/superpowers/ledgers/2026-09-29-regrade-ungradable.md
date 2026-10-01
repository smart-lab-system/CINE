# Ledger thực thi G3 — chấm lại bài không chấm được

Plan: `docs/superpowers/plans/2026-09-29-regrade-ungradable.md` (14 task) · Spec: `docs/superpowers/specs/2026-09-29-regrade-ungradable-design.md` (rev 2)
Nhánh `feat/grading-g3-regrade` rẽ từ `feat/grading-gaps-g1-g5` (base `fa0c7a7`) · DB `examcollect_g3` · `REDIS_DB=13` · cổng smoke 4003/3003 · **không có migration**.
Thực thi inline (không subagent). **Chưa có VERDICT của `code-reviewer` — người dùng đã hoãn sang MỘT lượt review chung G1→G5.** Chưa push, chưa mở PR.

GitNexus không dùng được (kết nối MCP quá hạn): không chạy `impact`/`detect_changes`; thay bằng grep và `git diff --stat` trước mỗi commit.

## 1. Commit theo task

| Task | Commit | Nội dung | Kiểm chứng của task |
|---|---|---|---|
| 1 | `02f22de` | `regradeRefusal` — hàm thuần, thứ tự trạng thái → điểm → lớp | jest `regrade.service.spec.ts` 12/12; đỏ đúng lý do (`Cannot find module`) |
| 2 | `602a0e2` | `GradingResultView.ungradableClass` | e2e `grading-results-triage` + `grading` 16/16; đỏ = TS2339 |
| 3 | `b3cbda6` | `RegradeService.regradeOne` + `POST /grading-results/:id/regrade` | e2e `regrade` 9/9; **mutation check** (mục 3) |
| 4 | `274420f` | `enqueue`: xoá job `completed`/`failed` cùng `jobId` trước khi thêm | e2e `regrade` 17/17 + `regrade-real-queue` 1/1 trên Redis thật; **mutation check** |
| 5 | `834cef3` | `regradeUngradable` + `POST /exam-sessions/:id/regrade-ungradable` | e2e `regrade` 23/23 |
| 6 | `8732f5e` | e2e đường điều tra đầu-cuối (`attempt_no = 2`, lớp NULL, có điểm) | `regrade-loop` 1/1 (xanh ngay, đúng thiết kế: không có mã sản xuất đổi) |
| 7 | `b336831` | sinh lại `schema.d.ts` (+81 dòng), `ungradableClass?` ở web, `lib/api/regrade.ts`, `hooks/useRegrade.ts` | web `tsc` chỉ còn nhiễu `read-workbook.test.ts`; eslint 0 |
| 8 | `2ff325c` | `countSystemUngradable`, `groupByUngradableReason` | vitest 7/7 |
| 9 | `d96e3f6` | `RegradeButton` | vitest 7/7 (nay 11/11, mục 5) |
| 10 | `8e712a1` | nút đầu phiên thật, chỉ đếm lớp `system` | `page.test` 27/27 |
| 11 | `302a56e` | khối "bài đã dừng" ở `RunningPanel` | `RunningPanel`+`page` 48/48 |
| 12 | `257e477` | `UngradableView` + `InvestigatorDossier` | cây `[resultId]` 16 file / 129 test |
| 13 | `f149ecd` | `AiServiceBand` + gắn vào `page.tsx` | cây `teacher/grading` 33 file / 321 test |
| sau browser pass | `9c95b32`, `ac83eea`, `5bac4fb` | toast thành công, nút không bị kéo giãn, toast lỗi | mục 5 |
| 14 | commit chứa file này | xác minh đầy đủ + ledger | mục 2 |

## 2. Xác minh đầy đủ (Task 14) so với baseline

| Hạng mục | Baseline (G1) | Kết quả G3 |
|---|---|---|
| api unit (`pnpm --filter api exec jest`) | 1167 pass, 7 skip | **1179 pass**, 7 skip (= 1167 + 12 của `regrade.service.spec.ts`). Lần chạy toàn bộ có 3 test hết giờ 5000 ms ở ba suite không đụng tới (`eval/check-dataset`, `eval/test-bundle`, `sandbox-worker/handle-measure`) khi bốn phiên cùng chạy; chạy riêng đúng ba file: 39/39 xanh, và xanh khi `--testTimeout=60000` |
| api e2e toàn bộ (serial) | G1: 10 suite / 110 test (danh sách riêng) | **66 suite: 65 pass, 1 fail; 559 pass + 1 fail = 560 test.** Một fail là `exam-authoring-attach` "phiên chưa tới giờ thi" (201 mong, 400 nhận) — **đỏ sẵn từ trước, chỉ G2 sửa**, không đụng ở đây. Ba suite mới của G3 và mọi suite lân cận plan liệt kê đều nằm trong lượt này và xanh |
| web vitest toàn bộ | 96 file / 1190 test | **99 file / 1220 test pass** (+3 file: `regrade-triage` 7, `RegradeButton` 11, `AiServiceBand` 6; cộng chênh ròng ở `page`/`RunningPanel`/`UngradableView`/`InvestigatorDossier`) |
| web `tsc --noEmit` | 7 dòng, đều ở `read-workbook.test.ts` | 2 lỗi TS (+ dòng nối), **cả hai ở `read-workbook.test.ts`**, 0 lỗi nơi khác. Hai lần chạy chỉ khác dòng cuối do `pnpm` in (mã thoát 1 hay 2) |
| eslint | — | web: 0 lỗi, 3 cảnh báo cũ ở `exam-sessions/new/page.tsx`, `submissions/page.tsx` (không đụng); api: 0 lỗi, 6 cảnh báo cũ, không cái nào ở file `regrade*` |
| `pnpm check:cycles` | 0/0 | **0 vòng lặp** (480 file api, 14 file agent) |
| `next build` | OK | OK. **Chạy hai lần** (lần 1 sau Task 13: 33,4 s; lần 2 sau ba commit sửa của browser pass: 21,7 s) vì commit cuối sửa mã web |

Smoke API thật bằng worker thật với mô hình/môi trường chạy bài thật: **không chạy** (worktree này không có mô hình lẫn môi trường chạy bài). Hai bằng chứng toàn ngăn xếp có thể có mà không cần chúng đều là test: Task 4 bước 3 (Redis thật + worker thật) và Task 6 (đường điều tra).

## 3. Hai mutation check

- **Task 3 bước 5** — bỏ `ungradableClass: null` và `ungradableReason: null` khỏi `.set()` của `requeue`: ca *"sau khi chấm lại, ghi điểm lần đầu KHÔNG vi phạm ràng buộc lớp lý do"* **đỏ** với `QueryFailedError: new row for relation "grading_result" violates check constraint "ck_grading_result_ungradable"`. Khôi phục: 9/9 xanh.
- **Task 4 bước 3** — đổi `state === 'completed' || state === 'failed'` thành `state === 'failed'`: `regrade-real-queue` **đỏ** — `job.data.submissionId` nhận về là của job ma, không phải của bài vừa chấm lại (BullMQ bỏ qua im lặng lệnh `add` vì đã có job `completed` cùng `jobId`). Điều spec chỉ *đọc từ kiểu* nay đã *quan sát được* trên Redis thật. Khôi phục: 18/18 xanh.

## 4. Ba test cũ "mã hoá luật đóng băng cũ" (Task 14 bước 4) — đã đọc, không đoán

`GRADING_LOCKED_SQL` (`grading-lock.ts`) = luật 6: khoá khi có bài `ai_grading`/`ai_graded`, hoặc có `ai_total_score`, hoặc có điểm chấm tay, hoặc có lượt tính điểm; phiên chỉ có bài không chấm được thì **không** khoá.
- `T-FREEZE-1` (`grading-reference.e2e-spec.ts:210`): bài ở `ai_grading` → 409. Khớp luật 6. **Đã kiểm, giữ nguyên.**
- `T-FREEZE-3` có hai bản (`grading-freeze.e2e-spec.ts:32` mức DB; `grading-reference.e2e-spec.ts:225` qua route): chỉ bài không chấm được → sửa được; thêm một bài có điểm → khoá. Khớp. **Giữ nguyên.**
- `session-rubric.e2e-spec.ts:349` (409 khi có bài đang chấm) + ca liền sau (đổi được khi mọi kết quả là bài không chấm được). Khớp. **Giữ nguyên.**
- `T-ATT-2`: `grep` toàn `apps/api/test` và `src` **không thấy test mang mã này**. `exam-authoring-attach.e2e-spec.ts` có hai ca 409 theo thời gian/trạng thái phiên (dòng 145, 170), không liên quan khoá chấm. **Không sửa gì.**

Quan sát cho người dùng (không phải lỗi của plan này): chấm lại đưa bài sang `ai_grading`, nên **khoá** đề/đáp án/gói test/rubric của phiên (luật 6) cho tới khi bài có điểm hoặc lại dừng. Hộp xác nhận không nói điều đó, spec cũng im lặng. Ai cần sửa thước phải làm **trước** khi chấm lại.

## 5. Browser pass (theo `docs/superpowers/plans/2026-09-30-g2-g5-browser-pass.md`)

Môi trường: API build chạy cổng 4003 bằng `.env.test` (`WEB_ORIGIN=http://localhost:3003`), `next dev -p 3003`, Chromium headless qua `docs/superpowers/tools/pw-mcp.mjs`. Dữ liệu dựng bằng một spec e2e dùng một lần (đã xoá, không commit) bằng helper `seedSession/seedResult/forceStatus/seedCodeSession…`; **không gọi AI thật** — mô hình là bản chặn, môi trường chạy bài `null`, bài tự luận chấm lại bằng `KeywordGradingProvider` (0 token). Ảnh và nhật ký ở `.superpowers/browser-pass/artifacts/` và `results.log` (thư mục bị ignore). Lượt cuối chạy trên mã HEAD với dữ liệu mới.

**Hai điều kiện hạ tầng giao thức chưa nói** (không phải lỗi sản phẩm): (1) `next dev` cần `API_URL=http://localhost:4003` **cùng** với `NEXT_PUBLIC_API_URL` — route BFF `app/api/auth/login/route.ts` đọc `API_URL` và mặc định cổng 4000, nên đăng nhập trả 500; (2) `node_modules/.pnpm/playwright@1.60.0` của worktree chỉ có liên kết `playwright-core`, phải trỏ `PLAYWRIGHT_LOCAL_MCP_PLAYWRIGHT_PATH` sang kho dùng chung của `grading-ui-rebuild` (chỉ đọc). Thêm: BullMQ của API dưới `.env.test` dùng tiền tố `bull-test` (không phải `bull`).

| Kịch bản | Task | Kết quả | Ảnh |
|---|---|---|---|
| **S1** màn phiên (phiên A: 3 bài `system` cùng lý do R1, 1 bài `system` R2, 1 bài lớp `submission` cùng chữ R1, 1 bài đã có điểm) | 9, 10, 13 | **ĐẠT 18/18**: đầu phiên "Chấm lại 4 bài lỗi hệ thống" (bài lớp `submission` không đếm; thanh tổng quan vẫn ghi 5 bài không chấm được — chủ ý); băng "Dịch vụ AI lỗi — 3 bài không chấm được cùng một lý do" kèm lý do nguyên văn và câu "không đo được khoảng thời gian"; hộp xác nhận nói số bài / có tính phí / đóng trang không dừng; mở rồi Huỷ **không** gửi request; xác nhận từ băng → `POST /exam-sessions/:id/regrade-ungradable` 201 `{requeued:3}`, worker chấm lại 3 bài (`keyword-match@1`, lớp NULL), bài R2 và bài lớp `submission` đứng yên; tải lại → còn "Chấm lại 1 bài", băng biến mất; nút đầu phiên → 201 `{requeued:1}` | `s1-01…s1-06` |
| **S2** màn đang chấm (phiên B: 1 bài `ai_grading` không job, 2 `system`, 1 `submission`) | 11 | **ĐẠT 7/7**: "3 bài đã dừng … 2 bài trong số đó chấm lại được", nút "Chấm lại 2 bài lỗi hệ thống", khối "Đang chạy ngay lúc này" vẫn mang *cần backend*, câu cũ "cần một route mà backend chưa có" đã mất, 201 `{requeued:2}`, còn "1 bài đã dừng" sau khi worker chạy | `s2-01…s2-04` |
| **S3** hồ sơ (phiên C: 2 bài code đường điều tra dừng THẬT vì môi trường chạy bài chưa cấu hình, 1 bài lớp `submission`) | 12 | **ĐẠT 9/9**: bài lớp `submission` chỉ có "Chấm tay bài này"; bài `system` có "Chấm lại bài này" và "Chấm lại cả 2 bài cùng lý do" (đếm từ danh sách, bài lớp `submission` không tính); xác nhận → 201; DB `1:ungradable,2:ungradable` (lượt chấm thứ hai thật sự được mở, môi trường chạy bài vẫn chưa cấu hình nên lại dừng ở lớp `system` — trung thực) | `s3-01…s3-05` |
| **S4** lỗi 409 cố ý (tạm dừng hàng đợi, một lượt chấm lại khác chen vào qua API, rồi bấm Xác nhận ở hộp cũ) | 9 | **ĐẠT 5/5** sau khi sửa (phát hiện #3). 409 là cố ý nên console/network ghi đúng một dòng 409 | `s4-01-409-toast.png` |

Console `[error]` và request lỗi: S1 0 / 1 (một `GET grading-progress` **bị huỷ** `net::ERR_ABORTED` trong 1 ms — truy vấn đang bay bị làm mới đè lên, không phải lỗi HTTP); S2 0/0; S3 0/0; S4 1/1 (đúng cái 409 cố ý).

**Lỗi tìm thấy bởi trình duyệt (cả ba đều là chỗ test đơn vị không với tới) và cách xử lý**
1. *Thông báo "Đã xếp lại N bài" và các dòng "bỏ qua" biến mất* (`s1-04-after-confirm.png`). UPDATE chấm lại xoá lớp lý do, nên danh sách làm mới ngay không còn đếm các bài ấy; nút ở đầu phiên/băng/khối đang chấm gỡ khỏi cây sau ~600 ms và kéo theo thông báo nằm trong chính nó. Giảng viên chỉ thấy hộp đóng lại. **Sửa** (`9c95b32`): thêm `toast.success` cùng nội dung; khối inline giữ nguyên theo spec §4.4. Test đỏ trước (toast không bao giờ được gọi).
2. *Nút "Chấm lại N bài này" trong băng bị kéo giãn hết chiều ngang* (`s2-01-running.png`) vì khối bọc là cột flex mặc định căn `stretch`. **Sửa** (`ac83eea`): `items-start` + thông báo `w-full`; test ghim nguyên nhân.
3. *Lỗi 409 nguyên văn không đọc được* (S4). `onSettled` làm mới → bài đã `ai_grading` → hồ sơ đổi sang màn "AI đang chấm" và gỡ cả nút lẫn hộp thoại giữ Alert đỏ: vi phạm ràng buộc của plan "mọi lỗi mutation hiện nguyên văn". **Sửa** (`5bac4fb`): `onError → toast.error(error.message)`; Alert trong hộp giữ cho lỗi mà màn hình không đổi (mạng, 500). Test đỏ trước.

**Vẫn CHƯA kiểm bằng trình duyệt:** lớp `system` kèm *không có `ungradableClass`* từ API cũ (chỉ test đơn vị — trình duyệt luôn nói chuyện với API mới); đường chấm lại bằng AI thật và môi trường chạy bài thật; chấm lại một job `active` còn đang chạy (D5); `queue.add` lỗi sau khi DB đã sang `ai_grading`; màn hẹp/di động; tiếp cận bàn phím và đọc màn hình của hộp thoại; bài tự luận `.docx` thật (dữ liệu dựng dùng `.txt`).

## 6. Mọi dòng `Ruling:`

1. **Task 14 bước 6 và bước 2** ghi `git add -A` và `taskkill //F //IM node.exe` — luật cứng của brief cấm cả hai. Dùng `git add <đường dẫn cụ thể>` và không bao giờ giết `node` theo tên (chỉ dừng tiến trình tự chạy, bằng `TaskStop` hoặc đúng PID). *Giá nếu sai:* jest worker lạc của phiên khác có thể ăn job BullMQ — giảm nhẹ vì Redis db 13 riêng.
2. **Task 10** — thay test `page.test.tsx` *"Chấm lại N bài lỗi hệ thống is disabled + cần backend and sends nothing"` bằng hai test: test cũ khẳng định hành vi trước G3 mà G3 cố ý đổi (spec §3 liệt kê nó là test phải thay); fixture của nó cũng không có `ungradableClass`, nay chủ ý không được đếm (Review Focus #5). *Giá nếu sai:* không.
3. **Task 11** — thay test `RunningPanel.test.tsx` *"regrading system-stopped results is disabled + cần backend"* bằng hai test; cùng lý do. *Giá nếu sai:* không.
4. **Task 12** — thay ca 3 của `UngradableView.test.tsx` (khẳng định `disabled` + hai huy hiệu) và đổi một khẳng định `toBeDisabled → toBeEnabled` ở `InvestigatorDossier.test.tsx`; các ca 1, 2, 4, 5 giữ nguyên khẳng định; hai ca "không được đổi" (lớp `submission` không có nút chấm lại; bài chấm tay không có "Chấm lại bài này") vẫn xanh, không đụng. *Giá nếu sai:* không.
5. **Browser pass #1** — giữ Alert inline `role="status"` (spec §4.4) và **thêm** `toast.success` từ `RegradeButton`. *Giá nếu sai:* thừa một toast mỗi lần chấm lại.
6. **Browser pass #3** — giữ Alert đỏ trong hộp và **thêm** `toast.error` qua `onError`. *Giá nếu sai:* thông báo trùng khi cả hai cùng sống.

Không có `Ruling` nào cho `body: { reason }` của Task 7: kiểu sinh ra là `{ reason?: string | null }` nên không cần ép kiểu.

## 7. Điểm chạm file dùng chung (người ghép cần hoà giải)

`grading.module.ts` (+2 import, +`RegradeController`, +`RegradeService`) · `grading.service.ts` (+1 dòng ở interface, +1 dòng ở ánh xạ, ngay sau `ungradableReason`) · `page.tsx` (import `countSystemUngradable`, `systemFailed`, prop `sessionId` của `RunningPanel`, `<AiServiceBand>` trước `{loading ? (`) · `SessionHeader.tsx` (vùng nút chấm lại) · `InvestigatorDossier.tsx` (`sameReasonCount` + ba prop ở nhánh `d.ungradableClass && !handGraded`) · `packages/shared/src/api/schema.d.ts` (sinh lại — khi ghép với G2/G4/G5 thì **sinh lại**, không sửa tay) · `lib/api/grading.ts` (+`ungradableClass?`) · `RunningPanel.tsx`, `UngradableView.tsx`. File riêng của G3: `regrade.service.ts`, `regrade.controller.ts`, `dto/regrade-ungradable.dto.ts`, `lib/api/regrade.ts`, `hooks/useRegrade.ts`, `lib/regrade-triage.ts`, `RegradeButton.tsx`, `AiServiceBand.tsx`.

## 8. Giới hạn đã biết

1. `queue.add` lỗi sau khi DB đã sang `ai_grading` → bài kẹt không job; cứu bằng nút *Chấm tiếp N bài treo* có sẵn (D4 giữ cho ca chính không dính job `completed`).
2. Job `active` cho một bài vừa được đưa về `ai_grading` (D5): job đọc DB mới; chưa có test chứng minh lượt chạy dở ấy kết thúc sạch.
3. Băng "Dịch vụ AI lỗi" đo "cùng lý do", không đo "trong một khoảng ngắn", vì danh sách không có thời điểm dừng — và nói thẳng trên màn hình.
4. Chấm lại không có ước lượng chi phí (ngoài phạm vi); hộp xác nhận chỉ nói mỗi bài là một lượt gọi mô hình có tính phí.
5. Chấm lại khoá thước của phiên (mục 4).

## 9. Minor (hoãn)

- Hộp xác nhận theo lý do ghi `…cùng lý do: “Dịch vụ AI không phản hồi.”.` — hai dấu chấm khi lý do vốn đã kết thúc bằng dấu chấm.
- Ảnh `s2-01-running.png`: nút *Chấm tiếp N bài treo* có sẵn (không phải của G3) chữ vàng sẫm trên nền xanh, tương phản thấp.
- Mô tả ở hồ sơ đang chấm ("Tải lại sau ít phút") không tự làm mới — hành vi có sẵn.
- Ca `id không tồn tại → 404` của `regrade.e2e-spec.ts` xanh cả khi chưa có route (route vắng cũng trả 404), nên chỉ có nghĩa sau khi route tồn tại.

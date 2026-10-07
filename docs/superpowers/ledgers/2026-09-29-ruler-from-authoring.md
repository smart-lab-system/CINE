# Ledger thực thi G2 — Thước và nguồn tài liệu chấm

Nhánh `feat/grading-g2-ruler` (rẽ từ `feat/grading-gaps-g1-g5` = `fa0c7a7`) · plan `docs/superpowers/plans/2026-09-29-ruler-from-authoring.md` (11 task) · spec `docs/superpowers/specs/2026-09-29-ruler-from-authoring-design.md` rev 2 · DB `examcollect_g2`, `REDIS_DB=12`, API 4002, web 3002 · migration `1789500000000`.

Thực thi inline (một phiên, không subagent). **Chưa có VERDICT của code-reviewer — người dùng đã hoãn sang MỘT lượt review chung G1→G5.** Chưa push, chưa mở PR.

GitNexus (`mcp__gitnexus__*`) không dùng được trong phiên (kết nối quá hạn), nên không chạy `impact`/`detect_changes`; blast radius kiểm bằng grep và bằng bộ test đầy đủ ở Task 11.

## Commit theo task

| Task | Commit | Kiểm chứng |
|---|---|---|
| 1 `putObject` + `attach` ghi thật | `ef3bda4` | storage unit 22/22; attach e2e 9/9 (ca "phiên chưa tới giờ thi" đỏ sẵn nay **xanh, không sửa một dòng**) |
| 2 `flattenAuthoringCases` | `eb2c5c3`, `26af14d` | `authoring-bundle.spec.ts` 10/10 |
| 3 `adoptFromAuthoring` | `8c1c296` | attach + test-bundle e2e 19/19 |
| 4 `model_answer_set_at` | `69c1595` | grading-reference e2e 22/22; `src/grading` unit 622 passed |
| 5 `readiness.sources` | `7795498` | grading-reference + attach e2e 40/40 |
| 6 `constraintQuote` + `drop-case` | `fa7db1d` | test-bundle + attach e2e 26/26 |
| 7 schema + kiểu web | `728136b` | web tsc: chỉ 4 dòng nhiễu `read-workbook.test.ts` |
| 8 bảng duyệt bộ ca | `fe5805a` | `TestBundleList` 9, `TestBundleCard` 6 (assertion giữ nguyên) |
| 9 dòng nguồn + băng vàng | `2eefa2b` | `ReferenceForm` 22 + `PreparePanel` 18 |
| 10 dòng nguồn gốc thước | `fdb3c72` | cả cây `src/app/teacher/grading` 33 file / 326 test |
| sửa F1 (browser pass) | `a856124` | e2e mới đỏ → xanh |
| sửa F2 (browser pass) | `d5ad154` | đo layout ở Chromium đỏ → xanh |

Lịch sử Task 1 Step 1: `git show 4e06f00^:apps/api/src/storage/storage.service.ts | grep -c putObject` = `0` (spec §1.1 đúng); `git show 4e06f00 --stat` = `attach-exam.service.ts` 2 dòng xoá + `storage.service.spec.ts` 24 dòng xoá (hai lời gọi và hai test).

## Task 11 — xác minh cuối (chạy SAU commit cuối `d5ad154`)

| Kiểm | Kết quả | Baseline |
|---|---|---|
| API unit `pnpm --filter api exec jest` | **1179 passed / 7 skipped** (125 suite) | 1167 / 7 → +12 (2 storage + 10 authoring-bundle) |
| API e2e toàn bộ `jest --config ./test/jest-e2e.json` | **63 suite / 558 test, 0 đỏ** | plan ghi "10 suite" (con số của G1, không có file baseline trong worktree này) — không so được; 0 đỏ |
| Web vitest toàn bộ | **98 file / 1214 test** | — |
| `tsc` api | 0 lỗi | — |
| `tsc` web | 4 dòng, **toàn bộ trong `src/lib/read-workbook.test.ts`** | plan nói "7 dòng": đó là 4 dòng này + 3 dòng nhiễu của wrapper khi chạy qua `pnpm --filter web exec` |
| eslint `src` web / api | 0 lỗi (3 + 4 cảnh báo, đều ở file nhánh này không chạm) | — |
| `pnpm check:cycles` | `0 vòng lặp` (480 file api, 14 file agent) | — |
| `next build` (một lần, sau commit cuối) | exit 0 | — |
| Smoke API (`.superpowers/browser-pass/smoke.mjs`, API build ở cổng 4002) | **13/13** (8 bước của plan + 5b + 2 ca phụ) | — |

Smoke chạy trên bản build **trước** sửa F1 (F1 chỉ chạm `dropCase`); sau F1 tôi build lại và lượt browser pass đã đi qua `drop-case` thật trên bản mới.

Smoke xác nhận: sau gắn, `testBundle.pinned === true`; `sources.modelAnswer` = `authoring`, `unverified`, hai `setAt` có giá trị; gói `generated` đã duyệt với số ca đúng bằng số ca của đề (6/6); mọi ca có KHOÁ `constraintQuote`; gắn lần hai → `pinned === false` và `test_bundle_id` không đổi; `modelAnswer.setAt` đi tiếp sau lần gắn hai và **đứng yên** khi chỉ `PUT` `questionMaterialId`.

## Các dòng `Ruling:` (đủ, theo thứ tự)

1. **Task 1** — thân `attach` viết bằng nháy kép (kiểu có sẵn của file; plan dùng nháy đơn). Chỉ là kiểu; giá nếu sai: không.
2. **Task 2** — thêm ca unit thứ 10 (120 ca trùng tên dài) và đổi hậu tố khử trùng thành cắt `base` theo độ dài thật của hậu tố. Plan cắt cứng 61 ký tự → khoá thứ 100 dài 65 ký tự, nổ `CHECK` của DB (đỏ: `Received 65`). Chỉ cộng thêm; 9 ca của plan vẫn xanh.
3. **Task 3** — `test-bundle.e2e-spec` ca "GET list/chi tiết" thêm `origin: 'teacher'` vào `toEqual`: hình dạng của `list()` đã cố ý đổi; thay chứ không nới lỏng.
4. **Task 3** — `adoptFromAuthoring` đọc `approved_at` bằng `SELECT` sau hai `UPDATE`, không dùng `UPDATE … RETURNING` như plan: TypeORM 0.3.31 trả `[rows, rowCount]` cho `UPDATE`, nên `const [approved] = …` là cả mảng hàng và `approvedAt` ra `undefined` (đỏ: body `testBundle` thiếu `approvedAt`). Trả `toISOString()` để kiểu `string` đúng thật.
5. **Task 6** — cùng ca đó, `constraintQuote: null` thêm vào `toEqual` của chi tiết gói; thay chứ không nới lỏng.
6. **Task 6** — thêm ca e2e "bỏ ca khỏi gói generated chưa duyệt giữ origin" và khẳng định nội dung thông báo ở ca 404 "ca không thuộc gói": ca 404 của plan **xanh ngay ở bước đỏ** vì route chưa tồn tại cũng trả 404; ca `drop` của plan chỉ dùng gói `teacher` nên `origin` gán cứng vẫn qua (đã thử đột biến: đỏ `Expected generated / Received teacher`).
7. **Task 7** — phản hồi `grading-readiness` không được schema sinh ra mô tả (controller trả interface, không có Swagger) nên `sources` KHÔNG nằm trong `schema.d.ts`; kiểu mirror ở `lib/api/grading.ts` vẫn là nguồn sự thật (đúng tình huống plan đã lường). Schema có thêm route `drop-case`, `DropTestCaseDto`, `modelAnswerSetAt`.
8. **Task 8** — fixture `ca3` của `TestBundleList.test` đổi `expectedOutput` `'7'` → `'49'`: plan để cả input lẫn output là `'7'` nên `getByText('7', { selector: 'td.font-mono' })` thấy hai phần tử. Khẳng định không đổi.
9. **Task 9** — ca "dòng nguồn chưa có dữ liệu — nhãn 'cần backend'" của `ReferenceForm.test` bị XOÁ và thay bằng describe 7 ca: hành vi nó khẳng định đã cố ý đổi. 6/7 ca mới đỏ trước khi sửa; ca thứ 7 ("API không có `sources`") là lưới hồi quy và xanh ngay.
10. **Task 10** — thêm `vi.mock('…/RulerOriginNote', () => ({ RulerOriginNote: () => null }))` vào `[resultId]/page.test.tsx` (plan chỉ kể `page.test` và `InvestigatorDossier.test`): file này dựng `InvestigatorDossier` thật, nên hook của dòng mới ném `No QueryClient set`. Chỉ cộng một mock; G4 sửa `[resultId]/page.tsx` và có thể chạm file test này — giữ mock một dòng khi ghép.

## Phát hiện ngoài plan

- **F0 (có sẵn, KHÔNG sửa — ngoài phạm vi):** `TestBundleService.approve()` dùng cùng khuôn `const [row] = await ds.query(UPDATE … RETURNING)` nên thân phản hồi HTTP là `{}` (smoke xác nhận: `approve response body: {}`, status 201). Web `approveTestBundle` trả `void` nên chưa ai đọc. Để dành cho lượt review chung.
- **F1 (đã sửa, `a856124`):** `dropCase` chép ca mà **bỏ cột `auto_dropped_reason`** (cả `SELECT` lẫn `INSERT`), nên ca hệ thống đã tự bỏ sống lại thành ca thật ở phiên bản mới và số ca của gói tăng sau khi giảng viên bỏ bớt một ca. Bắt được khi dựng dữ liệu browser pass. Test e2e `bỏ một ca không làm sống lại ca hệ thống đã tự bỏ` đỏ (`autoDroppedReason` thành `null`) → xanh. Hiện chưa có mã nào ghi cột này (người ghi sẽ là G2b) nên chưa hỏng dữ liệu thật.
- **F2 (đã sửa, `d5ad154`):** bảng bộ ca dùng `table-fixed` + bốn cột rộng cố định trong thẻ ~590px, ép cột "câu trong đề mà ca này kiểm" còn **32px** ở 1360px (0px ở 900px). jsdom không có layout nên vitest không thấy. Đo ở Chromium: đỏ `[96,160,160,32,112]` → xanh `[64,96,96,208,96]` (1360px) và `[64,96,96,160,96]` (900px). `bp-run.mjs` giờ khẳng định cột ≥ 150px.
- **Nhân quả với D4 của spec:** sau gắn từ Soạn đề, băng vàng "chưa từng chạy thử" quả thật gần như không hiện (đã ghim gói), đúng điều spec báo trước; nó hiện ở: đề không sinh ca nào (B3), và đáp án ghi chú đánh dấu chưa kiểm chứng khi chưa ghim.
- Thông báo 409 của `dropCase` in `approved_at` dạng chuỗi `Date` của JS ("Thu Oct 01 2026 13:43:22 GMT+0700 …") — cùng khuôn với `approve()` có sẵn; UI không hiện nút khi gói đã duyệt nên chỉ gặp qua đua tranh. Minor, để dành.

## Browser pass (docs/superpowers/plans/2026-09-30-g2-g5-browser-pass.md)

Môi trường: API build chạy từ `.env.test` ở cổng 4002 (`WEB_ORIGIN=http://localhost:3002`), `next dev -p 3002` với **cả** `API_URL=http://localhost:4002` **và** `NEXT_PUBLIC_API_URL=http://localhost:4002`, Chromium headless qua `docs/superpowers/tools/pw-mcp.mjs`. Dữ liệu dựng bằng một spec e2e dùng một lần (`.superpowers/browser-pass/zz-browser-seed.e2e-spec.ts.txt`, không `git add`) gọi API thật (`generate` + `attach`) và helper `grading-seed` / `investigator-seed`; sáu kịch bản phiên: B1 gắn một lần, B2 gắn hai lần, B3 đề không có ca, B4 gói giảng viên viết (kèm ca hệ thống đã tự bỏ), hai phiên có bài code (gói `generated` ghim / gói `teacher` ghim).

Ghi chú môi trường (giao thức browser pass chưa nói):
- Worktree này thiếu `playwright@1.60.0/node_modules/playwright` trong `.pnpm` riêng (chỉ có link `playwright-core`), nên `findRepoPlaywright()` thất bại; đặt `PLAYWRIGHT_LOCAL_MCP_PLAYWRIGHT_PATH` trỏ vào bản của `grading-ui-rebuild` (chỉ đọc).
- Route proxy `/api/auth/login` và `/refresh` của web đọc `API_URL` (mặc định `http://localhost:4000`), không phải `NEXT_PUBLIC_API_URL`; thiếu nó thì đăng nhập 500 `ECONNREFUSED`.
- `TaskStop` trên `pnpm exec next dev` để sót tiến trình con nghe cổng 3002; tôi dừng nó **theo PID** sau khi kiểm đó là tiến trình trên cổng của mình.

**Lượt cuối (sau `d5ad154`): 48/48 khẳng định đạt, 0 lỗi console, 0 request lỗi/4xx/5xx.** Hai tín hiệu lành: một cảnh báo của Next dev (`scroll-behavior: smooth` trên `<html>`, có sẵn) và một request RSC prefetch `/teacher/dashboard` bị `ERR_ABORTED` do chính lệnh điều hướng của kịch bản (status 200, không phải lỗi app). Các lượt trước: 44/47 (3 "lỗi console" là bộ đọc của tôi đếm nhầm log `info` của Next), 45/47 (2 lỗi là logic kiểm sức khoẻ của tôi); sửa công cụ, không sửa khẳng định.

| Kịch bản | Đạt |
|---|---|
| **T9** `ReferenceForm` — B1: "Nguồn: bạn tải lên lúc … (de-thi.docx)." và "Nguồn: gắn từ Soạn đề lúc … (dap-an-va-test.docx)."; không còn nhãn "cần backend" trong form (ba nút G2b vẫn còn đúng 3 nhãn); ghim rồi thì **không** có băng vàng | đạt |
| **T9** — B3 (đề không ca, chưa ghim): băng vàng `role=status` "chưa từng chạy thử" + "thước bạn chưa đọc" + dòng nguồn vẫn còn; trạng thái rỗng của danh sách gói | đạt |
| **T9** — B4 sau `PUT` ghi chú + chưa kiểm chứng qua API: "Nguồn: bạn ghi chú lúc …." (không nói "tải lên"), băng vàng hiện, không có dòng nguồn đề | đạt |
| **T8** bảng duyệt — B1: năm tiêu đề cột đúng, 3 ca, cột trích dẫn "—", gói đã duyệt không có "Bỏ ca này", huy hiệu "Thước do hệ thống sinh" + "Đang dùng", câu giới hạn luôn hiện, **cột trích dẫn ≥ 150px** | đạt |
| **T8** — B4: "2 ca" (ca hệ thống đã bỏ không tính), “Cho 1 ≤ n ≤ 100” trong ngoặc, ca đã bỏ gạch ngang kèm lý do và không có nút, 2 nút "Bỏ ca này"; bấm bỏ → "Phiên bản 2" "1 ca" (F1 không tái hiện); Duyệt → "Đã duyệt lúc" + "Ghim"; Ghim → "Đang dùng", vẫn không có dòng thước vì gói giảng viên viết, băng vàng tắt | đạt |
| **T8** — B2: hai gói đều `generated`, v2 chưa duyệt có 3 nút "Bỏ ca này"; bỏ → v3 vẫn `generated` với "2 ca" | đạt |
| **T10** — trang danh sách B1: "Thước do hệ thống sinh — bạn duyệt lúc …."; B3 (chưa ghim): không có | đạt |
| **T10** — phiên có bài code, gói `generated` ghim: dòng thước **đúng một lần** ở danh sách và ở hồ sơ bài code; gói `teacher` ghim: không có ở cả hai | đạt |

Ảnh: `.superpowers/browser-pass/artifacts/` (`t9-1…3`, `t8-1…6`, `t10-1…4`, `t8-width-1360/900`). Script: `bp-run.mjs`, `bp-width.mjs`, `smoke.mjs`; nhật ký `bp-run.log`.

**Chưa kiểm bằng trình duyệt:** (1) thông báo lỗi 409 của `drop-case` (UI ẩn nút nên không gây được; có unit + e2e); (2) lỗi mạng khi `Bỏ ca này`/`Duyệt`/`Ghim` (không giả lập); (3) trang tự luận (không có dòng thước, theo thiết kế — chưa dựng bài tự luận để nhìn); (4) viewport điện thoại; (5) dark mode; (6) đường `ReferenceForm` lưu thật (chọn file đáp án, bấm "Lưu tài liệu chấm") — chỉ đọc dòng nguồn, không ghi qua form; (7) trạng thái `origin: 'from_model_answer'` (chưa có mã nào tạo gói loại này — G2b).

## Còn mở / giới hạn chấp nhận (spec §8)

1. Gói test hỏng **sau** khi đề và đáp án đã ghi → `attach` trả 500 nhưng đề+đáp án đã nằm trong phiên, chưa có thước; gắn lại tạo bản đề thứ hai. Có test ghi nhận hành vi này.
2. Đáp án (khoá cố định) bị ghi đè **trước** khi DB cam kết; lần gắn hỏng sau đó để byte mới dưới dòng mô tả bản cũ.
3. Sàn §14.3 (gói test chưa từng chạy → `ungradable`) vẫn chưa được thi hành cho phiên đã chấm; `grading-run.service.ts:212` chỉ chặn lúc bắt đầu.
4. G2b: ba nút ở `PreparePanel` (*Sinh đáp án mẫu và gói test từ đề* / *Sinh gói test từ đáp án của bạn* / *Chạy thử đáp án mẫu với gói test*) giữ `disabled` + "cần backend".
5. Giả thuyết `putObject` rơi khi ghép nhánh vẫn là **suy luận** (không đọc được commit ghép cụ thể).

## Điểm chạm file dùng chung (người ghép đối chiếu)

- `apps/api/src/grading/grading.module.ts`: chỉ thêm `TestBundleService` vào `exports` (dòng 188).
- `apps/web/src/app/teacher/grading/page.tsx`: `<RulerOriginNote sessionId={sessionId} />` ngay sau `<SessionHeader … />` (+ một import); G3 phải đặt băng của nó sau khối `results.isError`; S thay `SessionPicker` ở nhánh `!sessionId`.
- `PreparePanel.tsx`: một prop `hasPinnedBundle` trên `<ReferenceForm>`.
- `InvestigatorDossier.tsx`: `<RulerOriginNote … />` sau `{header(…)}` ở nhánh bố cục thường (+ một import).
- Test: `[resultId]/page.test.tsx` thêm một mock một dòng (xem Ruling 10).
- `packages/shared/src/api/schema.d.ts`: sinh lại ở Task 7 — khi ghép xung đột thì **sinh lại**, lấy hợp với G3/G4/G5.
- Migration `1789500000000-AddModelAnswerSetAt.ts`: người ghép phải chạy trên DB của mình.

# Ledger thực thi G4 — kiểm mẫu ngẫu nhiên và màn kiểm mù

Nhánh `feat/grading-g4-audit` (rẽ từ `feat/grading-gaps-g1-g5` @ `fa0c7a7`) · plan `docs/superpowers/plans/2026-09-29-audit-sampling.md` · spec `docs/superpowers/specs/2026-09-29-audit-sampling-design.md` · DB `examcollect_g4` · `REDIS_DB=14` · API smoke cổng 4004 · web dev cổng 3004 · **không migration** (dải `1789520000000` để trống).

> **Chưa có VERDICT của `code-reviewer`** — người dùng đã hoãn sang MỘT lượt review chung G1→G5. Gói này ở trạng thái "đã qua test và đã qua một lượt trình duyệt, chưa qua review độc lập". Chưa push, chưa PR.

GitNexus (`mcp__gitnexus__*`) không dùng được trong phiên này (`CONNECT_TIMEOUT`). `impact` trước khi sửa symbol và `detect_changes` trước khi commit được thay bằng `grep` + `git diff --stat fa0c7a7..HEAD` (xem mục "Phạm vi thay đổi"). `ScoreService.writeInitial` và `GradingService.listForSession` là hai symbol có nhiều người gọi nhất bị sửa — plan đã nêu và người dùng đã duyệt plan.

## Commit theo task

| Task | Commit | Kiểm chứng đã chạy (kết quả) |
|---|---|---|
| 1 hàm rút mẫu thuần | `838dd0d` | `jest src/grading/audit-sampling.spec.ts` → 25/25 (đỏ trước: `Cannot find module`); `tsc`, eslint sạch |
| 2 rút ở quyết định đầu | `503e0e4` | e2e `audit-sampling` + `score-service` + `finish-attempt` + `investigator-run` → 4 suite / 29 test xanh (đỏ trước đúng hai ca như plan đoán); `score-service.e2e-spec.ts` xanh **không sửa** |
| 3 giấu điểm/lỗi ở API | `d0dc92d` | `jest src/grading` → 69 suite / 659 xanh (+1 skipped); `audit-blind.spec` 12/12; e2e `grading-results-triage` + `grading` 15/15 |
| 4 rò phía luật + canary | `68a199e` | e2e `audit-blind` 6/6 (đỏ trước: 3 ca đỏ, lộ thật `before:"8.63"`); `rules-prices` + `rules-routes` + `rule-entries` + `score-service` → 4 suite / 28 xanh, không sửa |
| 5 so sánh nhãn (thuần) | `3007b56` | `jest src/grading/audit/audit-compare.spec.ts` → 7/7 (đỏ trước: `Cannot find module`) |
| 6 ghi nhận xét + tải bài nộp | `86069da` | e2e `audit-review` 13/13 (đỏ trước: 13/13 đỏ vì 404 không có route); `error-exception` + `finalize-investigator` + `grading-lifecycle-v2` → 3 suite / 24 xanh; `grading.module.spec` 16/16 |
| 7 schema + API/hook web | `a04eb65` | schema sinh lại từ API build của nhánh (cổng 4004, `.env.test`): +80 dòng thuần cộng thêm, có cả hai route; web `tsc` = 7 dòng cũ của `read-workbook.test.ts` |
| 8 danh sách ẩn điểm + màn chốt | `790d3fe` | vitest `session-triage` + `ResultsTable` + `FinalizePanel` → 79/79 (đỏ trước: 5 ca đỏ đúng chỗ plan đoán) |
| 9 thẻ tiết lộ | `924f616` | vitest `AuditReveal` → 12/12 (đỏ trước: `Failed to resolve import`) |
| 10 panel kiểm mù + nhánh ở route hồ sơ | `216991c` | vitest `AuditReview` 14/14; `page.test` 19/19; cả thư mục `[resultId]` 18 file / 156 xanh |
| (browser pass) sửa retry tải bài nộp | `1008d0a` | `useAudit.test.ts` (mới) đỏ trước, xanh sau; xem "Browser pass" |

Không `git push`, không PR. File seed một lần cho browser pass (`zz-g4-browser-seed.e2e-spec.ts`) **không được commit** — bản sao nằm ở `.superpowers/browser-pass/zz-g4-browser-seed.e2e-spec.ts.txt` (thư mục bị ignore).

## Xác minh đầy đủ (Task 11)

- **API unit:** `pnpm --filter api exec jest` → 127 suite xanh (2 skipped), **1211 test xanh + 7 skipped**. Baseline G1 là 1167 + 7 skipped; chênh +44 = `audit-sampling` 25 + `audit-blind` 12 + `audit-compare` 7.
- **API e2e, chạy cả bộ** (`jest --config ./test/jest-e2e.json`): 66 suite — 65 xanh, **1 đỏ có sẵn**: `test/exam-authoring-attach.e2e-spec.ts` › "phiên chưa tới giờ thi -> gắn được cả đề lẫn đáp án…" (đỏ y hệt trên nhánh gốc theo ledger G1 — `attach-exam.service.ts` dựng file mà không upload; **chỉ G2 sửa**, G4 không đụng). Tổng 558 xanh / 1 đỏ / 559. Ba suite của G4 (`audit-sampling` 6, `audit-blind` 6, `audit-review` 13) xanh trong lượt chạy cả bộ. Không có baseline tổng cho cả bộ e2e trong ledger G1 (chỉ có tập con "10 suite 110/110"), nên không so được con số tổng.
- **Web:** `vitest run` ở trạng thái **cuối** (sau cả bản sửa của browser pass) → **99 file / 1226 test xanh**. Baseline G1: 96 file / 1190. Chênh +3 file, +36 test = `AuditReveal` 12 + `AuditReview` 14 + `useAudit.test` 2 + `session-triage` +4 + `ResultsTable` +1 + `page` +3. `FinalizePanel` net 0 (một ca bị **thay**, không thêm).
- **`tsc` web:** byte-identical với baseline (7 dòng, đều trong `src/lib/read-workbook.test.ts`). `tsc` api sạch.
- **eslint:** web `eslint src` 0 lỗi (3 cảnh báo cũ ở `exam-sessions/new/page.tsx`, `submissions/page.tsx`, không phải file G4); api `eslint src` 0 lỗi (6 cảnh báo cũ, không file nào của G4).
- **`pnpm check:cycles`:** `0 vòng lặp trong 485 file dưới apps/api/src` · `0 vòng lặp trong 14 file dưới apps/agent/src`.
- **`next build`:** chạy MỘT lần (OK) **trước** bản sửa một dòng `retry: false` của browser pass; không chạy lại sau đó — bản sửa chỉ thêm một khoá vào `useQuery`, đã qua `tsc`, eslint và vitest.

### Phạm vi thay đổi (thay `detect_changes`)

`git diff --stat fa0c7a7..HEAD` (trước commit ledger này) — 34 file, +2150 −13: `ScoreService` (`writeInitial` + `drawnForAudit` riêng tư), `GradingService.listForSession` (bọc `blindAuditRow`), `loadResultDetail` (trả bản mù đầu hàm), `ErrorRuleService.preview` + `listByState`, `PriceService.preview`, `GradingModule` (controller + provider), `audit/*`, `audit-sampling.ts`, `audit-blind.ts`, schema sinh lại, và các file web theo plan. Không có gì ngoài danh sách đó; không có migration.

## Rulings

- **Task 3** — Bước nối danh sách và hồ sơ (3, 4) không có test đỏ riêng trong plan; canary của Task 4 phủ chúng, nên tôi **mutation-check cả hai chỗ nối** ở Task 4 (bỏ `blindAuditRow` / vô hiệu hoá `return blindResultDetail`, canary phải đỏ). Giá nếu sai: không, chỉ thêm một lần kiểm.
- **Task 6** — `AuditReviewService.record` kiểm "đã có nhãn" **trước** "trạng thái ≠ `audit_pending`" (plan và spec §4.4 để thứ tự ngược lại). Ghi nhãn đẩy bài sang `teacher_reviewed`, nên với thứ tự của plan lần ghi thứ hai luôn nhận câu "không ở trạng thái kiểm mẫu" và nhánh "đã ghi — khoá" **không bao giờ chạm tới**; e2e của chính plan (`ghi lần hai → 409 'Nhận xét kiểm mẫu của bài này đã ghi'`) đòi câu "khoá". Giá nếu sai: một kết quả không ở kiểm mẫu mà lại có nhãn sẽ báo "khoá" (vẫn đúng sự thật).
- **Task 10** — Test `giữ panel sau khi ghi nhận xét…` trong plan dùng MỘT phần tử hằng cho cả `render` lẫn `rerender(tree)`; React bỏ qua render khi phần tử cùng tham chiếu, nên trang không bao giờ đọc `resultsData` mới và **mutation check của Step 5 không đỏ** (phát hiện nhờ chạy nó, đúng như plan dặn). Đổi `tree` thành hàm dựng phần tử mới mỗi lần. Giờ bỏ `|| audited` thì đúng ca đó đỏ (`Unable to find … audit-panel`); khôi phục → 19/19. Giá nếu sai: không (chỉ test).
- **Browser pass** — dùng `playwright@1.60.0` của worktree `grading-ui-rebuild` (CHỈ ĐỌC, qua `PLAYWRIGHT_LOCAL_MCP_PLAYWRIGHT_PATH`) vì `node_modules/.pnpm/playwright@1.60.0/node_modules` của worktree này thiếu chính gói `playwright` (chỉ có `playwright-core`) — không sửa gì trong hai `node_modules`.
- **Browser pass** — thêm `retry: false` cho `useSubmissionDownload` (lệch khỏi mã của plan) vì lỗi tìm thấy ở trình duyệt; xem bên dưới.

### Sự cố đã xử lý

Thư mục scratchpad được dùng CHUNG giữa bốn phiên G2–G5. Tên file chung chung `zz-browser-seed.e2e-spec.ts` ở đó bị phiên G3 ghi đè bằng seed của họ; tôi đã chép nhầm và chạy MỘT lần trên `examcollect_g4`. Tác động duy nhất: thêm một giảng viên `browser@example.test` cùng vài phiên/bài của seed G3 vào DB e2e của tôi (e2e không bao giờ dọn; vô hại, không ảnh hưởng DB G3). Đã xoá bản chép; seed của G4 đặt tên riêng, nằm thẳng trong worktree, không commit.

## Mutation check

| Chỗ sửa bị hoàn tác tạm | Ca phải đỏ | Kết quả |
|---|---|---|
| CTE `latest` của `listByState` (bỏ `g.status <> 'audit_pending'`) | `số đếm của luật…` | đúng một ca đỏ; khôi phục → 6/6 |
| `return blindAuditRow(view)` → `return view` | `danh sách: không điểm…` | đúng một ca đỏ |
| `loadResultDetail` bỏ nhánh `audit_pending` | `hồ sơ: không breakdown…` | đúng một ca đỏ |
| `page.tsx` bỏ `\|\| audited` | `giữ panel sau khi ghi nhận xét…` | đỏ **sau khi sửa test** (xem Ruling Task 10); trước đó mutation KHÔNG đỏ |

Ba chỗ rò còn lại của Task 4 (tier 2 của `rules/preview`, `price/preview`, và chính CTE) đều có lần chạy **đỏ trước khi sửa** với dữ liệu rò thật (`before:"8.63"`, `openSessions` có 1 phần tử, `ruleCount` = 1).

## Browser pass

Theo `docs/superpowers/plans/2026-09-30-g2-g5-browser-pass.md`, driver `docs/superpowers/tools/pw-mcp.mjs`. Plan G4 ghi rõ *"No browser pass; a screenshot pass over one seeded `audit_pending` result is the first thing the common review should do"* — đây là lượt đó. Dữ liệu dựng bằng một spec e2e dùng một lần chạy với `GRADING_AUDIT_SAMPLE_PERCENT=100`, nên hai bài kiểm mẫu rơi vào `audit_pending` bằng **chính đường rút mẫu thật** (không `forceStatus`); bài thứ ba là bài tự quyết thường để đối chứng. Bí mật cần canh: điểm hệ thống **8,63** (10 − 1,37) và việc hệ thống giữ luật "Sai biên (BM-ALPHA)" mà không giữ "Đặt tên biến (BM-BETA)".

Lượt cuối (giảng viên mới, seed mới, mã cuối `1008d0a`): **68 khẳng định, 68 đạt** — `s2` 17, `s3` 30, `s4` 21. Ảnh ở `.superpowers/browser-pass/artifacts/` (thư mục bị ignore): `01-list`, `02-list-filter-audit`, `03-finalize`, `04-finalize-link-landing`, `05-audit-panel-blind`, `06-confirm-dialog`, `07-reveal`, `08-reveal-after-refocus`, `09-dossier-after-open`, `10-list-after-A`, `11-audit-panel-no-file`, `12-409-verbatim`, `13-finalize-unblocked`. Nhật ký từng lượt ở `.superpowers/browser-pass/out/s{2,3,4}-final.txt`. (Các ảnh chụp trang dài bị lệch thanh bên/thanh trên do chụp `fullPage` khi trang đã cuộn — là hiện vật của ảnh, không phải lỗi giao diện.)

**Task 8 — danh sách ẩn điểm, màn chốt điểm (17/17)**
- Hai dòng kiểm mẫu hiện `ẩn` + `chờ nhận xét của bạn` + biểu tượng `EyeOff` + câu lý do nguyên văn; không dòng nào chứa chữ số điểm. Bài tự quyết thường vẫn hiện `8,63 tạm tính`.
- **Mạng:** payload `GET …/grading-results` — hai dòng kiểm mẫu mù hoàn toàn (`aiTotalScore`, `confidence`, `currentScore`, `finalScore`, `advocateOpinion`, `triage` đều null, `criterionResults` rỗng, `currentScoreSource: 'none'`); chuỗi `8.63` không có trong dòng nào của chúng; đối chứng bài thường mang `8.63`. Trang danh sách không gọi `/investigation`.
- Bộ lọc `Kiểm mẫu · 2` còn đúng 2 dòng. Màn chốt: nhóm đọc "2 bài kiểm mẫu chưa kiểm", **không còn nhãn `cần backend`**, liên kết `…&state=audit` đúng, nút `Chốt điểm phiên` khoá kèm "Còn 2 bài chưa xong"; bấm liên kết đưa về danh sách đã lọc (2 dòng).

**Task 10 — panel kiểm mù (đạt, cùng `s3` 30/30)**
- Trước khi giảng viên chọn: tên, MSSV, huy hiệu `Kiểm mẫu`, ba điều nói thẳng, link `Tải bài nộp (Cau1.docx)` (URL ký tới đúng khoá của bài), hai luật dạng checkbox kèm mô tả, **không có giá (1,37 / 0,50), không có điểm 8,63, không có chữ "đã trừ"**.
- **Mạng trước khi chọn:** không response nào ngoài danh sách chứa `8.63`; trang không gọi `/investigation` hay `submission-text`; `GET /rules` cho `sai_bien = 1` (chỉ bài thường B) và `ten_bien = 0` — hai bài kiểm mẫu bị loại khỏi số đếm.
- Nhãn rỗng phải có chủ ý; hộp xác nhận nói "Nhận xét ghi rồi thì khoá, không sửa được"; mở hộp và bấm `Xem lại` không gửi gì (0 POST); `Ghi và khoá` gửi đúng một POST → 201.
- **D19 trên trình duyệt thật:** sau khi ghi, phát sự kiện lấy lại tiêu điểm cửa sổ → danh sách được tải lại (2→3 lần), payload cho thấy bài đã `teacher_reviewed` và hiện `8.63` — **vậy mà bản tiết lộ vẫn nằm trên màn**; bấm `Mở hồ sơ` mới sang hồ sơ thường, và `/investigation` lúc đó trả hồ sơ thật (`breakdown` có, điểm 8.63).
- 409 nguyên văn: mở bài D, một "tab khác" (gọi API từ Node) ghi nhãn của D trước, rồi bấm ghi ở trình duyệt → `Alert` đỏ hiện **đúng** câu "Nhận xét kiểm mẫu của bài này đã ghi — khoá, không ghi lại được.", hộp xác nhận tự đóng, form còn nguyên, không có bản tiết lộ; thân 409 không mang điểm. Bài không có file: panel nói "Bài này chưa có file trên kho lưu trữ." và không có link tải.

**Task 9 — thẻ tiết lộ, dữ liệu thật (đạt)**
- Điểm `8,63` và câu "không đổi vì nhận xét của bạn" + chỉ đường "Ngoại lệ hoặc Chấm tay"; mức trùng "Không trùng"; so sánh từng luật **bằng chữ kèm biểu tượng** (BETA "Chỉ bạn thấy", ALPHA "Chỉ hệ thống thấy"); lỗi giảng viên ghi ngoài bảng được cắt khoảng trắng; tổng kết đủ năm con số (0 · 1 · 1 · 0 · 1).

**Kiểm thẳng API thật** (build của nhánh, trong cùng lượt):
- bài kiểm mẫu chưa kiểm: `GET /investigation` mù, `grading-progress` và `rules/missing` không chứa `8.63`;
- số đếm luật tính theo **trạng thái**: sau khi A được nhận xét thì `sai_bien` = 2 (B + A), D còn kiểm mẫu không tính; `price/preview` báo `affected = 2`, không có D;
- ghi lần hai → 409 cùng câu "đã ghi — khoá".

**Chốt điểm sau khi hết bài kiểm mẫu:** khi cả hai nhãn đã ghi, nhóm "bài kiểm mẫu chưa kiểm" biến mất và nút `Chốt điểm phiên` mở. **Chưa bấm chốt** trong trình duyệt (việc chốt ghi vào DB và đã được e2e `audit-review` phủ: 409 khi còn bài kiểm mẫu, 200 sau khi nhận xét).

### Lỗi tìm thấy và cách xử lý

1. **(mã, đã sửa — `1008d0a`)** `useSubmissionDownload` thử lại một lỗi xác định 3 lần theo độ trễ mặc định của TanStack (1s, 2s, 4s): bài chưa có file → 404, nhưng panel kiểm mù chỉ hiện khung xám ≈ 7 giây rồi mới nói "Bài này chưa có file trên kho lưu trữ." — giảng viên nhìn một ô trống. Test `useAudit.test.ts` viết trước, đỏ (còn đang thử lại sau 1,5 giây), rồi `retry: false` → xanh. Chạy lại cả ba kịch bản sau bản sửa: câu lý do hiện trong vài mili-giây.
2. **(giao thức browser pass, không phải mã)** `2026-09-30-g2-g5-browser-pass.md` §2 chỉ đặt `NEXT_PUBLIC_API_URL`, nhưng route `/api/auth/login` của web (chạy phía máy chủ Next) proxy tới `API_URL` (mặc định `http://localhost:4000`). Thiếu `API_URL` thì đăng nhập 500 với "Sai email hoặc mật khẩu." Phải đặt cả `API_URL=http://localhost:400N` lẫn `NEXT_PUBLIC_API_URL`.
3. **(có sẵn, ngoài phạm vi — chỉ ghi nhận)** Form đăng nhập gửi trước khi React hydrate sẽ rơi về `GET` gốc của trình duyệt và đặt email + mật khẩu lên URL (`/login?email=…&password=…`) — form không có `method="post"`. Gặp ở máy chậm với `next dev` biên dịch lần đầu. Chưa sửa.
4. Hai request `_rsc` (prefetch của Next) bị huỷ với `ERR_ABORTED` mỗi khi điều hướng — không phải lỗi máy chủ; đã loại khỏi phép đếm "request hỏng" và ghi rõ trong từng khẳng định.

### Lỗi console/mạng cố ý

Lượt `s4` cố ý gây hai lỗi 4xx: 404 của `submission-download` (bài seed không có file) và 409 của `audit-review` (tab khác ghi trước). Console có đúng các dòng `Failed to load resource` tương ứng; không có lỗi nào khác.

## Những gì vẫn CHƯA được kiểm

- **Tỉ lệ mặc định.** Lượt trình duyệt chạy ở `GRADING_AUDIT_SAMPLE_PERCENT=100` để có chắc chắn bài rơi vào mẫu; đường rút 20 % thật chỉ được chứng minh bằng unit (`audit-sampling.spec`, 20 000 id) và e2e 5 %. **Dev và production không bao giờ tắt (biến chưa đặt = 20 %); chỉ `NODE_ENV=test` mới tắt** — đừng đọc `100` ở e2e là "mặc định là 100".
- **Bấm tải thật.** Link `Tải bài nộp` chỉ được kiểm `href` (URL ký tới đúng khoá); không bấm, không tải file từ MinIO (khoá trong seed không có đối tượng thật).
- **Lấy lại tiêu điểm cửa sổ** được mô phỏng bằng sự kiện `visibilitychange` tổng hợp, không phải đổi tab thật.
- **Bảng lỗi (trang Luật) và `price/preview` trên giao diện:** chỉ kiểm qua API thật (số đếm, `affected`), không duyệt trang `/teacher/rules`. Hệ quả nhìn thấy được đã nêu ở plan: trang Luật đếm ít hơn tới khi các bài kiểm mẫu được nhận xét.
- **Hạ nhóm khi đổi giá** (`ruleLayerTransition`, T-DEMOTE-1): giữ có chủ ý, có test cũ, không đi lại trên trình duyệt.
- **Bấm `Chốt điểm phiên`** trên trình duyệt (xem trên).
- Khung nhìn điện thoại, chế độ tối, trình đọc màn hình — chưa kiểm ngoài vai trò/nhãn truy cập đã dùng trong khẳng định.
- **Mẫu rút một lần ở quyết định đầu tiên:** bài thành tự quyết SAU khi bị gắn cờ không bao giờ vào mẫu (T-SAMP-5) — nhóm đó không bao giờ có nhãn, nên bộ hiệu chỉnh không được suy rộng. **Bài `auto_approved` có sẵn không được rút bù** (D16).
- **Review độc lập:** chưa có.

## Điểm chạm file dùng chung — người ghép cần hoà giải

| File | G4 đã làm | Ghi chú khi ghép |
|---|---|---|
| `apps/api/src/grading/grading.module.ts` | thêm `AuditReviewController` ở cuối dòng `controllers`, `AuditReviewService` sau `TestBundleService,` | G3 thêm `RegradeController` vào **cùng dòng** `controllers` — lấy hợp; G2 sửa `exports` |
| `apps/api/src/grading/grading.service.ts` | import `blindAuditRow`; `return {` → `const view: GradingResultView = {` và `return blindAuditRow(view)` ở `listForSession` | G3 thêm `ungradableClass` **bên trong** object đó (sau `ungradableReason`) — hai vùng khác nhau |
| `apps/web/src/app/teacher/grading/[resultId]/page.tsx` | một import, `useState` `audited`, một nhánh `AuditReview` trước nhánh điều tra | G2 không sửa file này |
| `apps/web/src/app/teacher/grading/_components/FinalizePanel.tsx` | bỏ `needsBackend: true` của nhóm kiểm mẫu và dòng `{g.needsBackend && <NeedsBackend />}`; **giữ** import `NeedsBackend` | G5 thay khối sổ điểm; người ghép bên thứ hai gỡ import `NeedsBackend` khi eslint báo thừa |
| `apps/web/src/lib/session-triage.ts` | nhánh `'audit'` ở `scoreCell`, một giá trị ở `ScoreTag`, một câu ở `reasonOf` | luồng S thêm hàm khác; cộng thêm |
| `apps/web/src/app/teacher/grading/_components/ResultsTable.tsx` | một import `EyeOff` và một dòng trong ô điểm | G3 thêm lối "chấm lại" ở vùng khác của bảng |
| `packages/shared/src/api/schema.d.ts` | sinh lại (+80 dòng) | sinh lại, không sửa tay, khi ghép |

Gói **không** sửa: `DossierHeader.tsx`, `exam-session-response.dto.ts`, `grading-run.service.ts`, `lifecycle/advance.ts`.

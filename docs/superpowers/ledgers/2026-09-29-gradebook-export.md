# Ledger thực thi G5 — ghi điểm vào sổ điểm

Plan: `docs/superpowers/plans/2026-09-29-gradebook-export.md` · Spec: `docs/superpowers/specs/2026-09-29-gradebook-export-design.md`
Nhánh `feat/grading-g5-gradebook` (rẽ từ `feat/grading-gaps-g1-g5` tại `fa0c7a7`) · DB `examcollect_g5` · `REDIS_DB=15` · API smoke cổng 4005 · web dev cổng 3005 · migration `1789530000000`.
Người thực thi: một phiên Claude (Sonnet 5.5) làm inline, không subagent. GitNexus (MCP) báo `CONNECT_TIMEOUT` suốt phần lớn phiên nên `impact` KHÔNG chạy trước khi sửa; ở cuối phiên nó kết nối được và `detect_changes` đã chạy (Step 7, mục 4).

> **Chưa có VERDICT của `code-reviewer` — người dùng đã hoãn sang MỘT lượt review chung G1→G5.** Gói này ở trạng thái "đã qua test, chưa qua review độc lập". Chưa push, chưa mở PR.

## 1. Từng task

| Task | Commit | Lệnh kiểm và kết quả |
|---|---|---|
| 1 — chuyển `jszip`, migration, entity | `dfc903f` (dependency), `20a80d7` | `jest --config ./test/jest-e2e.json test/grade-export-schema.e2e-spec.ts` → 7/7; `tsc`, eslint sạch; `verify-schema` → "All 30 expected tables are present" |
| 2 — zip | `6ef2c40` | `jest src/grade-export/xlsx/zip-io.spec.ts` → 11/11 |
| 3 — đọc workbook | `384eaaa` | `jest src/grade-export/xlsx` → 42/42 (zip-io 11, xml-text 15, workbook-reader 16) |
| 4 — vá ô | `53eb7cf` | `jest src/grade-export/xlsx` → 73/73 (sheet-patch 31); kiểm đột biến bên dưới |
| 5 — bốn mô-đun thuần | `4797b21` | score-string 10, rounding 24, blank-reason 11, mssv-match 11 = 56/56 |
| 6 — kế hoạch | `e83ba64` | `jest src/grade-export` → 167/167 (diff-rules 14, plan 24) |
| 7 — nạp dữ liệu + seed | `a420ce9` | e2e `grade-export-data` 8/8 ngay lần chạy đầu; `check:cycles` 0 |
| 8 — upload + inspect | `b342920` | `jest src/grade-export` 182/182; e2e inspect 11 + data 8 |
| 9 — xem trước | `29ba633` | e2e preview 17 + inspect 11 + data 8 = 36/36 |
| 10 — ghi file | `aad0ea3` | unit 186/186; e2e write 9 + preview 17 + inspect 11 + data 8 + schema 7 = 52/52; kiểm đột biến bên dưới |
| 11 — danh sách, tải, sinh lại client | `6003c7a` | e2e list 6/6; `schema.d.ts` sinh lại từ API cổng 4005 (+253 dòng, không xoá dòng nào), 5 đường `grade-exports` |
| 12 — lớp API/hook/hàm hiển thị (web) | `b1fa70e`, `5d4064b` | vitest `grade-export-view` 35/35 + `grading-export` giữ xanh |
| 13 — bước tải file + chọn cột | `c8dfa57` | vitest StepUpload 8 + StepColumns 18 = 26/26 |
| 14 — bước xem trước + danh sách lượt xuất | `24866f0` | vitest StepPreview 23 + PreviousExports 6 (+26 của Task 13) = 55/55 |
| 15 — wizard, trang, lối vào ở FinalizePanel | `001fdcc` | vitest `export/**` + `FinalizePanel` → 86/86 |
| (browser pass) — sửa mũi tên hiện hai lần | `8bed901` | test hồi quy đỏ rồi xanh; vitest `export/**` 71/71; toàn bộ web 103 file / 1296 test |

(Phiên bị cắt giữa Task 12 bởi lỗi 429 "session limit"; Task 12 được kiểm lại bằng cách **chạy test của các file dở dang**, không tin vào việc chúng tồn tại.)

## 2. Các dòng `Ruling:` (và lý do)

- **Pre-flight.** Plan dài 8,5k dòng với 15 khối Interfaces; xung đột giao diện được kiểm khi đọc brief từng task thay vì một lượt quét đầu. Giá nếu sai: một chữ ký lệch phát hiện muộn — thực tế không có chữ ký nào lệch ở Task 7–11.
- **Task 1 — `pnpm install --lockfile-only` LÀM RỖNG `node_modules` của worktree** (chạy với `CI=true`, vì `.modules.yaml` trỏ kho ảo dùng chung nên pnpm "purge"). Khôi phục trong 3 giây bằng dạng lệnh của brief (`--frozen-lockfile --config.verify-store-integrity=false --config.virtual-store-dir=<kho chung>`); kho chung và ba worktree kia được kiểm còn nguyên (resolve `@nestjs/common`, `typeorm`, `jest`, `next`). Tính nhất quán lockfile kiểm bằng `pnpm install --frozen-lockfile --lockfile-only`. **Lưu ý cho người ghép:** `--lockfile-only` KHÔNG an toàn trong các worktree dùng kho chung.
- **Task 5 — `mssv-match.spec`:** danh sách "không giống MSSV" của plan có `'MSSV'`, nhưng `MSSV` là 4 chữ cái = đúng khuôn của `ck_session_roster_mssv` (cái mà `MSSV_SHAPE` phản chiếu), nên `matchMssv` đúng khi trả `not_found`. Bỏ `'MSSV'` khỏi danh sách đó và thêm một test riêng khẳng định `'MSSV'` → `not_found`; **mã không đổi** (từ chối MSSV toàn chữ là từ chối MSSV hợp lệ). Giá nếu sai: ô có chữ "MSSV" hiện câu "không có trong danh sách" thay vì "không giống MSSV" (dòng tiêu đề đã bị `firstDataRow` loại).
- **Task 5 — chỉ hình thức:** ký tự vô hình trong brief (U+200B, NBSP, U+FEFF) viết thành `\u…` tường minh; thêm ép kiểu cho `it.each` ở nơi `tsc` đòi. Không đổi ngữ nghĩa.
- **Task 6 — `plan.spec`** "ô MSSV trống bị bỏ qua" dùng `cell('   ')` (kind vẫn `text`), còn `buildPlan` chỉ xét `kind === 'empty'` nên dòng toàn khoảng trắng thành "không khớp". Sửa **mã** (`buildPlan` coi `normalizeMssv(text) === ''` là trống — đúng thứ giảng viên thấy là ô trống), giữ nguyên test. Giá nếu sai: ô chỉ chứa ký tự rộng-bằng-không bị bỏ qua thay vì báo không khớp.
- **Task 12 — kiểu `roundingStepHundredths`:** plan khai `number`, nhưng schema sinh lại (từ `@IsIn`) khai `1 | 10 | 25 | 50`, nên `tsc` lỗi ở hai lời gọi. Tôi đã commit `b1fa70e` với lỗi đó mà không để ý (chuỗi lệnh không chặn theo `tsc`); sửa ở `5d4064b` bằng cách thu hẹp kiểu thành `RoundingStep` (không ép kiểu); `StepPreview` giữ bước làm tròn dạng `RoundingStep | null`.

## 3. Hai kiểm tra đột biến (chứng minh test cắn thật)

- **Task 4, Step 3:** cho `patchWorkbook` sửa thêm `xl/styles.xml` → test "everything else in the package is unchanged" **đỏ** với `{ name: 'xl/styles.xml', same: false }`; khôi phục, xanh.
- **Task 10, Step 4:** (1) xoá dòng chặn `expectedDigest` → "digest của bản xem trước khác → 409" đỏ (`Expected 409, Received 201`); (2) xoá dòng chặn `confirmDecreases` → ca xuất lại đỏ ở `refused.status` (`Expected 409, Received 201`); khôi phục cả hai, xanh.

(Hai kết quả `Expected/Received` trên là đầu ra thật của lần chạy, không phải suy đoán.)

## 4. Task 16 — xác minh đầy đủ (kết quả thật, đo ở HEAD `001fdcc`; riêng web đo lại ở `8bed901` sau lần sửa cuối)

| Bước | Lệnh | Kết quả |
|---|---|---|
| 1. Unit API | `pnpm --filter api exec jest` | 137 suite xanh (+2 bỏ qua có sẵn): **1353 passed, 7 skipped**. Baseline G1 1167 passed + 186 test mới của `src/grade-export/` (zip-io 11, xml-text 15, workbook-reader 16, sheet-patch 31, score-string 10, rounding 24, blank-reason 11, mssv-match 11, diff-rules 14, plan 24, names 4, errors 10, inspect-grid 5) = **1353, khớp đúng** |
| 2a. e2e của gói | `jest --config ./test/jest-e2e.json` sáu suite `grade-export-*` | **58/58** (schema 7 + data 8 + inspect 11 + preview 17 + write 9 + list 6) |
| 2b. e2e toàn bộ | `pnpm --filter api exec jest --config ./test/jest-e2e.json` | 69 suite: **68 xanh, 1 đỏ — `exam-authoring-attach`** (đỏ SẴN, không thuộc G5: `attach` trả 400 vì không upload byte lên storage; chỉ G2 sửa). 591 passed + 1 failed = 592. Các suite láng giềng (`grading-lifecycle-v2`, `finalize-investigator`, `score-service`, `error-exception`, `grading-reference`) xanh **không sửa gì** |
| 3a. vitest web | `pnpm --filter web exec vitest run` | **103 file / 1296 test xanh** (G1: 96 / 1190; thêm 7 file `grade-export-view`, `StepUpload`, `StepColumns`, `StepPreview`, `PreviousExports`, `ExportWizard`, `export/page` = +105 test, cộng +1 test hồi quy của lỗi mũi tên ở mục 5; `FinalizePanel` net 0) |
| 3b. tsc web | `pnpm --filter web exec tsc --noEmit` | 7 dòng, 2 lỗi, **tất cả ở `src/lib/read-workbook.test.ts`** (nhiễu có sẵn của nhánh gốc); 0 lỗi nào khác |
| 3c. eslint | `eslint src` (web), `eslint src test` (api) | 0 lỗi; 3 cảnh báo web và 10 cảnh báo api, **tất cả ở file có sẵn, không file nào của G5** |
| 3d. vòng import | `pnpm check:cycles` | 0 vòng lặp trong 520 file `apps/api/src`, 0 trong 14 file `apps/agent/src` |
| 3e. build | `pnpm --filter web run build` (một lần, SAU commit sửa cuối `8bed901`) | thành công; liệt kê `○ /teacher/grading/export  10.7 kB` |

Các lần e2e API (1, 2a, 2b) chạy ở `001fdcc`; commit sau đó (`8bed901`) chỉ đổi một component web và test của nó nên không đụng API. Không chạy `taskkill //F //IM node.exe …` của Step 2: luật cứng của brief cấm giết tiến trình theo tên (sẽ giết cả jest/API của các phiên khác). Mọi tiến trình do tôi chạy nền đều được dừng bằng `TaskStop` hoặc theo PID của chính mình.

### Bốn mũi kiểm máy móc (Step 4)

1. **Không số thực gần điểm** — `grep -rnE "parseFloat|Number\(" apps/api/src/grade-export` (trừ spec và `testing/`) ra đúng 4 dòng, không dòng nào đụng chuỗi điểm:
   - `xlsx/sheet-patch.ts:159` `Number(rAttr)` — số thứ tự **dòng** (`<row r="…">`);
   - `xlsx/workbook-reader.ts:124` `Number(v)` — **chỉ số** chuỗi chia sẻ (`sst[Number(v)]`);
   - `xlsx/workbook-reader.ts:155` `Number(rAttr)` — số thứ tự **dòng**;
   - `xlsx/xml-text.ts:52` `Number(match[2])` — số **dòng** trong `parseRef`.
2. `grep -rn "exceljs" apps/api/src apps/api/package.json` — không ra gì.
3. `jszip`/`yauzl` chỉ được import ở đúng một file production: `apps/api/src/grade-export/xlsx/zip-io.ts`.
4. `git diff --stat fa0c7a7 -- pnpm-lock.yaml apps/api/package.json` → 2 file, 4 dòng thêm/4 dòng bớt: `jszip` rời `devDependencies`, vào `dependencies` của importer `apps/api` (cùng `specifier ^3.10.1`, cùng `version 3.10.1`), một chỗ duy nhất. (So với `fa0c7a7` chứ không với `main`.)

### Step 7 — `detect_changes`

GitNexus MCP không kết nối được trong phần lớn phiên; ở cuối phiên nó kết nối được và `detect_changes({scope:'compare', base_ref:'fa0c7a7'})` trả: 77 file đổi, 4 symbol đã được lập chỉ mục bị chạm (`AppModule`, `dataSourceOptions`, `FinalizePanel`, `csvField`), 2 luồng bị ảnh hưởng (`FinalizePanel → StateOf`, `FinalizePanel → Cn`), mức "medium". Khớp danh sách mong đợi (app.module, data-source, FinalizePanel, csvField; module `grade-export` mới chưa có trong chỉ mục cũ `4cb6bca`). Không có luồng bất ngờ. `impact` KHÔNG được chạy trước khi sửa (MCP chưa sống lúc đó); các symbol có sẵn bị sửa chỉ ở dạng **cộng thêm** (một dòng module, một dòng entity, thay một khối trong `FinalizePanel`, thêm từ `export` cho `csvField`).

## 5. Browser pass (Playwright thật, `docs/superpowers/plans/2026-09-30-g2-g5-browser-pass.md`)

Môi trường: API đã build từ HEAD ở cổng 4005 (`.env.test`: `examcollect_g5`, Redis db 15, `WEB_ORIGIN=http://localhost:3005`), `next dev -p 3005` với **cả** `API_URL` và `NEXT_PUBLIC_API_URL` trỏ 4005 (thiếu `API_URL` thì proxy `/api/auth/login` rơi về cổng 4000), Chromium headless qua `docs/superpowers/tools/pw-mcp.mjs` (đặt `PLAYWRIGHT_LOCAL_MCP_PLAYWRIGHT_PATH` vào `playwright@1.60.0` của kho ảo dùng chung vì worktree không có `node_modules/.pnpm` riêng). Script, nhật ký và ảnh nằm ở `.superpowers/browser-pass/` (bị gitignore, không commit): `phase1.mjs`, `phase2.mjs`, `recheck-arrows.mjs`, `run-phase1.log`, `run-phase2-down.log`, `run-phase3-up.log`, `run-recheck.log`, `artifacts/*.png`, và các file tải về `output-1/2/3.xlsx`.

**Dữ liệu.** Spec dùng một lần `zz-browser-seed.e2e-spec.ts` (không commit) gọi `seedFinalizedBase` — phiên đã chốt hết, ba bài có điểm 8,50 (đường điều tra, nguồn `finalized`) / 6,50 (tự luận duyệt tay) / 5,25 (chấm tay) — cộng một sinh viên vắng (chỉ có trong `session_roster`) và một người có bài nộp mà chưa chấm. **File mẫu là file do chính Excel tạo** (`make-template.ps1` qua COM: ô gộp A1:F1, tô màu, định dạng số `0.00` cho cột Điểm, định dạng có điều kiện, đóng băng dòng, công thức `=IF(ISNUMBER(D3),D3*2,"")` ở cột Tổng kết, hai trang tính), không phải fixture của test — xem Phát hiện 2.

**Phase 1 — lượt xuất đầu (15 kịch bản).** 14 đạt ngay; 1 "đỏ" do lỗi của chính script (`expect value-equals` đòi `expected` khác rỗng), nội dung đó được kiểm lại bằng `evaluate_playwright` đọc `.value` thật ở phase 2/3: đạt. Gồm: đăng nhập; màn chốt điểm có khối *Ghi điểm vào sổ điểm* với liên kết thật tới `/teacher/grading/export?sessionId=…` và không có chữ "cần backend"; bước 1 chặn `.csv` ngay ở trình duyệt bằng đúng câu của spec; một file ".xlsx" giả (chỉ là chữ) lên tới server và nhận NGUYÊN VĂN `Đây không phải file .xlsx.` (400 cố ý); tải file Excel thật → bước 2 không hiện lưới cho tới khi chọn trang tính (file có 2 trang); mọi ô chọn ở chỗ giữ chỗ, dòng bắt đầu rỗng; chọn B/D/E + dòng 3 → tiêu đề cột mang nhãn chữ *MSSV*/*Điểm*/*Lý do*; sang bước 3 **không có request `preview` nào cho tới khi chọn làm tròn**, không radio nào được chọn, nút *Ghi vào file* tắt kèm lý do; chọn 0,5 → *Sẽ ghi 3 · Để trống 2 · Không khớp 1*, điểm có dấu phẩy, 5,25 thành 5,5; *Tải bảng kê ô trống (CSV)* là một file (blob) tải về và không tạo request tới `/grade-exports`; ghi → *Đã ghi 3 điểm vào file. 2 ô để trống, 1 dòng không khớp.*; **tải file kết quả về** (`output-1.xlsx`); *Các lượt xuất trước* hiện lượt vừa ghi.

**Đọc lại file đã tải về bằng bộ đọc của plan** (`zz-browser-readback`): `D3=8.5`, `D4=6.5`, `D5=5.5`, `E6="Chưa chấm xong hoặc chưa chốt điểm"`, `E7="Vắng — không có bài nộp"`, ô D của hai dòng trống rỗng, ô gộp `A1:F1` còn nguyên, danh sách entry zip y hệt file mẫu (kể cả `calcChain`, `docProps/custom.xml`), `calcPr` có `fullCalcOnLoad="1"`.

**Phase 2 — xuất lại có điểm GIẢM (16/16).** Giá luật `sai_bien` 1,50 → 2,50 rồi áp cho phiên đã chốt (bài 8,50 → 7,50). Tải lại CHÍNH file kết quả lần trước làm mẫu: không ô nào được chọn sẵn dù file đã từng được ghi; cảnh báo ghi đè ở bước 2 chỉ nói về "phần xem trước" và hẹn "số ô thật hiện ở bước sau"; dải *So với lần ghi trước* nói `↓ 1 bài giảm`, `↑ 0 bài tăng`, `2 bài không đổi`, `Giảm do: luật sai_bien (1 bài)`; dòng bài đổi nói `↓ Giảm — trước đã ghi 8,5, do luật sai_bien`; bộ lọc *Có thay đổi · 1*; *Ghi vào file* tắt; **hai hộp tick riêng**: *Tôi đồng ý ghi đè 1 ô đã có giá trị* (tick một mình thì nút vẫn tắt, hiện "Cần xác nhận 1 bài bị giảm điểm.") và *Tôi đã xem 1 bài bị giảm điểm và đồng ý ghi*; đổi bước làm tròn sang 0,1 **xoá mọi dấu tick** và kế hoạch mới (5,25 → 5,3 thấp hơn 5,5 đã ghi) nói thay đổi đó là *chỉ do đổi bước làm tròn*; ghi → *…1 bài giảm điểm đã được bạn xác nhận*; tải `output-2.xlsx` (`D3=7.5`); danh sách lượt cũ ghi `↓ 1 bài giảm điểm — Test Account đã xác nhận`; nút *Tải file* của lượt cũ tải đúng file.
Trong DB: lượt 2 `overwrite_count=1`, `decrease_count=1`, `decrease_confirmed_by` khác null; `audit_log` có đúng một dòng `grade_export.score_decreased_confirmed` với `before 8.50 → after 7.50` và nguyên nhân `rule sai_bien delta 100`; `grade_export_row` ghi 850/650/550 → 750/650/550 → 950/650/550 (kèm hai dòng trống có lý do mỗi lượt); dòng "người lạ" không được ghi.

**Phase 3 — xuất lại có điểm TĂNG (16/16).** Giá `sai_bien` 2,50 → 0,50 rồi áp (7,50 → 9,50); mẫu là `output-2.xlsx`. Dải nói `↑ 1 bài tăng`, `Tăng do: luật sai_bien (1 bài)`; **không có hộp xác nhận giảm** (chỉ còn hộp ghi đè); ghi; `output-3.xlsx` đọc lại: `D3=9.5`.

**Mọi kịch bản:** `get_playwright_console` — 0 lỗi ở phase 2 và 3; ở phase 1 đúng một lỗi console là cái 400 CỐ Ý của file ".xlsx" giả. `get_playwright_network` lọc lỗi — chỉ có hai mục `net::ERR_ABORTED` với `Status: 200 OK`: cách Playwright ghi `PUT` upload lên MinIO và việc điều hướng tải file (không phải lỗi thật); hot-update của `next dev` ở phase 1 cũng `ERR_ABORTED`.

### Phát hiện của browser pass

1. **Lỗi hiển thị (ĐÃ SỬA, `8bed901`):** dải *So với lần ghi trước* hiện `↓ ↓ 1 bài giảm  ↑ ↑ 0 bài tăng` — một icon mũi tên đứng cạnh mũi tên bằng chữ, vẽ mũi tên HAI LẦN. Test hồi quy viết trước (đỏ: `expected SVGSVGElement … to be null`), bỏ icon, giữ mũi tên trong chữ; xanh; kiểm lại trên trình duyệt (`recheck-arrows.mjs`: 0 svg, đúng một `↓` và một `↑`). Plan chép nguyên lỗi này; không test nào của plan bắt được vì icon không có chữ.
2. **Fixture của test KHÔNG hợp lệ với Excel.** `testing/xlsx-fixture.ts` (kể cả file gốc chưa vá) bị Excel 16 từ chối mở (`0x800A03EC`), nên mọi bảo đảm "không hỏng" của e2e chỉ chứng minh cho **cấu trúc gói**, đúng như spec §9 đã cảnh báo; chứng minh thật phải dùng file do Excel tạo (đã làm ở trên). Nguyên nhân khả dĩ (chưa khoanh): `theme1.xml` rỗng, `calcChain` trỏ vào ô không có công thức. Không sửa fixture (ngoài phạm vi), ghi lại.
3. **`seedGradebookWorld` không dùng được cho màn hình**: trang `/teacher/grading/export` chỉ mở khi MỌI kết quả chấm đã chốt (thiết kế đúng — D6, §3.10), mà "thế giới" có bốn bài chưa chốt, nên trang chặn bằng *Phiên chưa chốt điểm* (khớp `page.test.tsx`). Browser pass dùng `seedFinalizedBase` + sinh viên vắng + người chưa chấm (hai loại không có dòng `grading_result` nên không chặn trang). Hệ quả: ô trống kiểu `ungradable`/`flagged`/điểm-tạm-chưa-chốt chỉ được chứng minh ở API (e2e), không qua trình duyệt.
4. Các lỗi của chính script (không phải lỗi ứng dụng): `expect value-equals` đòi `expected`; kết quả `evaluate_playwright` bọc JSON; tên hộp tick đổi theo số ô khi đổi bước làm tròn (đúng hành vi). Đã sửa script và chạy lại, không làm lỏng khẳng định nào.

## 6. Mở bằng Excel thật (plan Task 16 bước 5)

**Excel 16.0 (build 20326 rồi 20430, máy này), mở bằng COM với cửa sổ hiện và `DisplayAlerts` BẬT.** Nếu Excel đòi sửa file thì lệnh `Open` sẽ KẸT ở hộp thoại; script chờ 45 giây rồi chụp màn hình — không lần nào kẹt.
- `output-1.xlsx`, `output-2.xlsx`, `output-3.xlsx` (tải về từ trình duyệt) **đều mở bình thường**, không hộp "repair". So với file mẫu do Excel tạo: ô gộp `A1:F1` còn gộp, tô màu và chữ đậm của tựa đề/tiêu đề còn nguyên, định dạng số cột D `0.00` còn (hiển thị `8.50`, `7.50`, `9.50`), 1 quy tắc định dạng có điều kiện còn, độ rộng cột còn, công thức cột F còn nguyên văn.
- **`fullCalcOnLoad` (D25) chạy trong Excel:** cột Tổng kết `=IF(ISNUMBER(D3),D3*2,"")` hiện `17 / 15 / 19` ở dòng 3 của `output-1/2/3` (file mẫu lưu giá trị đệm rỗng) — Excel đã tính lại khi mở. `Workbook.Saved` đọc ngay sau khi mở là `True`, tức **không quan sát được** lời tiên đoán "Excel sẽ hỏi *Lưu thay đổi?*" trong kịch bản tự động hoá chỉ-đọc này; chưa thử mở bằng giao diện rồi đóng.
- **LibreOffice KHÔNG có trên máy → chưa mở bằng LibreOffice**; việc LibreOffice có tính lại khi mở hay không vẫn chưa biết.
- **Chưa thử với một sổ điểm thật của trường** (không có file); file mẫu do Excel tạo là thay thế gần nhất nhưng không phải thứ đó.

## 7. Điều gói này KHÔNG chứng minh (nói thẳng)

- **Chưa mở bằng LibreOffice, chưa thử một sổ điểm thật của trường**, chưa thử Excel qua giao diện rồi đóng file (câu hỏi *Lưu thay đổi?*). Excel đã mở được bản đầu ra từ một file do Excel tạo, và đã tính lại công thức khi mở.
- **Browser pass chỉ phủ phiên đã chốt hết, một yêu cầu nộp, một trang tính đích, giữa Chromium headless và MinIO cục bộ.** Không phủ: phiên nhiều yêu cầu nộp qua UI (chỉ e2e + vitest), file có mật khẩu / `.xls` / macro / không địa chỉ qua UI (chỉ một file ".xlsx" giả và một `.csv`), trang tính bị bảo vệ qua UI, MSSV số mất số 0 đầu qua UI, CORS của MinIO với origin khác `localhost`, bố cục điện thoại, file gần 5 MB.
- `.csv`, `.xls`, `.xlsm` bị từ chối (D2): sổ điểm chỉ có `.csv` phải chuyển tay một lần.
- Làm tròn có thể vượt điểm tối đa của rubric khi điểm tối đa không là bội của bước (spec §9).
- Nhánh *giữ nguyên ô đã ghi* (D17) chỉ được chạm bằng cách ép trạng thái ra ngoài máy trạng thái (e2e `forceStatus`).
- File dựng bằng tiền tố namespace, dòng/ô không địa chỉ, ô giá trị quá cột BH hoặc dòng 5000 bị từ chối, không được xử lý (D22).
- Fixture của test không phải `.xlsx` hợp lệ cho Excel (Phát hiện 2).
- `exam-authoring-attach` đỏ sẵn ở e2e toàn bộ (không do G5).

## 8. Chỗ chạm chung mà G2/G4 cần hoà giải khi ghép

- `packages/shared/src/api/schema.d.ts` — sinh lại ở Task 11 (+253 dòng, không xoá); xung đột thì **sinh lại**, đừng sửa tay.
- `apps/api/src/database/data-source.ts` — thêm `GradeExportRowEntity` (một import, một phần tử mảng).
- `apps/api/src/database/verify-schema.ts` — thêm `'grade_export_row'`.
- `apps/api/src/app.module.ts` — thêm `GradeExportModule` (một import, một phần tử mảng).
- `apps/web/src/app/teacher/grading/_components/FinalizePanel.tsx` — thay khối `<section aria-label="Ghi điểm vào sổ điểm">`; **giữ import `NeedsBackend`** (danh sách nhóm đang chặn vẫn dùng ở nhánh này); G4 cũng giữ nó — **người ghép thứ hai gỡ import đã hết dùng** (eslint sẽ báo).
- `apps/web/src/lib/grading-export.ts` — thêm từ `export` trước `function csvField`.
- `pnpm-lock.yaml` / `apps/api/package.json` — `jszip` chuyển sang `dependencies`; xung đột lockfile thì sinh lại, nhưng **không** bằng `pnpm install --lockfile-only` trong worktree dùng kho ảo chung (nó làm rỗng `node_modules`, xem Ruling Task 1).
- Migration `1789530000000-GradeExportRows.ts` — độc lập với các gói khác.

## 9. Các Ruling thêm trong Task 16 và browser pass

- **Task 16:** không chạy `taskkill //IM node.exe` của Step 2 (luật cứng của brief cấm giết tiến trình theo tên). Giá nếu sai: một worker jest mồ côi của phiên khác có thể ăn job BullMQ — Redis db 15 là riêng của gói này nên rủi ro thấp; full e2e xanh trừ ca đỏ có sẵn.
- **Browser pass:** dùng `seedFinalizedBase` (+ vắng + chưa chấm) thay cho `seedGradebookWorld` mà plan gợi ý, vì trang đóng khi còn bài chưa chốt (Phát hiện 3). Giá nếu sai: các ô trống `ungradable`/`flagged` chưa qua trình duyệt.
- **Browser pass:** dùng file mẫu do Excel tạo thay cho `testing/xlsx-fixture.ts`, vì Excel không mở fixture (Phát hiện 2). Giá nếu sai: không có.
- **Browser pass:** sửa lỗi hiển thị mũi tên (Phát hiện 1) trong cùng gói thay vì chỉ ghi lại, vì sửa an toàn và có test; do đó `next build` được chạy lại sau commit sửa.

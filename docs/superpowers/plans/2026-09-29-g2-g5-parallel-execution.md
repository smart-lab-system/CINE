# G2–G5: chạy song song ở nhiều worktree — giao thức chung

Ngày: 2026-09-29 · Áp dụng cho bốn plan: **G2** thước từ Soạn đề + nguồn tài liệu · **G3** chấm lại bài không chấm được · **G4** kiểm mẫu · **G5** ghi vào sổ điểm. G1 đã xong ở `feat/grading-gaps-g1-g5`.

Mỗi plan đọc file này. Nó trả lời ba câu mà bốn phiên chạy cùng lúc phải thống nhất trước: **dùng chung cái gì thì không được giẫm chân nhau**, **ai được sửa file nào**, và **ghép lại thế nào**. Mọi lệnh trong mục 2 đã được chạy thử thật trên máy này (DB thử, Redis db riêng, 13 test e2e xanh), không phải suy đoán.

## 0. Nền hiện tại — đã kiểm lúc 20:06 ngày 2026-09-29 (thay mọi câu "PR #64 chưa merge" ở tài liệu cũ)

- **PR #64 đã được merge vào `main`** lúc 13:30 (+07) bởi chủ dự án; `main` = `edaec77`. Các câu cũ nói "chưa merge" trong spec/plan G1 và bộ nhớ chỉ là lịch sử.
- **`feat/grading-gaps-g1-g5` = `main` + 16 commit** (spec, plan và mã G1). `main` chỉ hơn nhánh này đúng một merge commit rỗng nội dung; dry-run `git merge-tree` giữa hai bên **sạch**. Vì vậy G1 ghép vào `main` không xung đột, và bốn gói G2–G5 rẽ nhánh từ `feat/grading-gaps-g1-g5` là đúng.
- **Có một luồng thứ năm, ngoài G1–G5: `S` = `feat/grading-session-list`** (worktree `grading-session-list`, do một phiên khác của chủ dự án làm). Nó dựa trên `main`, đã có 10 commit (API `GET /grading/sessions-summary`, thay `SessionPicker` bằng danh sách phiên có tab, lọc, chốt/bắt đầu chấm hàng loạt). Nó **không được sửa** bởi G2–G5 và **không sửa** file của họ, nhưng nó sửa những file dùng chung dưới đây. Dry-run ghép **G1 ↔ S**: 3 xung đột thật — `apps/api/src/grading/grading.controller.ts` và `grading.module.ts` (cả hai cộng thêm ở cùng chỗ: constructor/providers) và `apps/web/src/lib/session-triage.ts` (G1 đổi chữ ký `errorCounts/reasonOf/leverageOf`, S thêm hàm); `page.tsx`, `useGrading.ts`, `lib/api/grading.ts`, `schema.d.ts` tự ghép được nhưng **phải kiểm bằng `tsc`**: bản `page.tsx` ở đỉnh S vẫn import `useResultDetails`, hook mà G1 đã xoá.
- **Hệ quả cho G2–G5:** mỗi gói vẫn theo luật "mã mới vào file mới" và chỉ chạm file dùng chung ở bảng mục 3. Riêng các file S cũng sửa (cột **S** trong bảng) thì thêm **cộng thêm** nhỏ, tránh sắp xếp lại import hay đổi chữ ký hàm có sẵn. Việc hoà giải với S là việc của người ghép (mục 6), không phải của phiên đang code gói.
- **Docker Desktop tự tắt** (đã thấy lúc 20:06: `open //./pipe/dockerDesktopLinuxEngine` báo không thấy). Trước khi làm bất cứ thứ gì ở mục 2 chạy `docker ps`; nếu lỗi, mở `C:\Program Files\Docker\Docker\Docker Desktop.exe`, đợi, rồi `docker compose up -d postgres minio redis` (xem bộ nhớ `cine-openapi-client-regeneration`).

## 1. Bảng phân công

| Gói | Nhánh | Thư mục worktree (`.claude/worktrees/…`) | DB local | `REDIS_DB` | `PORT` API smoke | Migration (`timestamp`) |
|---|---|---|---|---|---|---|
| G2 | `feat/grading-g2-ruler` | `grading-g2-ruler` | `examcollect_g2` | 12 | 4002 | `1789500000000` (+1000 nếu cần thêm) |
| G3 | `feat/grading-g3-regrade` | `grading-g3-regrade` | `examcollect_g3` | 13 | 4003 | `1789510000000` |
| G4 | `feat/grading-g4-audit` | `grading-g4-audit` | `examcollect_g4` | 14 | 4004 | `1789520000000` |
| G5 | `feat/grading-g5-gradebook` | `grading-g5-gradebook` | `examcollect_g5` | 15 | 4005 | `1789530000000` |

- **Nhánh gốc** của cả bốn: `feat/grading-gaps-g1-g5` (đã có G1 và các tài liệu này). Không nhánh nào phụ thuộc nhánh khác.
- Migration mới nhất hôm nay là `1789490000000`. Dải trên chỉ để các migration không trùng `timestamp` khi ghép; chúng độc lập nhau, TypeORM chạy theo `timestamp`.
- `REDIS_DB` 0 là của DB dev chung — **không phiên nào dùng**.

## 2. Thiết lập một lần cho mỗi worktree (đã chạy thử)

Ví dụ cho G3; đổi `g3`/`13`/`4003` theo bảng. Bước 1 chạy **từ thư mục repo gốc** (đường dẫn tương đối của `git worktree add` tính từ chỗ đang đứng; đứng trong một worktree khác sẽ tạo worktree lồng vào nó).

```bash
# 1. worktree + nhánh
cd "C:/Users/Admin/Main/Desktop/HKI 2026-2027/KLTN/CINE"
git worktree add ".claude/worktrees/grading-g3-regrade" -b feat/grading-g3-regrade feat/grading-gaps-g1-g5
cd ".claude/worktrees/grading-g3-regrade"
pnpm install --frozen-lockfile

# 2. DB riêng. Schema PHẢI tạo tay: nó được tạo bởi docker/postgres-init, không bởi migration —
#    bỏ bước này thì migration:run nổ "namespace ... get_namespace_oid".
docker exec -e PGPASSWORD=examcollect_admin_password cine-postgres-1 psql -U examcollect_admin -d postgres -c "CREATE DATABASE examcollect_g3"
docker exec -e PGPASSWORD=examcollect_admin_password cine-postgres-1 psql -U examcollect_admin -d examcollect_g3 -c "CREATE SCHEMA IF NOT EXISTS examcollect"

# 3. Chạy migration. TRUYỀN DATABASE_URL VÀ DATABASE_SSL TƯỜNG MINH: script đọc apps/api/.env (nếu có) vốn trỏ
#    Supabase TỪ XA; dotenv không ghi đè biến đã đặt nên hai biến này bảo vệ bạn.
DATABASE_URL=postgresql://examcollect_admin:examcollect_admin_password@localhost:5442/examcollect_g3 DATABASE_SSL=false pnpm --filter api migration:run

# 4. Trỏ e2e vào DB và Redis db riêng. `.env.test` được COMMIT và jest nạp nó với override:true,
#    nên chỉ sửa được bằng cách sửa file — hãy khoá nó khỏi git TRƯỚC khi sửa.
git update-index --skip-worktree apps/api/.env.test
sed -i -E 's#^(DATABASE_URL=.*:5442/)examcollect$#\1examcollect_g3#; s#^REDIS_DB=0#REDIS_DB=13#' apps/api/.env.test
git status --short   # phải rỗng; nếu .env.test hiện ra thì skip-worktree chưa ăn — DỪNG, đừng commit
```

Kiểm nhanh: `pnpm --filter api exec jest --config ./test/jest-e2e.json test/grading-results-triage.e2e-spec.ts` phải xanh, và `docker exec … psql -d examcollect_g3 -tAc "select count(*) from examcollect.exam_session"` phải > 0 sau đó.

**Vì sao cần cả DB lẫn Redis riêng** (đều là lỗi đã gặp thật trong repo này): suite e2e chạy **tuần tự** trên MỘT DB dùng chung và có ba suite gọi `ExamSessionScheduler.sweep()` — một hàm quét toàn cục sẽ chốt phiên của suite khác đang chạy (CLAUDE.md). Hàng đợi BullMQ tên `grading`/`archive-check` dùng chung Redis: worker của phiên này sẽ nhặt job của phiên kia, chạy bằng **mã khác** trên **DB khác**, và kết quả e2e sai theo cách trông như bug nghiệp vụ. Bucket MinIO thì dùng chung được: khoá lưu trữ dựng từ uuid nên không đụng nhau.

**Chạy API để smoke hoặc sinh lại client** (không đè cổng 4000 của người khác):

```bash
pnpm --filter api build
cd apps/api && PORT=4003 DOTENV_CONFIG_PATH=.env.test node -r dotenv/config dist/src/main.js     # nền
cd ../../packages/shared && API_URL=http://localhost:4003/api-docs-json pnpm generate:api-client
```

`PORT` đặt trước thắng `.env.test` (dotenv không ghi đè biến đã có). Tắt API bằng `TaskStop` khi xong.

**Máy sẽ chậm:** bốn phiên cùng chạy vitest/tsc/`next build`. Vitest có lúc quá 60 giây; đừng chạy `next build` nếu chưa cần (chỉ ở task xác minh cuối).

## 3. Quyền sửa file — luật để không xung đột

**Luật 1 — code mới vào file mới.** Mỗi gói đặt service, controller, DTO, hook, hàm API, component của nó trong **file mới**. Repo đã theo khuôn này (`rules.controller.ts`, `test-bundle.controller.ts` là controller riêng cạnh `grading.controller.ts`). Đừng thêm route vào `grading.controller.ts`, đừng thêm hàm vào `lib/api/grading.ts` hay `hooks/useGrading.ts` khi có thể tách file.

**Luật 2 — chỗ chạm vào file dùng chung phải khai trong plan.** Mỗi plan có mục **Shared-file touch points** liệt kê từng file chung nó sửa, đúng đoạn nào, và sửa **cộng thêm** (thêm dòng/khoá), không đổi hành vi của người khác.

**Luật 3 — file sinh ra không gộp tay.** `packages/shared/src/api/schema.d.ts` do máy sinh. Mỗi phiên sinh lại trên nhánh của mình để web biên dịch được. Khi ghép mà xung đột thì **sinh lại**, không sửa tay.

Ma trận file dùng chung (nơi dễ xung đột nhất — người ghép đọc bảng này). Cột **S** là luồng `feat/grading-session-list` (mục 0): ô có chữ nghĩa là S cũng sửa file đó.

| File | G2 | G3 | G4 | G5 | S | Cách hoà giải |
|---|---|---|---|---|---|---|
| `apps/api/src/grading/grading.module.ts` | thêm provider/controller | thêm provider/controller | thêm provider/controller | — (module riêng) | **thêm** import + provider | giữ cả các dòng thêm (đã đo: xung đột G1↔S) |
| `apps/api/src/grading/grading.controller.ts` | — (dùng controller mới) | — (controller mới) | — (controller mới) | — | **thêm** constructor + 1 route | giữ cả (đã đo: xung đột G1↔S); G2–G5 không chạm file này |
| `apps/web/src/lib/api/grading.ts`, `apps/web/src/hooks/useGrading.ts` | — | — | — | — | **thêm** kiểu/hook | G2–G5 đặt hàm và hook mới vào file mới; sinh lại `schema.d.ts` khi ghép |
| `apps/web/src/app/teacher/grading/_components/SessionHeader.tsx` | — | nút "Chấm lại N bài lỗi hệ thống" | — | — | **thêm** `BackToListLink` | hai vùng khác nhau của cùng file |
| `apps/api/src/database/data-source.ts` | thêm entity nếu có | — | — | thêm entity | — | giữ cả các dòng thêm |
| `apps/api/src/app.module.ts` | — | — | — | thêm `GradeExportModule` | — | giữ cả |
| `apps/api/src/grading/grading.service.ts` (`listForSession`, `GradingResultView`) | — | **thêm `ungradableClass`** ngay sau `ungradableReason` | **ẩn điểm/triage khi `audit_pending`** ở chỗ dựng dòng | — | — | hai sửa ở hai chỗ khác nhau của cùng hàm |
| `apps/api/src/grading/scoring/score.service.ts` | — | — | rút mẫu ở chỗ ghi `auto_approved` | — | — | chỉ G4 sửa |
| `apps/web/src/lib/session-triage.ts` | — | có thể thêm hàm | sửa `scoreCell` cho `audit` | — | **thêm** hàm (+39 dòng) | giữ cả (đã đo: xung đột G1↔S). Ai ghép sau chạy lại test của file này |
| `apps/web/src/app/teacher/grading/_components/ResultsTable.tsx` | — | thêm lối "chấm lại" ở dòng | ô điểm của bài kiểm mẫu | — | — | hai vùng khác nhau của bảng |
| `apps/web/src/app/teacher/grading/_components/FinalizePanel.tsx` | — | — | bỏ nhãn *cần backend* ở nhóm kiểm mẫu | thay khối "Ghi điểm vào sổ điểm" | — | hai vùng khác nhau |
| `apps/web/src/app/teacher/grading/page.tsx` | dòng nguồn thước | băng "dịch vụ AI lỗi" | — | — | đổi `SessionPicker` → `SessionList` (4 dòng) | giữ cả; **kiểm `tsc`**: bản S còn import `useResultDetails` (G1 đã xoá hook này) |
| `apps/web/src/app/teacher/grading/[resultId]/page.tsx` | — | — | nhánh hồ sơ kiểm mẫu | — | — | chỉ G4 sửa |

**`GradingResultView`:** chỉ G3 thêm trường (`ungradableClass`). G2 và G5 không thêm gì vào dòng danh sách. G4 đổi **giá trị** (điểm, triage, sai số ẩn) chứ không thêm khoá. Phiên nào cần thêm khoá khác phải đặt tên riêng (tiền tố tên gói) và khai trong plan.

**Migration:** một file mỗi gói ở dải trên. Thêm giá trị enum dùng `ADD VALUE IF NOT EXISTS` theo khuôn `1789420000000-AddAuditPendingStatus.ts` và `1789490000000-ScoreReasonSessionRuleSet.ts`. Nhớ cập nhật `apps/api/src/database/verify-schema.ts` nếu gói thêm bảng/cột (kiểm xem file này có liệt kê không).

## 4. Việc mỗi phiên KHÔNG được làm

- Không `git push`, không mở PR, không merge (người dùng chưa cho phép; xem `pr-merge-needs-user-review`).
- Không sửa file thuộc gói khác ngoài **Shared-file touch points** đã khai.
- Không chạy `pnpm migration:run` mà thiếu `DATABASE_URL`/`DATABASE_SSL` tường minh (mục 2).
- Không chạy e2e/API khi `apps/api/.env.test` chưa trỏ DB và Redis riêng.
- Không xoá `.superpowers/sdd/<plan>/` (ledger) và không chạy `finishing-a-development-branch`: còn một lượt review chung G1→G5.
- Không sửa lỗi có sẵn ngoài phạm vi. Đã biết: e2e `exam-authoring-attach` đỏ sẵn (attach không upload byte lên storage) — **chỉ G2 sửa**; các gói khác thấy nó đỏ thì bỏ qua và ghi vào ledger.
- Code-review độc lập **đã được người dùng hoãn** sang một lượt chung G1→G5 (2026-09-29). Báo cáo cuối của mỗi phiên phải nói thẳng "chưa có VERDICT".

## 5. Kết thúc một phiên

1. Chạy mọi kiểm ở task cuối của plan (unit, e2e của gói + các suite lân cận đã liệt kê, `tsc`, eslint, `check:cycles`, và `next build` **một lần**).
2. Smoke trên API đã build (mục 2) nếu plan yêu cầu.
3. Chép các dòng `Ruling:` của ledger vào `docs/superpowers/ledgers/2026-09-29-<gói>.md` và commit (ledger gốc bị gitignore và mất theo worktree; lượt review chung cần đọc chúng).
4. Trả báo cáo tiếng Việt: đã đổi gì, số test, Rulings, "chưa có VERDICT", chưa push.

## 6. Ghép và review chung (người ghép làm, sau khi các phiên xong)

Thứ tự **theo lúc xong**, vào `feat/grading-gaps-g1-g5`:

0. Một lần, trước khi ghép gì: `git merge main` (main chỉ hơn một merge commit rỗng nội dung — đã đo sạch), để nhánh tích hợp sau này thành một PR sạch vào `main`. Luồng **S** (`feat/grading-session-list`) ghép riêng, sau G1 hoặc trước G1 tuỳ chủ dự án chọn; ai ghép sau hoà giải theo cột S của bảng mục 3 rồi chạy `tsc` + `pnpm --filter web test`.
1. `git merge --no-ff <nhánh gói>`. Xung đột: theo ma trận mục 3; `schema.d.ts` thì sinh lại.
2. Sau **mỗi** lần ghép: `pnpm --filter api build`, sinh lại client (API ở cổng riêng), `pnpm --filter api exec jest`, `pnpm check:cycles`, danh sách e2e của các gói đã ghép, `pnpm --filter web test`, `tsc` (so với baseline: chỉ nhiễu `read-workbook.test.ts`), eslint.
3. Sau lần ghép cuối: chạy **toàn bộ** e2e một lượt trên DB riêng của người ghép (DB mới, tạo lại theo mục 2), rồi `next build`.
4. **Một** lượt `code-reviewer` cho toàn nhánh (`git diff feat/grading-ui-rebuild...HEAD`), đưa vào gói review: spec, cả năm plan, Review Focus của từng plan, và các file `docs/superpowers/ledgers/*.md`.
5. Chỉ sau đó mới nói chuyện push/PR.

# Cutover master data — diễn tập, chuyển đổi, nghiệm thu, đường lùi

> Spec: `docs/superpowers/specs/2026-10-04-master-data-restoration-design.md` §8. Công cụ: `pnpm master-data` (`apps/api/src/database/master-data/`).
> **Quy tắc số một:** mọi lệnh ghi dùng `DATABASE_URL` truyền RÕ. `apps/api/.env` trỏ Supabase từ xa — để mặc định là ghi vào DB thật.
> Công cụ từ chối đích từ xa nếu thiếu `--confirm-host <đúng host>`; migration (`pnpm migration:run`) thì **không** có chốt đó, nên **luôn** kiểm host bằng `psql` trước và sau.

## 0. Điều kiện

- [ ] Mọi migration KHÁC đã áp trên Supabase (G1–G5 đã vào `main` và đã chạy — spec §8.6 khuyến nghị; kiểm: `SELECT name FROM examcollect.migrations ORDER BY id DESC LIMIT 5` không còn migration nào chờ ngoài hai migration của đợt này). Lý do: checksum điểm so trước/sau, mà migration của G1–G5 có thể thêm cột vào bảng điểm.
- [ ] PR1 (A–G) đã sẵn sàng deploy; PR2 (Task 5) đã review, chưa merge.
- [ ] Đã ghi số test baseline (unit + e2e) và toàn bộ e2e xanh trên nhánh PR2 — chạy `cd apps/api && npx jest --config ./test/jest-e2e.json --runInBand` (KHÔNG dùng `pnpm test:e2e -- --runInBand`: `--` làm cờ bị hiểu là mẫu tên file và jest báo "No tests found"). Trên DB e2e dùng chung của máy dev, `entity-schema` và `master-data-contract` đỏ cho tới khi migration thu hẹp được áp (đúng ý); chỉ có nghĩa trên DB dựng mới đã áp mọi migration.
- [ ] Có `pg_dump`/`pg_restore` đúng phiên bản (cùng hoặc mới hơn server). Cách không cần cài gì: chạy trong container `cine-postgres-1`.
- [ ] Chọn cửa sổ bảo trì (vài phút, giờ không có phiên thi nào đang diễn ra) và báo ba giảng viên.

## 1. Sao lưu — đường lùi DUY NHẤT

Bước thu hẹp **không đảo ngược được**; khôi phục bản dump là cách lùi duy nhất.

```powershell
$dump = "$HOME\examcollect-backups\pre-master-data-restore-$(Get-Date -Format yyyyMMdd-HHmm).dump"
New-Item -ItemType Directory -Force (Split-Path $dump) | Out-Null
# pg_dump chạy trong container local (có sẵn công cụ). Nếu báo "server version mismatch", dùng image postgres:<đúng phiên bản của Supabase>.
docker exec cine-postgres-1 pg_dump "$env:SUPABASE_DATABASE_URL" --format=custom --no-owner --no-privileges --schema=examcollect -f /tmp/pre-md.dump
docker cp cine-postgres-1:/tmp/pre-md.dump $dump
docker exec cine-postgres-1 pg_restore --list /tmp/pre-md.dump | Select-Object -First 5     # đọc được = dump hợp lệ
git tag pre-master-data-restore 4cb6bca ; git push origin pre-master-data-restore
```

Ghi lại đường dẫn dump và kích thước. **Không tiếp tục** nếu `pg_restore --list` lỗi.

## 2. Diễn tập trên bản sao (spec §8.5) — làm TRƯỚC, lặp tới khi sạch

2.1 **Dựng bản sao** trong Postgres local (không bao giờ trên Supabase):

```powershell
docker exec cine-postgres-1 psql -U examcollect_admin -d postgres -c "CREATE DATABASE examcollect_rehearsal"
# Extension nằm ngoài schema examcollect nên KHÔNG có trong dump. Kiểm trên Supabase: SELECT extname, extnamespace::regnamespace FROM pg_extension;
docker exec cine-postgres-1 psql -U examcollect_admin -d examcollect_rehearsal -c 'CREATE EXTENSION IF NOT EXISTS citext; CREATE EXTENSION IF NOT EXISTS btree_gist; CREATE EXTENSION IF NOT EXISTS "uuid-ossp";'
docker exec cine-postgres-1 pg_restore -U examcollect_admin -d examcollect_rehearsal --no-owner --no-privileges /tmp/pre-md.dump
$env:REHEARSAL_URL = "postgresql://<user>:<mật khẩu>@localhost:<cổng>/examcollect_rehearsal"
```

2.2 **Đối soát lịch sử migration (spec §8.4 bước 0b)** — Supabase có 46 dòng trong `examcollect.migrations` dù repo có 48 file; `AddAiUsage` và `AddArchiveContentCheck` được áp ngoài đường TypeORM. Không đối soát thì `migration:run` **dừng ở `AddAiUsage` với lỗi "đã tồn tại"** và chặn mọi migration sau:

```sql
-- (a) 46 dòng, và hai tên thiếu:
SELECT count(*) FROM examcollect.migrations;
-- (b) Đối tượng của hai migration có thật — đọc hai file migration, so cột/kiểu/ràng buộc/chỉ mục với \d trong psql, rồi xác nhận:
SELECT to_regclass('examcollect.ai_usage') IS NOT NULL AS ai_usage,
       to_regclass('examcollect.required_deliverable_entry') IS NOT NULL AS entries,
       EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                WHERE n.nspname = 'examcollect' AND t.typname = 'archive_check_status') AS archive_enum;
-- (c) CHỈ khi cả ba là true và nội dung khớp — thêm hai dòng (tương đương --fake):
INSERT INTO examcollect.migrations (timestamp, name) VALUES
  (1789360000000, 'AddAiUsage1789360000000'),
  (1789400000000, 'AddArchiveContentCheck1789400000000');
```

Ghi lại **vì sao** hai migration được áp ngoài đường TypeORM (chạy tay trong SQL Editor?) để máy dev và Railway không lặp lại (spec §13 mục 8).

2.3 **Chụp bản "trước"** — SAU 2.2, TRƯỚC mọi migration của đợt này:

```powershell
cd apps/api
pnpm master-data snapshot --database-url $env:REHEARSAL_URL --out $env:TEMP\md-before.json
```

2.4 **Migration mở rộng** (chỉ thêm; code cũ vẫn chạy được):

```powershell
$env:DATABASE_URL = $env:REHEARSAL_URL
pnpm migration:run        # áp 1789600000000-ExpandMasterDataEntities (và migration khác nếu còn chờ)
```

2.5 **Backfill — thử khô rồi chạy thật.** Với dữ liệu thật (spec §8.1–8.3): học kỳ HK1 2026-2027; lớp "Hệ Quản Trị Dữ Liệu MongoDB" gộp vào `DHKTPM18ATT`; lớp `DHKTPM18CTT` không có phiên nào nên dùng kỳ mặc định (**giả định cần admin xác nhận**); phòng `TEST-KHONG-PHONG` ngừng hoạt động:

```powershell
pnpm master-data backfill --database-url $env:REHEARSAL_URL --dry-run `
  --default-semester 2026:1 --merge "Hệ Quản Trị Dữ Liệu MongoDB=DHKTPM18ATT" --inactive-room "TEST-KHONG-PHONG"
# đọc báo cáo; nếu có "Backfill DỪNG" thì xử lý từng điều được nêu (mã thoát 2), rồi chạy lại. Khi sạch, bỏ --dry-run:
pnpm master-data backfill --database-url $env:REHEARSAL_URL `
  --default-semester 2026:1 --merge "Hệ Quản Trị Dữ Liệu MongoDB=DHKTPM18ATT" --inactive-room "TEST-KHONG-PHONG"
```

Báo cáo phải có: `created` {semesters 1, administrativeClasses 2, rooms 4, students 54}, `merged[0].moved` {`exam_session.class_id` 5, `session_roster.home_class_id` 45, `submission.home_class_id` 45} và `enrollmentsRemoved` 9, `remaining` toàn 0 và `complete: true`. **Chạy lại** lệnh thật: mọi số `created`/`assigned` phải về 0 và `merged` rỗng (T-MIG-2).

2.6 **Đối chiếu (T-GR-2)** — số dòng đổi đúng thứ đã biết, điểm không đổi một byte:

```powershell
pnpm master-data verify --database-url $env:REHEARSAL_URL --before $env:TEMP\md-before.json `
  --expect class=-1 --expect enrollment=-9 --expect student=54 --expect semester=1 --expect room=4 --expect administrative_class=2
```

(Spec §8.5 mục 1 liệt kê `enrollment 63→54`, `student +54`, `semester +1`, `room +4`, `administrative_class +2`; còn `class 3→2` do gộp lớp MongoDB, nên có thêm `class=-1`.) Phải thoát 0, kèm `Chống trùng phòng theo room_id … blocked`. Bất kỳ dòng `LỖI` nào = **dừng**, không cutover.

2.7 **Thu hẹp** trên bản sao: checkout nhánh PR2, rồi `pnpm migration:run` (áp `1789700000000-ContractMasterDataEntities`), chạy lại `verify` với **cùng** `--expect` — phải vẫn đạt. Rồi trỏ API vào bản sao và đi qua màn chính bằng trình duyệt (mục 4.3). Lặp lại 2.1–2.7 từ bản dump mới nếu có gì sửa.

## 3. Cutover trên Supabase (cửa sổ bảo trì)

Trước mỗi bước ghi, in đích: `psql "$env:SUPABASE_DATABASE_URL" -c "SELECT current_database(), inet_server_addr()"`. Công cụ `master-data` đòi thêm `--confirm-host <host Supabase>` ở **mọi** lệnh.

| # | Việc | Dừng nếu |
|---|---|---|
| 3.0 | Báo giảng viên; không còn phiên đang chạy. | còn phiên `active`/`collecting` |
| 3.1 | Sao lưu lại (mục 1) ngay trước giờ G; tag đã có. | `pg_restore --list` lỗi |
| 3.2 | Đối soát lịch sử migration (2.2) trên Supabase. | đối tượng không khớp |
| 3.3 | `snapshot --out before.json` trên Supabase. | |
| 3.4 | `pnpm migration:run` với `DATABASE_URL` Supabase → áp migration **mở rộng**. Kiểm bằng `psql`: `migrations` có `ExpandMasterDataEntities1789600000000`. | lỗi migration |
| 3.5 | `backfill --dry-run` rồi `backfill` (cùng tuỳ chọn đã diễn tập). | `Backfill DỪNG` — xử lý, không ép |
| 3.6 | **Deploy PR1** (Railway + Vercel). Đăng nhập admin, mở danh sách lớp/phiên. | trang lỗi |
| 3.7 | **Chạy lại backfill** (bắt phiên tạo bởi code cũ trong khoảng chờ) → `complete: true`. | `remaining` khác 0 |
| 3.8 | **Merge và deploy PR2** (code không còn đọc cột cũ; chạy được trên schema chưa thu hẹp). Kiểm nhanh: tạo/sửa/huỷ một phiên thử, mở "Lớp của tôi". Máy dev nào trỏ Supabase phải chuyển sang nhánh mới. | trang lỗi |
| 3.9 | **Migration thu hẹp**: `pnpm migration:run` với `DATABASE_URL` Supabase. Tự dừng nếu còn dữ liệu cũ (đọc câu báo, chạy lại 3.7). | báo tiền điều kiện |
| 3.10 | `verify --before before.json --expect …` (cùng như 2.6) → **điều kiện báo xong**. | bất kỳ dòng `LỖI` |

Chạy migration thu hẹp **trước** khi deploy PR2 làm code PR1 hỏng ở từng câu truy vấn đọc `student_name` — đừng đảo thứ tự 3.8 và 3.9.

## 4. Nghiệm thu bằng chấm thật (spec §11)

4.1 Admin tạo phòng **"Phòng diễn tập"** (hoạt động) trên màn Phòng thi; ghi `roomId`. Không dùng lại `TEST-KHONG-PHONG` (đã ngừng).
4.2 Chạy diễn tập trên Railway với cùng kịch bản và cùng model như lượt trước (`pnpm rehearsal -- …`, CLI đã đổi sang `roomId`/`classId` ở plan D3), rồi **ghi bản ghi và bảng so sánh với lượt trước** vào lịch sử benchmark (`apps/api/eval/rehearsals/`). Điểm số lệch so với lượt trước = lỗi cần điều tra, không phải ghi chú.
4.3 Lượt duyệt bằng trình duyệt (Playwright MCP local: `docs/superpowers/tools/pw-mcp.mjs` trong repo CINE) trên bản sao hoặc Supabase sau cutover:
   - [ ] Admin: tạo học kỳ, phòng, mã lớp danh nghĩa, lớp (giao giảng viên); nhập file cho từng loại (dryRun trước); trang audit hiện các thao tác đó.
   - [ ] Giảng viên: "Lớp của tôi" chỉ đọc, bộ lọc năm học → học kỳ; chưa có lớp thì thấy "Chưa có lớp nào được giao cho bạn" và **không** có nút tạo lớp.
   - [ ] Giảng viên: tạo phiên (phòng chọn từ danh sách, học kỳ chỉ-xem); phiên của lớp kỳ cũ vẫn tạo được; sửa phòng/giờ trước giờ bắt đầu; "Sửa" bị chặn kèm lý do sau giờ bắt đầu; huỷ phiên chưa ai vào; huỷ phiên đã có người vào thấy câu 409 trong hộp thoại.
   - [ ] Danh sách Kỳ thi / Bài thu / Chấm điểm lọc theo năm học → học kỳ; lớp trùng nhãn giữa hai kỳ phân biệt được bằng học kỳ.
   - [ ] Agent: sinh viên lớp khác `NOT_ENROLLED` rồi xin phép được (T-GR-3).

## 5. Đường lùi

| Đang ở | Lùi bằng | Mất gì |
|---|---|---|
| Trước 3.4 | Không cần lùi. | — |
| Sau 3.4–3.7 (mở rộng + backfill, chưa thu hẹp) | **Khôi phục bản dump** rồi deploy lại tag `pre-master-data-restore`. Gộp lớp (xoá lớp MongoDB) và viết lại chuỗi học kỳ không đảo được bằng tay. | Dữ liệu phát sinh sau giờ dump |
| Sau 3.9 (đã thu hẹp) | Như trên — **duy nhất** cách. `down()` của migration thu hẹp ném lỗi có chủ ý. | Dữ liệu phát sinh sau giờ dump |

Khôi phục (thử trên bản sao trước, vì nó ghi đè): `pg_restore --clean --if-exists --no-owner --no-privileges -d "$env:SUPABASE_DATABASE_URL" <dump>`, rồi `git checkout pre-master-data-restore` và deploy lại Railway + Vercel. Ba giảng viên và một cửa sổ bảo trì ngắn làm mức mất dữ liệu này chấp nhận được (spec §12 mục 5).

## 6. Sau nghiệm thu

- [ ] Báo admin: **ngày học kỳ là số tạm** (01/09 → 31/01) — sửa trên màn Học kỳ; **kỳ của `DHKTPM18CTT` là giả định** (lớp không có phiên để suy) — xác nhận hoặc sửa.
- [ ] Lịch sử của `DHKTPM18ATT` giờ có các phiên chồng giờ do gộp lớp MongoDB (spec §12 mục 4) — nhìn thấy được, không hỏng ràng buộc nào.
- [ ] Công cụ MỘT LẦN: `master-data/backfill.*`, `semester-name.*` và script `master-data` đọc cột đã bỏ nên không chạy được trên schema đích. Xoá chúng ở một PR dọn dẹp riêng (giữ `verify.ts`/`cli-args.ts` nếu muốn dùng lại cho đợt sau).
- [ ] Cập nhật `CLAUDE.md` rev 6 (Task 6 Step 2 của plan H) và ghi kết quả cutover vào memory dự án.

## 7. Sự cố thường gặp

| Triệu chứng | Nguyên nhân / cách xử lý |
|---|---|
| `migration:run` dừng ở `AddAiUsage`: "đã tồn tại" | Chưa làm 2.2/3.2 (đối soát lịch sử migration). |
| `backfill` thoát 2 với `[CLASS_CODE_UNMAPPABLE]` | Tên lớp không thành mã danh nghĩa: gộp bằng `--merge`, đổi tên lớp, hoặc gán tay. |
| `backfill` thoát 2 với `[CLASS_SEMESTER_UNKNOWN]` | Lớp không có phiên nào đọc ra học kỳ: `--default-semester YYYY:T` (một giả định) hoặc gán tay. |
| `backfill` báo `MERGE_STUDENT_NOT_IN_TARGET` | Lớp nguồn có sinh viên chưa ở lớp đích — gộp sẽ làm họ biến mất; thêm họ vào lớp đích trước. |
| `verify` báo `checksum … KHÁC` | Điểm bị đụng — **dừng cutover**, so với dump, điều tra trước khi làm gì tiếp. |
| `verify` báo bảng đổi ngoài mong đợi | Mức đổi của bảng đó chưa được khai bằng `--expect`, hoặc backfill làm điều không định làm — đọc `lines`. |
| Migration thu hẹp: "Còn N phiên thi chưa gắn phòng" | Phiên tạo bởi code cũ sau lần backfill trước — chạy lại 3.7 rồi 3.9. |
| Mọi lệnh từ chối: "KHÔNG phải máy local" | Đúng ý: thêm `--confirm-host <host>` **sau khi** đã kiểm đích. |

## 8. Phụ lục — lần diễn tập thử trên dữ liệu TỔNG HỢP (07/10/2026, Docker local)

Không phải diễn tập thật (không có dữ liệu Supabase). Mục đích: chứng minh công cụ chạy đúng trình tự và nêu những điều người vận hành sẽ gặp. DB tạm dựng từ trống, áp mọi migration tới `ExpandMasterDataEntities`, rồi nạp tay một dữ liệu hình dạng CŨ thu nhỏ: 3 lớp đặt tên bằng chữ (`DHKTPM18ATT`, `DHKTPM18CTT`, `Hệ Quản Trị Dữ Liệu MongoDB`), 6 enrollment, 4 phiên với `semester_name` hai kiểu và phòng gõ tay (kể cả `TEST-KHONG-PHONG`).

| Bước | Kết quả quan sát |
|---|---|
| `migration:run` thu hẹp khi còn dữ liệu cũ | **TỪ CHỐI**, nêu "Còn 3 lớp chưa có học kỳ / 3 lớp chưa có lớp danh nghĩa / 4 phiên thi chưa gắn phòng / 6 enrollment chưa có hàng sinh viên"; `class.name` còn nguyên (T-MIG-4) |
| `backfill --dry-run --merge … --default-semester 2026:1 --inactive-room …` | báo cáo đầy đủ, `complete: true`, **lùi lại không ghi gì** |
| `backfill` thật | `created` {semesters 1, administrativeClasses 2, rooms 3, students 4}; `merged` 1 lớp (`exam_session.class_id` 2, `enrollmentsRemoved` 2); `assigned` {classSemester 2, classAdministrativeClass 2, sessionRoom 4, sessionSemesterName 2}; `remaining` toàn 0 |
| `backfill` chạy lại | mọi số `created`/`assigned` = 0, `merged` rỗng (T-MIG-2) |
| `migration:run` thu hẹp | thành công; `class.name` và `enrollment.student_name` đã bỏ; view `class_label` còn `DHKTPM18ATT · HK1 2026-2027`, `DHKTPM18CTT · HK1 2026-2027` |
| `verify --expect class=-1 --expect enrollment=-2 --expect semester=1 --expect administrative_class=2 --expect room=3 --expect student=4` | mọi dòng `ok`, bất biến `đạt`, thoát 0. "Chống trùng phòng" = `skipped` vì DB tạm chỉ có MỘT giảng viên — **trên bản sao thật phải ra `blocked`** (cần ≥ 2 lớp của 2 giảng viên khác nhau và 1 phòng) |

Những điều rút ra:

- **DB trống cần `CREATE SCHEMA IF NOT EXISTS examcollect` TRƯỚC `migration:run`** (migration đầu tiên vỡ với `get_namespace_oid` nếu thiếu). Với bản sao dựng bằng `pg_restore` từ dump `--schema=examcollect` thì schema đã nằm trong dump; extension (`citext`, `btree_gist`, `uuid-ossp`) vẫn phải tạo trước (mục 2.1).
- **`verify` trên DB e2e dùng chung luôn thoát 1** — DB đó chứa hàng chục nghìn lớp/phiên rác hình dạng cũ nên bất biến báo đúng thực trạng. Chỉ có nghĩa trên bản sao SẠCH hoặc sau backfill.
- `backfill` đọc ảnh chụp **tuần tự** trên một kết nối (bản đầu chạy song song làm `pg` cảnh báo `Calling client.query() when the client is already executing a query`); nếu thấy cảnh báo đó thì bản công cụ chưa có sửa này.
- Trên máy dev **không có `apps/api/.env`** thì `DATABASE_URL` thiếu sẽ bị CLI từ chối ngay ("Thiếu DATABASE_URL"); có `.env` trỏ Supabase thì chốt `--confirm-host` là thứ duy nhất ngăn ghi nhầm — đừng bao giờ thêm `--confirm-host` bằng thói quen.
- Bộ e2e chạy được trên DB đã thu hẹp (dựng mới + áp mọi migration): xem kết quả ở ghi chú PR2. Bộ e2e **không** chạy được trên DB tạm tuỳ ý: `test/setup-env.ts` ghi đè `DATABASE_URL` bằng `.env.test` (chốt chặn chống chạy nhầm cloud); để chạy trên một DB khác phải sửa tạm `apps/api/.env.test`.

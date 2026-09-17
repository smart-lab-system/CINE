# Thiết kế: Script seed dữ liệu mẫu (hình production) + DEMO-RUNBOOK

**Ngày:** 2026-09-17  
**Trạng thái:** Approved for plan — mọi mục §9 đã chốt 2026-09-17  
**Nhánh:** `feature/seed-data-api` (tiếp tục; chưa cần PR riêng)  
**Dựa trên:**
`docs/superpowers/specs/2026-09-16-seed-data-api-design.md` (API ensure
đã ship) và `DEMO-RUNBOOK.md` bước 5 / 5b hiện tại.

---

## 1. Vì sao cần giai đoạn này

API seed (`SEED_API_ENABLED=true`, `/seed/bootstrap-admin`,
`/admin/seed/*`) đã đủ để nạp DB qua HTTP. Còn thiếu:

1. **Runbook vẫn SQL + click UI** cho account / lớp / roster.
2. **Không có lệnh một lần** gọi đúng thứ tự ensure.
3. **Dữ liệu “có sẵn” hiện tại không giống production** — `CS101`
   unowned trong migration, email `demo-*@example.com`, MSSV
   `MSSVTEST01…` phục vụ mock-agent. Cần một bộ fixture **mang hình dữ
   liệu thật** (khoa/môn/lớp/SV như vận hành thật), để local/staging
   tập luyện đúng mô hình sẽ dùng — không phải đồ chơi gắn nhãn Demo.

Giai đoạn này **không** thêm endpoint mới (bundle vẫn 1b). Thêm client
CLI + fixture + sửa runbook + chỉnh mock-agent / sample-roster cho khớp
cùng nguồn MSSV.

---

## 2. Mục tiêu / ngoài phạm vi

**Mục tiêu**

- `scripts/seed-sample-data.mjs` ở root: gọi ensure theo thứ tự,
  idempotent.
- Fixture trong repo mang **hình production** (xem §3c): học kỳ, phòng,
  mã học phần, email tổ chức, họ tên, MSSV thật-giống — không
  `demo-*` / `MSSVTEST*` / `CS101` làm danh tính chính.
- **Bỏ seed học vụ trong migration** (§3b).
- Cập nhật `DEMO-RUNBOOK.md`: bỏ SQL account + bỏ bắt buộc click roster;
  login bằng tài khoản trong fixture.
- **Một nguồn sự thật cho roster:** fixture JSON → seed API; cùng list
  sinh viên sinh lại `sample-roster.xlsx` và identity mock-agent (không
  còn generator `MSSVTEST` riêng).
- Chỉ chạy trên DB local/staging với API seed bật — **không** nhằm chạy
  seed API trên production công cộng (kill-switch vẫn bắt buộc).

**Ngoài phạm vi**

- Bundle endpoint; nới `@Roles` sản phẩm.
- Seed phiên thi / đề / bài nộp / điểm.
- Gỡ claim-unowned khỏi API (giữ cho DB cũ).
- Amend migration đã ship (chỉ migration mới).
- Copy bắt buộc JSON Cine anh em (tùy chọn `--from-cine` sau).
- Đưa mật khẩu production thật vào git.

---

## 3. Lựa chọn hướng tiếp cận

| Phương án | Ý tưởng | Lý do loại / giữ |
| --- | --- | --- |
| **A. curl trong runbook** | Document từng POST | Không thay “một lệnh” |
| **B. SQL dump** | Insert thẳng | Bypass service + audit |
| **C. Script HTTP + fixture ★** | Node `.mjs` + JSON hình production | Đúng API seed; idempotent |
| **D. Chỉ JSON anh em** | Bắt buộc path Cine cũ | Repo độc lập gãy |

**Chọn: C.** Fixture mặc định:
`scripts/seed-fixtures/reference.json` (tên **reference**, không
`demo.json`).

---

## 3b. Bỏ seed học vụ trong migration (đã chốt)

Như đã ghi: migration mới forward-only xóa hàng seed
(`CS101`/`CS201`, phòng A1/A2/B1, HK `Học kỳ 1 2026-2027`) khi không
còn FK; không amend `AddCourseRoomExamType`. Volume bẩn: wipe hoặc để
migration skip/fail rõ. E2e seed API không còn phụ thuộc hàng migration;
claim-unowned test tự dựng unowned trong suite nếu vẫn cần phủ API.

---

## 3c. Chất lượng dữ liệu — hình production (đã chốt)

**Ruling:** fixture và mọi thứ regenerate từ nó được viết **như dữ liệu
thật sẽ dùng khi triển khai** (một khoa, một học kỳ, lớp HP, danh sách
SV phòng đào tạo), không như sandbox gắn nhãn Demo/Test.

### Nguyên tắc

| Được | Không được |
| --- | --- |
| Email domain tổ chức (vd. `@iuh.edu.vn`) | `demo-*@example.com`, `test@test.com` |
| Họ tên tiếng Việt thật-giống | `Demo Teacher`, `Sinh viên test 01` |
| Mã học phần dạng mã trường (vd. `4220004247`) | `CS101` / `SEED99` làm mã chính |
| Tên phòng / học kỳ như sổ quản lý | `Seed Room 123`, `Demo HK` |
| MSSV khớp regex sản phẩm và **giống MSSV thật** (độ dài/ký tự thực tế khoa) | `MSSVTEST01…20` làm danh tính chính |
| Password bootstrap **chỉ** qua env / flag CLI, không hard-code trong JSON commit nếu tránh được | Commit `Demo123456!` như “mật khẩu demo” trong fixture |

### Phân biệt “hình production” vs “chạy trên production”

- **Hình production** = schema nội dung / naming / cardinality giống thật.
- **Chạy seed** = chỉ khi `SEED_API_ENABLED=true` (local/staging). Production
  công cộng **tắt** flag; nạp dữ liệu thật qua quy trình vận hành (UI /
  import / ETL), không bằng script này trừ khi ops chủ động bật cổng trên
  môi trường kiểm soát.

### Hệ quả buộc chỉnh cùng slice

1. **`apps/agent` mock-agent** — bỏ hard-code `MSSVTEST${n}`; đọc danh
   sách MSSV từ cùng file students của fixture (hoặc arg
   `--students scripts/seed-fixtures/students.json`) để `--count N` khớp
   N sinh viên đầu roster đã seed.
2. **`make-sample-roster.mjs`** — generate `.xlsx` từ **cùng**
   `students.json`, không tự sinh `MSSVTEST*`.
3. **DEMO-RUNBOOK** — mọi MSSV / email / mã môn / tên lớp trích từ
   fixture; không còn `SV20120001` / `MSSVTEST` trừ khi fixture cố ý giữ
   (không khuyến nghị).

---

## 4. Hợp đồng script

### 4.1 Lệnh

```bash
pnpm seed:sample
# hoặc
node scripts/seed-sample-data.mjs
```

| Tên | Mặc định | Nghĩa |
| --- | --- | --- |
| `API_BASE` / `--base` | `http://localhost:4000` | Origin API |
| `SEED_BOOTSTRAP_PASSWORD` / `--password` | *(bắt buộc hoặc đọc `.env.seed.local` gitignored)* | Password dùng cho admin + mọi account trong lần ensure tạo mới |
| `--admin-email` | email `admin` trong fixture | Override |
| `--fixture` | `scripts/seed-fixtures/reference.json` | File chính |
| `--dry-run` | off | In kế hoạch, không fetch |

Fixture JSON **không** chứa field `password` (tránh commit secret). Script
gắn `SEED_BOOTSTRAP_PASSWORD` khi gọi ensure/bootstrap. Re-seed không gửi
`updatePassword` trừ `--update-passwords` tường minh.

File `scripts/seed-fixtures/.env.seed.example` (commit được) hướng dẫn
copy → `.env.seed.local` (gitignore).

### 4.2 Thứ tự gọi

1. `POST /seed/bootstrap-admin` (201 hoặc 409 bỏ qua).
2. `POST /auth/login` (admin).
3. `POST /admin/seed/accounts` cho head, GV, … trong fixture.
4. `POST /admin/seed/semesters`
5. `POST /admin/seed/rooms`
6. `POST /admin/seed/courses` — tạo mới + owner (không claim migration).
7. `POST /admin/seed/classes`
8. `POST /admin/seed/classes/roster`

Summary từng bước; dừng ở lỗi cứng đầu tiên. Không in password.

### 4.3 Tài khoản trong fixture (ví dụ hình — chốt số liệu lúc implement)

Ví dụ định hướng (có thể chỉnh cho khớp số liệu khoa thật khi viết
fixture):

| Role | Email (ví dụ) | Ghi chú |
| --- | --- | --- |
| `admin` | `cntt.admin@iuh.edu.vn` | Bootstrap / vận hành seed |
| `department_admin` | `truongkhoa.cntt@iuh.edu.vn` | Owner mọi môn trong fixture |
| `teacher` | `gv.nguyenvana@iuh.edu.vn` | GV lớp chính trong runbook |

Password: một `SEED_BOOTSTRAP_PASSWORD` dùng chung lần seed đầu (đủ cho
lab/staging). Runbook ghi rõ biến này, không ghi plaintext trong repo.

### 4.4 Roster + lớp chính

- File `scripts/seed-fixtures/students.json`: mảng
  `{ "mssv", "name" }` — **≥ 20** SV cho mock-agent `--count 20`, thêm
  vài SV cho agent tay nếu cần.
- MSSV / họ tên mang hình danh sách thật; thỏa
  `^[A-Za-z0-9]{4,20}$`.
- Lớp chính trong `reference.json`: một HP + `Nhóm 01` (hoặc mã lớp danh
  nghĩa thật nếu khoa dùng) gắn GV §4.3.
- Mã môn: dạng mã trường (không `CS101`). Tên môn tiếng Việt đầy đủ.
- Học kỳ / phòng: tên như sổ thật (vd. `Học kỳ 1 năm học 2026-2027`,
  `Phòng máy H1.1`).

`sample-roster.xlsx` / `sample-roster-bad.xlsx` regenerate từ
`students.json` (+ một dòng hỏng cho file bad).

### 4.5 Hình `reference.json` (minh họa)

```json
{
  "admin": {
    "name": "Quản trị hệ thống Khoa CNTT",
    "email": "cntt.admin@iuh.edu.vn"
  },
  "accounts": [
    {
      "name": "Nguyễn Văn Trưởng",
      "email": "truongkhoa.cntt@iuh.edu.vn",
      "role": "department_admin"
    },
    {
      "name": "Nguyễn Văn A",
      "email": "gv.nguyenvana@iuh.edu.vn",
      "role": "teacher"
    }
  ],
  "semesters": [
    {
      "name": "Học kỳ 1 năm học 2026-2027",
      "startDate": "2026-09-01",
      "endDate": "2027-01-15"
    }
  ],
  "rooms": [
    { "name": "Phòng máy H1.1", "capacity": 40 },
    { "name": "Phòng máy H1.2", "capacity": 40 },
    { "name": "Phòng máy H2.1", "capacity": 30 }
  ],
  "courses": [
    {
      "code": "4220004247",
      "name": "Nhập môn Lập trình",
      "semesterName": "Học kỳ 1 năm học 2026-2027",
      "departmentHeadEmail": "truongkhoa.cntt@iuh.edu.vn"
    }
  ],
  "classes": [
    {
      "courseCode": "4220004247",
      "semesterName": "Học kỳ 1 năm học 2026-2027",
      "name": "Nhóm 01",
      "teacherEmail": "gv.nguyenvana@iuh.edu.vn"
    }
  ],
  "rosters": [
    {
      "courseCode": "4220004247",
      "semesterName": "Học kỳ 1 năm học 2026-2027",
      "className": "Nhóm 01",
      "studentsFile": "students.json",
      "removeMissing": false
    }
  ]
}
```

Số liệu cụ thể (email, mã HP, danh sách SV) **chốt khi viết fixture** —
ưu tiên lấy/adapt từ JSON khoa thật hoặc Cine anh em nếu có; không để
placeholder “Demo” lọt vào file commit.

### 4.6 Lỗi UX

| Tình huống | Hành vi |
| --- | --- |
| Thiếu `SEED_BOOTSTRAP_PASSWORD` | Exit ≠ 0, trỏ `.env.seed.example` |
| `ECONNREFUSED` | Start API trước |
| `404` seed routes | Bật `SEED_API_ENABLED=true`, restart |
| `401` login | Password env lệch account đã có — không auto `updatePassword` |
| `409 COURSE_OWNED_BY_OTHER` | Dừng, in rõ |

---

## 5. Cập nhật DEMO-RUNBOOK

1. Sau migrate + API (`SEED_API_ENABLED=true`) + cấu hình
   `.env.seed.local`:
   ```bash
   pnpm seed:sample
   ```
2. Login GV theo email trong fixture → tạo phiên trên lớp đã seed →
   agent / mock-agent dùng MSSV trong `students.json`.
3. Xóa SQL `INSERT account` và bước bắt buộc import xlsx.
4. Appendix: importer UI (file bad, re-import) — pedagogic, không chặn
   đường chính.
5. Cập nhật mọi chỗ nhắc `MSSVTEST` / `SV20120001` / `demo-teacher@…` /
   `CS101`.

---

## 6. Wire package

```json
"seed:sample": "node scripts/seed-sample-data.mjs"
```

Node 20+ `fetch`. Gitignore: `scripts/seed-fixtures/.env.seed.local`.

---

## 7. Kiểm thử

- Volume sạch → migrate (không còn CS101 ma) → seed:sample → login GV
  fixture → teaching class + roster đủ N SV.
- Mock-agent `--count 20` join thành công với 20 MSSV đầu fixture.
- Re-seed: không 409; password không đổi nếu không `--update-passwords`.
- Flag seed tắt → script fail rõ.
- Regression: `pnpm --filter api test:e2e -- seed` trên `examcollect_e2e`
  (đã chỉnh hết phụ thuộc migration seed).

---

## 8. Thứ tự triển khai (cho plan sau)

1. Migration gỡ seed học vụ migration (§3b) + sửa e2e seed API.
2. `students.json` + `reference.json` (hình production).
3. `seed-sample-data.mjs` + `pnpm seed:sample` + `.env.seed.example`.
4. Đổi `make-sample-roster.mjs` + `mock-agent.ts` dùng cùng students.
5. Smoke local.
6. `DEMO-RUNBOOK.md` (+ README first-admin nếu cần).
7. (Tùy chọn) `--from-cine`.

---

## 9. Quyết định

| # | Câu hỏi | Quyết định |
| --- | --- | --- |
| 1 | Fixture trong repo vs bắt buộc JSON anh em? | **Fixture trong repo**; `--from-cine` tùy chọn sau. **Đã chốt 2026-09-17** |
| 2 | Email / naming | **Hình tổ chức thật** (§3c / §4.3) — **không** `demo-*@example.com`. **Đã chốt hướng 2026-09-17;** số liệu cụ thể lúc implement |
| 3 | Importer UI trong runbook chính? | **Phụ lục** — không chặn đường chính. **Đã chốt 2026-09-17** |
| 4 | `updatePassword` mặc định? | **Không.** Chỉ khi `--update-passwords`. **Đã chốt 2026-09-17** |
| 5 | Nhánh / PR | **Tiếp tục `feature/seed-data-api`**; chưa cần mở PR. **Đã chốt 2026-09-17** |
| 6 | Seed học vụ trong migration? | **Không** (§3b). **Đã chốt** |
| 7 | Dữ liệu “demo toy” (`MSSVTEST`, `CS101`, Demo*)? | **Không.** Fixture + roster + mock-agent = hình production (§3c). **Đã chốt** |
| 8 | Password trong JSON commit? | **Không.** Chỉ env / `.env.seed.local`. **Đã chốt 2026-09-17** |

---

## 10. Tiêu chí thành công

- DB mới sau migrate **trống học vụ**; `pnpm seed:sample` tạo đủ đồ thị
  mang hình dữ liệu thật.
- Runbook không SQL account, không bắt click roster, không MSSV/`email`
  kiểu test-harness.
- Mock-agent và sample-roster khớp cùng `students.json`.
- Seed API không bị phá; production công cộng vẫn tắt
  `SEED_API_ENABLED`.

**Plan triển khai:**
`docs/superpowers/plans/2026-09-17-seed-sample-data-script.md`

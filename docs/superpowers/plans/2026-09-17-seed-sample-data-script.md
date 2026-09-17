# Seed sample data script — Kế hoạch triển khai

> **Dành cho agent/executor:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (khuyến nghị) hoặc
> superpowers:executing-plans để làm từng task. Checkbox (`- [ ]`) để
> theo dõi.

**Goal:** Sau migrate, DB **trống học vụ**; một lệnh `pnpm seed:sample`
gọi API ensure đã ship, nạp đồ thị mang hình production (account tổ chức,
HK, phòng, mã HP, lớp, roster). Cập nhật DEMO-RUNBOOK (bỏ SQL admin /
click roster bắt buộc). Đồng bộ `students.json` → sample-roster +
mock-agent. **Không** bundle endpoint; **không** `--from-cine` trong plan
này.

**Architecture:** Client Node ESM ở root (`scripts/seed-sample-data.mjs`)
+ fixture JSON (`scripts/seed-fixtures/`). Migration TypeORM mới gỡ INSERT
học vụ từ `AddCourseRoomExamType`. Mock-agent / make-sample-roster đọc
cùng `students.json`.

**Tech Stack:** Node 20+ `fetch` · TypeORM migration · existing Seed API ·
ExcelJS (web package) · DEMO-RUNBOOK

**Spec:** `docs/superpowers/specs/2026-09-17-seed-sample-data-script-design.md`
— executor **phải đọc** (đặc biệt §3b, §3c, §4, §9 đã chốt). `§N` dưới đây
trỏ spec đó trừ khi ghi rõ design API 2026-09-16.

**Nhánh:** `feature/seed-data-api` (tiếp tục; chưa mở PR)

**Quyết định đã chốt (spec §9):**

1. Fixture trong repo; `--from-cine` **ngoài** plan này.
2. Naming hình tổ chức thật (không `demo-*` / `MSSVTEST` / `CS101` làm
   danh tính chính).
3. Importer UI = **phụ lục** runbook.
4. Không `updatePassword` mặc định.
5. Ở lại nhánh hiện tại.
6. Bỏ seed học vụ migration (migration mới, không amend).
7. Dữ liệu hình production.
8. Password chỉ env / `.env.seed.local` — không trong JSON commit.

---

## Global Constraints

- **DB e2e vs demo:** `pnpm --filter api test:e2e` → `examcollect_e2e`
  (setup-e2e). Script seed và DEMO-RUNBOOK → DB **`examcollect`** (demo
  local). Không trộn.
- **Không amend** `1787848391381-AddCourseRoomExamType.ts`.
- **Không** commit `.env.seed.local` hay password trong
  `reference.json` / `students.json`.
- **Không** nới `@Roles` sản phẩm; script chỉ gọi `/seed/*` và
  `/admin/seed/*` (+ `/auth/login`).
- **Không** implement `--from-cine` / bundle trong plan này.
- Migration xóa seed: **không** xóa mù nếu còn FK (session/class/…). Ưu
  tiên fail rõ hoặc skip có log; runbook khuyến nghị `down -v` khi local
  bẩn.
- E2e seed API: sau Task 1 **không** giả định CS101/HK từ migration;
  tự ensure semester/course trong test (hoặc INSERT unowned chỉ trong
  test claim).
- **Lệnh thường dùng:**
  - `pnpm --filter api migration:run` / `migration:run:e2e`
  - `pnpm --filter api test:e2e -- seed --forceExit`
  - `pnpm --filter api build` / `lint`
  - `pnpm seed:sample` (sau Task 3)
- **Commit:** mỗi task một commit, dạng `feat(seed): …` /
  `fix(seed): …` / `docs(seed): …` / `test(seed): …`.

### Definition of Done (mọi task)

- [ ] Acceptance task pass
- [ ] Không lộ password trong log/commit
- [ ] Self-review khớp spec §3c (không lọt `MSSVTEST` / `demo-teacher@`
      vào fixture chính hoặc runbook đường chính)

---

## File Structure

**Tạo mới**

| File | Trách nhiệm |
| --- | --- |
| `apps/api/src/database/migrations/<ts>-RemoveAcademicMigrationSeed.ts` | Xóa HK/CS101/CS201/phòng seed khi an toàn |
| `scripts/seed-fixtures/reference.json` | Đồ thị ensure (không password) |
| `scripts/seed-fixtures/students.json` | Roster SV hình thật (≥20) |
| `scripts/seed-fixtures/.env.seed.example` | Mẫu `SEED_BOOTSTRAP_PASSWORD` / `API_BASE` |
| `scripts/seed-sample-data.mjs` | CLI gọi bootstrap → login → ensure… |
| (optional) `scripts/seed-lib/*.mjs` | Helper parse args / load env nếu tách |

**Sửa**

| File | Thay đổi |
| --- | --- |
| `apps/api/test/seed-api.e2e-spec.ts` | Bỏ phụ thuộc migration CS101/HK; tự seed qua ensure |
| `package.json` (root) | `"seed:sample": "node scripts/seed-sample-data.mjs"` |
| `.gitignore` | `.env.seed.local`, `scripts/seed-fixtures/.env.seed.local` |
| `apps/web/scripts/make-sample-roster.mjs` | Đọc `students.json`; bỏ generate `MSSVTEST*` |
| `apps/agent/src/mock-agent.ts` | Identity từ `students.json` (hoặc `--students`) |
| `DEMO-RUNBOOK.md` | Đường chính = seed script; importer → appendix |
| `README.md` | First admin → bootstrap / `pnpm seed:sample` |

**Không tạo trong plan này**

- `--from-cine`
- `POST /admin/seed/bundle`
- Đổi product `@Roles`

---

## Fixture — số liệu mặc định khi implement

Dùng bộ dưới đây trừ khi có file khoa thật để thay (cùng shape). Tất cả
phải thỏa validation API hiện có.

**Accounts (reference.json)**

| Role | name | email |
| --- | --- | --- |
| admin | Quản trị hệ thống Khoa CNTT | `cntt.admin@iuh.edu.vn` |
| department_admin | Trần Thị Hương | `truongkhoa.cntt@iuh.edu.vn` |
| teacher | Nguyễn Văn An | `gv.nguyenvanan@iuh.edu.vn` |

**Academic**

- Semester: `Học kỳ 1 năm học 2026-2027`, `2026-09-01` → `2027-01-15`
- Rooms: `Phòng máy H1.1` (40), `Phòng máy H1.2` (40), `Phòng máy H2.1` (30)
- Course: code `4220004247`, name `Nhập môn Lập trình`, head =
  `truongkhoa.cntt@iuh.edu.vn`
- Class: `Nhóm 01`, teacher = `gv.nguyenvanan@iuh.edu.vn`

**students.json (≥22)**

- 20 MSSV dạng số thật-giống (vd. `24000301`…`24000320`) + họ tên VN đa
  dạng; thêm 2 SV cho agent tay (vd. `24000321`, `24000322`).
- Khớp `^[A-Za-z0-9]{4,20}$`.
- Mock-agent `--count 20` = 20 phần tử đầu file.

**Password:** chỉ `SEED_BOOTSTRAP_PASSWORD` trong `.env.seed.local`
(example: đặt placeholder trong `.env.seed.example`, không commit giá trị
dùng thật nếu team không muốn — runbook ghi “đặt password local”).

---

## Task 0: Chốt docs spec trên nhánh

**Files:**
- Modify: `docs/superpowers/specs/2026-09-17-seed-sample-data-script-design.md`
  (status Approved + §9 đủ chốt — nếu chưa commit)
- Create: plan này

- [ ] **Step 1:** Đảm bảo spec §9.4–§9.5–§9.8 + nhánh `feature/seed-data-api`
  đã ghi đúng.
- [ ] **Step 2:** Commit `docs(seed): approve sample-data script spec and add plan`.

---

## Task 1: Migration gỡ seed học vụ + sửa e2e seed

**Spec:** §3b

**Files:**
- Create: `RemoveAcademicMigrationSeed` migration
- Modify: `apps/api/test/seed-api.e2e-spec.ts`

**Migration `up` (ý):**

1. Xóa theo khóa ổn định **chỉ khi không bị FK chặn**:
   - courses `CS101`, `CS201` (và class/enrollment con nếu có — thường
     không trên DB sạch)
   - rooms `Phòng máy A1`, `Phòng máy A2`, `Phòng máy B1` — **chỉ** khi
     không còn `exam_session.room_id` trỏ tới
   - semester `Học kỳ 1 2026-2027` — chỉ khi không còn course trỏ tới
2. Nếu DELETE bị 23503: log rõ / để migration **fail** với message bảo
   wipe volume — không `DELETE CASCADE` phá session thật.
3. `down`: **không** insert lại seed toy (no-op hoặc comment) — nguồn
   sự thật là script.

**E2e:**

- Bỏ `UPDATE … CS101/CS201` unown + claim phụ thuộc migration.
- Describe courses: `ensure` semester mới (tên unique theo stamp) →
  ensure course mới `created: true` → ensure lần 2 idempotent.
- Thêm **một** test claim-unowned: INSERT course `department_head_id
  NULL` trong test (cùng semester), rồi ensure → `claimed: true`.
- Describes class/roster: dùng semester/course do ensure tạo trong
  `beforeAll`, không `Học kỳ 1 2026-2027` / `CS201` migration.
- Demo graph describe: giữ; không phụ thuộc migration seed.

- [ ] **Step 1:** Viết migration; chạy
  `pnpm --filter api migration:run` và `migration:run:e2e`.
- [ ] **Step 2:** Sửa e2e; `pnpm --filter api test:e2e -- seed --forceExit`
  xanh.
- [ ] **Step 3:** Commit `fix(seed): remove academic rows seeded by migration`.

---

## Task 2: Fixture reference + students + env example

**Spec:** §3c, §4.3–§4.5, bảng số liệu plan trên

**Files:**
- Create: `scripts/seed-fixtures/reference.json`, `students.json`,
  `.env.seed.example`
- Modify: `.gitignore`

- [ ] **Step 1:** Viết `students.json` (≥22 SV hình thật).
- [ ] **Step 2:** Viết `reference.json` (admin/accounts/semesters/rooms/
  courses/classes/rosters với `studentsFile: "students.json"`); **không**
  field password.
- [ ] **Step 3:** `.env.seed.example` với `API_BASE`,
  `SEED_BOOTSTRAP_PASSWORD=` (trống hoặc comment).
- [ ] **Step 4:** Gitignore `.env.seed.local` và
  `scripts/seed-fixtures/.env.seed.local`.
- [ ] **Step 5:** Commit `feat(seed): add production-shaped seed fixtures`.

---

## Task 3: Script `seed-sample-data.mjs` + `pnpm seed:sample`

**Spec:** §4

**Files:**
- Create: `scripts/seed-sample-data.mjs`
- Modify: root `package.json`

**Hành vi:**

1. Load `.env.seed.local` nếu có (parse đơn giản `KEY=VAL`, hoặc đọc
   tuần tự từ `process.env` đã export — không thêm dependency dotenv nếu
   có thể tránh; được phép `node --env-file=` nếu team Node ≥20.6, hoặc
   đọc file tay).
2. Require `SEED_BOOTSTRAP_PASSWORD`; fail message trỏ example.
3. Thứ tự: bootstrap-admin → login → accounts → semesters → rooms →
   courses → classes → rost ers (load students từ file).
4. 409 bootstrap = skip; mọi lỗi khác non-2xx = exit 1.
5. Không in password; summary `{ step, status, id?, created? }`.
6. Flag `--update-passwords` → gửi `updatePassword: true` khi ensure
   account (mặc định tắt).
7. `--dry-run` in body không fetch.
8. `--base`, `--fixture`, `--admin-email` override.

- [ ] **Step 1:** Implement script + `pnpm seed:sample`.
- [ ] **Step 2:** Smoke tay: API flag on, `.env.seed.local` có password,
  DB đã chạy migration Task 1 → script thành công; login GV fixture được.
- [ ] **Step 3:** Chạy lần 2 → idempotent, login cùng password.
- [ ] **Step 4:** Commit `feat(seed): add seed-sample-data CLI`.

---

## Task 4: make-sample-roster + mock-agent dùng students.json

**Spec:** §3c hệ quả

**Files:**
- Modify: `apps/web/scripts/make-sample-roster.mjs`
- Modify: `apps/agent/src/mock-agent.ts` (và CLI parse nếu cần)
- Regenerate: `scripts/sample-roster.xlsx`, `sample-roster-bad.xlsx`

**make-sample-roster:**

- Đọc `scripts/seed-fixtures/students.json`.
- Ghi xlsx như hiện tại (title row + cột thừa).
- Bad file: clone list + 1 MSSV có space.

**mock-agent:**

- Mặc định load `scripts/seed-fixtures/students.json` (path relative repo
  root / từ cwd).
- `generateIdentities(count)` → lấy `count` phần tử đầu; nếu
  `count > length` → exit lỗi rõ.
- Bỏ hard-code `MSSVTEST` / `Sinh viên test`.
- (Tuỳ chọn) `--students <path>` override.

- [ ] **Step 1:** Đổi make-sample-roster; chạy
  `pnpm --filter web make:sample-roster`; commit binary xlsx nếu repo
  đang track chúng.
- [ ] **Step 2:** Đổi mock-agent; smoke `--count 2` với session đã seed
  (nếu có API) hoặc ít nhất unit/logic đọc file không throw.
- [ ] **Step 3:** Commit `feat(seed): align roster xlsx and mock-agent with students fixture`.

---

## Task 5: DEMO-RUNBOOK + README

**Spec:** §5

**Files:**
- Modify: `DEMO-RUNBOOK.md`, `README.md` (mục first admin)

**DEMO-RUNBOOK đường chính:**

1. Sau API up: set `SEED_API_ENABLED=true`, copy `.env.seed.example` →
   `.env.seed.local`, `pnpm seed:sample`.
2. Login `gv.nguyenvanan@iuh.edu.vn` (password local) → tạo phiên trên
   `4220004247 — Nhóm 01`.
3. Agent / mock-agent: MSSV từ `students.json` (vd. phần tử đầu / `--count
   20`).
4. Xóa khối argon2 + `INSERT account`.
5. Xóa bắt buộc bước 5b click roster; chuyển “Worth showing” importer →
   **Appendix**.
6. Global replace chỗ còn `demo-teacher@`, `MSSVTEST`, `SV20120001`,
   `CS101` trên đường chính.

**README:** Getting first admin → ưu tiên bootstrap / `pnpm seed:sample`;
SQL = fallback khi seed API tắt.

- [ ] **Step 1:** Sửa DEMO-RUNBOOK.
- [ ] **Step 2:** Sửa README first-admin.
- [ ] **Step 3:** Commit `docs(seed): drive DEMO-RUNBOOK from seed-sample-data script`.

---

## Task 6: Kiểm tra tổng + self-review

- [ ] **Step 1:** (Khuyến nghị) `docker compose down -v` → up postgres →
  `migration:run` + `migration:run:e2e` → API seed on → `pnpm seed:sample`
  → login GV → roster đúng → (nếu được) mock-agent count 20.
- [ ] **Step 2:** `pnpm --filter api test:e2e -- seed --forceExit` xanh.
- [ ] **Step 3:** `pnpm --filter api lint` + `build` xanh.
- [ ] **Step 4:** Grep repo đường chính/fixture: không còn `MSSVTEST` trong
  students/reference/runbook chính; `demo-teacher@example.com` không còn
  trên đường chính runbook.
- [ ] **Step 5:** Commit nếu còn sót
  `test(seed): verify sample seed path after migration cleanup` (hoặc
  skip nếu Task 1–5 đã đủ).

---

## Ngoài phạm vi plan này

| Hạng mục | Ghi chú |
| --- | --- |
| `--from-cine` | Spec §3 tùy chọn sau |
| Bundle `/admin/seed/bundle` | Design API §6.8 |
| Xóa hẳn claim-unowned API | Giữ cho DB cũ / e2e riêng |
| Chạy seed script trên production công cộng | Flag tắt |

---

## Thứ tự commit gợi ý

1. `docs(seed): approve sample-data script spec and add plan`
2. `fix(seed): remove academic rows seeded by migration`
3. `feat(seed): add production-shaped seed fixtures`
4. `feat(seed): add seed-sample-data CLI`
5. `feat(seed): align roster xlsx and mock-agent with students fixture`
6. `docs(seed): drive DEMO-RUNBOOK from seed-sample-data script`

---

## Tiêu chí xong nhánh (slice này)

- [ ] Migrate sạch → không còn CS101/phòng A1… từ migration seed
- [ ] `pnpm seed:sample` nạp đủ đồ thị hình production
- [ ] DEMO-RUNBOOK đường chính không SQL account / không bắt click roster
- [ ] mock-agent + sample-roster khớp `students.json`
- [ ] E2e seed xanh trên `examcollect_e2e`
- [ ] Spec §3b / §3c / §9 khớp code

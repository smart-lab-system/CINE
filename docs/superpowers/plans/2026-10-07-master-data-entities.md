# Master data entities (catalog) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm 7 bảng catalog độc lập (`academic_year`, `semester`, `course`, `nominal_class`, `student`, `room`, `computer`) + CRUD admin API/UI — **không** gắn FK vào schema nghiệp vụ cũ.

**Architecture:** Module NestJS `master-data` mới; một migration handwritten; entities kế thừa `BaseEntity`; route dưới `/master-data/*` chỉ `@Roles('admin')`. Web: nhóm nav admin + trang CRUD theo pattern `admin/accounts`. Unique/FK RESTRICT → 409 qua `PostgresExceptionFilter` sẵn có.

**Tech Stack:** NestJS 11 + TypeORM + PostgreSQL 16 (`examcollect`), Jest/supertest e2e; Next.js App Router + TanStack Query + shadcn; `openapi-typescript` (`@cine/shared generate:api-client`).

**Spec:** `docs/superpowers/specs/2026-10-07-master-data-entities-design.md`

**Branch:** `feature/master-data-entities`

---

## Verified facts

- `AccountsService.search` trả `{ items, total }` với `page` (1-based) + `pageSize` (max 100) — **khớp pagination này** cho mọi list master-data.
- Unique `23505` và FK `23503` đã map → `ConflictException` 409 trong `PostgresExceptionFilter` — không cần filter mới cho xoá cha khi còn con.
- Bảng `course` / `room` / `semester` đã bị `DROP` ở `ContractMasterData`; tạo lại với tên đó **không** đụng bảng hiện có. Entity lớp môn vẫn là `class` → catalog lớp hành chính **phải** tên `nominal_class`.
- OpenAPI client: API chạy rồi  
  `API_URL=http://localhost:4000/api-docs-json pnpm --filter @cine/shared generate:api-client`.
- E2E: chỉ `.env.test` → docker Postgres `localhost:5442`; `test/setup-env.ts` bắt buộc. **Không** chạy e2e với `apps/api/.env` (thường trỏ cloud).
- `ADMIN_NAV` trong `apps/web/src/lib/nav-config.ts` — comment đã ghi đã xoá mục học kỳ/phòng; đợt này **thêm lại** dưới `/admin/master-data/...`, không 404.

## Global constraints

- **Cấm** thêm cột/FK trên `exam_session`, `class`, `enrollment`, `submission`, `rubric`, …
- Không đổi grading / agent / teacher class ownership.
- Copy UI tiếng Việt; comment code giải thích *why* (khớp repo).
- Hard delete + RESTRICT; vòng đời = cột `status` (không soft-delete).
- Không `migration:generate` mù — handwritten.
- E2E chỉ DB test local (xem spec §7).
- Commit theo task khi chủ đồ án yêu cầu; **không push/PR** cho đến khi được bảo.

## Review focus

1. Không có import/FK từ module cũ sang entity catalog (và ngược lại).
2. Teacher gọi `/master-data/*` → 403.
3. Xoá `academic_year` còn `semester` / xoá `room` còn `computer` / xoá `nominal_class` còn `student` → 409, không cascade.
4. Unique `(academic_year_id, code)` và `(room_id, hostname)` và `student.mssv` citext.
5. Nav admin không trỏ route chết.

---

## Task 0: Commit docs trên branch (khi được yêu cầu)

**Files:**
- `docs/superpowers/specs/2026-10-07-master-data-entities-design.md`
- `docs/superpowers/plans/2026-10-07-master-data-entities.md`

- [x] **Step 1:** Xác nhận `.cursor/` nằm trong `.gitignore` và **không** stage rule Cursor.
- [ ] **Step 2:** Commit riêng docs (spec + plan + `.gitignore` nếu chưa) khi user yêu cầu.

---

## Task 1: Migration + entities + data-source + verify-schema

**Files:**
- Create: `apps/api/src/database/migrations/<ts>-AddMasterDataEntities.ts`
- Create: `apps/api/src/master-data/entities/{academic-year,semester,course,nominal-class,student,room,computer}.entity.ts`
- Modify: `apps/api/src/database/data-source.ts` (đăng ký 7 entity)
- Modify: `apps/api/src/database/verify-schema.ts` (`EXPECTED_TABLES`)

**DDL (một migration `up`):**

1. Tạo 7 enum status (tên type + giá trị đúng spec §2.9 / §2.2–2.8).
2. `academic_year` → `semester` (FK RESTRICT, unique `(academic_year_id, code)`, check `end_date > start_date` trên cả hai).
3. `course`.
4. `nominal_class` → `student` (FK RESTRICT; `mssv` citext + check regex; unique mssv).
5. `room` → `computer` (FK RESTRICT; unique `(room_id, hostname)`; check `capacity > 0`, `ram_gb > 0`).
6. Index/unique names ổn định (`uq_…`, `fk_…`, `ck_…`).

**`down`:** DROP TABLE theo thứ tự con→cha, rồi DROP TYPE.

- [ ] **Step 1:** Viết entities khớp cột/enum/index decorators (mirror entity hiện có).
- [ ] **Step 2:** Viết migration handwritten; không generate.
- [ ] **Step 3:** Đăng ký entity + thêm 7 tên vào `verify-schema.ts`.
- [ ] **Step 4:** Trên DB **test** (docker / `.env.test`): chạy migration, rồi `verify-schema` — đủ 7 bảng.
- [ ] **Step 5:** `tsc` / build api không lỗi.

---

## Task 2: Module API skeleton + academic-year & semester CRUD

**Files:**
- Create: `apps/api/src/master-data/master-data.module.ts`
- Create: controllers/services/dto cho `academic-years`, `semesters`
- Modify: `apps/api/src/app.module.ts` import `MasterDataModule`

**API:**

| Method | Path |
|---|---|
| GET/POST | `/master-data/academic-years` |
| GET/PATCH/DELETE | `/master-data/academic-years/:id` |
| GET/POST | `/master-data/semesters` |
| GET/PATCH/DELETE | `/master-data/semesters/:id` |

- Guards: `JwtAuthGuard`, `RolesGuard`, `@Roles('admin')` ở controller.
- List: `{ items, total }`, query `page`/`pageSize`, filter `status`; semester thêm `academicYearId`.
- Create/Patch DTO: class-validator; date fields; enum status.
- MVP: **không** enforce ngày kỳ ⊂ ngày năm ở DB; nếu validate ở service thì document trong comment (spec cho phép lỏng).

- [ ] **Step 1:** Module + wire AppModule; Swagger tags `master-data`.
- [ ] **Step 2:** CRUD academic-year.
- [ ] **Step 3:** CRUD semester (require `academicYearId` lúc create).
- [ ] **Step 4:** e2e file `apps/api/test/master-data-academic.e2e-spec.ts` trên DB test:
  - admin create year + semester OK
  - teacher → 403
  - duplicate year `code` → 409
  - delete year còn semester → 409
  - delete semester rồi year → 204

---

## Task 3: course + nominal_class + student CRUD

**Files:** services/controllers/dto tương ứng trong `master-data/`

| Method | Path |
|---|---|
| GET/POST | `/master-data/courses` |
| GET/PATCH/DELETE | `/master-data/courses/:id` |
| GET/POST | `/master-data/nominal-classes` |
| GET/PATCH/DELETE | `/master-data/nominal-classes/:id` |
| GET/POST | `/master-data/students` |
| GET/PATCH/DELETE | `/master-data/students/:id` |

- Student list: filter `nominalClassId`, `search` (ILIKE mssv hoặc full_name).
- MSSV: cùng regex enrollment; citext unique.

- [ ] **Step 1:** CRUD course + nominal-class.
- [ ] **Step 2:** CRUD student.
- [ ] **Step 3:** e2e `master-data-students.e2e-spec.ts` (DB test):
  - create class + student
  - bad mssv → 400
  - duplicate mssv → 409
  - delete nominal_class còn student → 409
  - teacher → 403

---

## Task 4: room + computer CRUD

| Method | Path |
|---|---|
| GET/POST | `/master-data/rooms` |
| GET/PATCH/DELETE | `/master-data/rooms/:id` |
| GET/POST | `/master-data/computers` |
| GET/PATCH/DELETE | `/master-data/computers/:id` |

- Computer create: `roomId`, `hostname`, `cpu`, `ramGb`, `storage`, `os`; optional `gpu`, `ipAddress`, `macAddress`.
- List computers: filter `roomId`.

- [ ] **Step 1:** CRUD room + computer.
- [ ] **Step 2:** e2e `master-data-rooms.e2e-spec.ts` (DB test):
  - create room + computer
  - duplicate `(roomId, hostname)` → 409
  - delete room còn computer → 409
  - teacher → 403

---

## Task 5: OpenAPI client

- [ ] **Step 1:** Chạy API local (trỏ `.env` hoặc compose — **không** nhầm với lệnh e2e).
- [ ] **Step 2:**  
  `API_URL=http://localhost:4000/api-docs-json pnpm --filter @cine/shared generate:api-client`
- [ ] **Step 3:** Commit `packages/shared/src/api/schema.d.ts` cùng task API hoàn chỉnh (hoặc task này riêng).
- [ ] **Step 4:** Thêm thin wrappers `apps/web/src/lib/api/master-data.ts` (và hook nếu accounts có pattern tương đương) — chỉ gọi path đã generate.

---

## Task 6: Admin UI — nav + năm học / học kỳ / môn

**Files:**
- Modify: `apps/web/src/lib/nav-config.ts`
- Create: `apps/web/src/app/admin/master-data/**`

**Nav (gợi ý tối thiểu, tránh 404):**

| Label | href |
|---|---|
| Năm học & học kỳ | `/admin/master-data/academic` |
| Môn học | `/admin/master-data/courses` |
| Lớp danh nghĩa | `/admin/master-data/nominal-classes` |
| Sinh viên | `/admin/master-data/students` |
| Phòng & máy | `/admin/master-data/rooms` |

UX: list + Dialog create/edit + xoá confirm; toast lỗi 409 rõ nghĩa. Pattern UI lấy từ `admin/accounts` (bảng + form).

- [ ] **Step 1:** Thêm nav items.
- [ ] **Step 2:** Trang academic (tabs hoặc 2 section: years + semesters; semester form có Select năm).
- [ ] **Step 3:** Trang courses.
- [ ] **Step 4:** Manual smoke admin login → CRUD; teacher không thấy mục nav master-data.

---

## Task 7: Admin UI — lớp / SV / phòng / máy

- [ ] **Step 1:** nominal-classes + students (Select lớp trên form SV; filter theo lớp trên list).
- [ ] **Step 2:** rooms list; từ phòng (hoặc filter `roomId`) quản lý computers (form đủ hardware fields).
- [ ] **Step 3:** Xử lý lỗi xoá RESTRICT trên UI (toast từ message 409).
- [ ] **Step 4:** (Optional) Vitest nhẹ cho helper format/status nếu tách pure fn; không bắt buộc Playwright.

---

## Task 8: Tổng kết kiểm thử & dọn

- [ ] **Step 1:** Chạy toàn bộ e2e master-data* **chỉ** với hạ tầng `.env.test` / docker.
- [ ] **Step 2:** `verify-schema` trên DB đã migrate.
- [ ] **Step 3:** Grep đảm bảo **không** có `JoinColumn` / import entity master-data từ `exam-session`, `course` module cũ, `grading`, `enrollment`.
- [ ] **Step 4:** Cập nhật trạng thái spec header → `implemented` (hoặc ghi ngày) khi xong.

---

## Out of scope (không làm trong plan này)

- Gắn `semester_id` / `room_id` / `course_id` / `student_id` vào schema cũ.
- Import Excel/CSV.
- Seed demo catalog (trừ khi cần cho e2e — tạo trong `beforeAll` rồi xoá/`RESTRICT`-safe cleanup).

---

## Thứ tự commit gợi ý (khi user bảo commit)

1. `docs(spec,plan): master-data entities catalog` (+ `.gitignore` `.cursor/`)
2. `feat(api): master-data tables migration and entities`
3. `feat(api): master-data CRUD academic + semester`
4. `feat(api): master-data CRUD course, class, student`
5. `feat(api): master-data CRUD room, computer`
6. `chore(shared): regenerate openapi for master-data`
7. `feat(web): admin master-data UI`

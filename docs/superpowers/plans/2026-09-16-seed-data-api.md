# Seed-data API — Kế hoạch triển khai

> **Dành cho agent/executor:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (khuyến nghị) hoặc
> superpowers:executing-plans để làm từng task. Các bước dùng checkbox
> (`- [ ]`) để theo dõi.

**Goal:** Thêm bề mặt HTTP admin **ensure** (tạo-hoặc-trả-về) để đưa DB từ
trống / chỉ migration tới trạng thái demo-ready: admin, Trưởng khoa, GV,
học kỳ, phòng, môn (đã owner), lớp, roster — **không** nới `@Roles` của API
sản phẩm, **không** migration schema.

**Architecture:** Nest module mới `SeedModule`, chỉ đăng ký khi
`SEED_API_ENABLED=true`. Controller gọi vào service domain sẵn có
(`AccountsService`, `SemesterService`, `RoomService`, `CourseService`,
`ClassService`, `RosterService`) + `AuditLogService`. Client gửi khóa tự
nhiên (email, tên HK, mã môn…); server resolve UUID. Bootstrap một lần khi
`account` = 0 qua `POST /seed/bootstrap-admin` (không JWT).

**Tech Stack:** NestJS 10 · TypeORM 0.3 · Postgres `examcollect` ·
class-validator · Jest e2e (`apps/api/test/*.e2e-spec.ts`, DB thật) ·
ConfigModule (`SEED_API_ENABLED`)

**Spec:** `docs/superpowers/specs/2026-09-16-seed-data-api-design.md` —
executor **phải đọc** spec (đặc biệt §5–§6 và §11 đã chốt). Mọi `§N` dưới
đây trỏ vào spec đó.

**Nhánh:** `feature/seed-data-api`

**Quyết định đã chốt (spec §11):**

1. MVP = endpoint rời (§6.1–§6.7). **Không** làm bundle (§6.8) trong plan này.
2. Re-seed **không** reset password trừ `updatePassword: true`.
3. Khớp `CS101`/`CS201` unowned → gán head seed.
4. Chỉ `admin` gọi `/admin/seed/*` (không `department_admin`).
5. Script `scripts/seed-sample-data.mjs` = **ngoài MVP** (task follow-up,
   không chặn merge API).

---

## Global Constraints

- **KHÔNG migration.** Không `migration:generate`. Schema đủ rồi.
- **KHÔNG nới `@Roles` trên controller sản phẩm** (`ClassController` roster
  vẫn `teacher`; `CourseController` create vẫn `department_admin`;
  `RoomController`/`SemesterController` write vẫn `admin`). Seed là đường
  riêng.
- **KHÔNG đăng ký `SeedModule` khi flag tắt.** Ưu tiên không import module
  (route + Swagger biến mất), không phải handler trả 404 từng cái.
- **Flag:** `SEED_API_ENABLED=true` (chuỗi đúng `"true"`). Unset / khác →
  tắt. **Không** dùng một mình `NODE_ENV` làm cổng (spec §5.2).
- **Ghi qua service domain khi được.** Roster phải đi
  `RosterService.importForClass` (cùng luật MSSV / all-or-nothing). Không
  `INSERT` enrollment thủ công trừ khi service thiếu path — lúc đó mở rộng
  service, không bypass.
- **Password không bao giờ nằm trong response** ensure / bootstrap.
- **Audit chỉ khi `created: true`** (spec §5.4), qua
  `AuditLogService.recordUserAction` — không viết thẳng repository
  `audit_log`.
- **Mã lỗi ổn định** (spec §8) đưa vào body Nest exception object, ví dụ:
  `throw new ConflictException({ code: 'BOOTSTRAP_NOT_AVAILABLE', message: '...' })`.
- **Export service còn thiếu:** `AccountsModule`, `RoomModule` hiện không
  `exports`; `CourseModule` chưa export `SemesterService` /
  `RosterService`. Task 0 sửa trước khi SeedModule import được.
- **`CourseService.createForHead` lấy owner từ caller** — seed **không**
  gọi đường đó với admin id. Ensure course: tạo với
  `departmentHeadId` của head đã resolve, hoặc `assignOwner` khi nhận môn
  unowned (đã có audit trong `assignOwner`).
- **E2e:** `docker compose up -d postgres` (và MinIO nếu suite khác cần —
  suite seed thuần CRUD academic **không** cần MinIO). Schema:
  `pnpm --filter api migration:run`.
- **E2e flag:** bật `SEED_API_ENABLED=true` trong `beforeAll` của file seed
  (set `process.env` **trước** `Test.createTestingModule` / import
  `AppModule` nếu module đọc env lúc load). File e2e riêng
  `seed-api-disabled.e2e-spec.ts` **không** set flag để chứng minh route
  vắng.
- **Lệnh:**
  - unit: `pnpm --filter api test`
  - e2e: `pnpm --filter api test:e2e -- seed`
  - lint/build: `pnpm --filter api lint`, `pnpm --filter api build`
- **OpenAPI:** sau khi API chạy với flag bật,
  `API_URL=http://localhost:4000/api-docs-json pnpm --filter @cine/shared generate:api-client`
  (chỉ khi seed routes cần có trong client — có thể để cuối nhánh).
- **Commit:** mỗi task một commit, message dạng
  `feat(seed): …` / `test(seed): …`.

### Definition of Done (mọi task)

- [ ] Build + lint api pass
- [ ] Acceptance của task pass (e2e/unit như mô tả)
- [ ] Không hardcode secret thật; password demo chỉ trong test/fixture
- [ ] Self-review: không lộ password; flag tắt thì không có route; không
      đụng `@Roles` sản phẩm

---

## File Structure

**Tạo mới**

| File | Trách nhiệm |
| --- | --- |
| `apps/api/src/seed/seed.module.ts` | Wire controller + service; import modules cần export |
| `apps/api/src/seed/seed.controller.ts` | `POST /seed/bootstrap-admin` + `/admin/seed/*` |
| `apps/api/src/seed/seed.service.ts` | Logic ensure + bootstrap + audit |
| `apps/api/src/seed/dto/bootstrap-admin.dto.ts` | name, email, password |
| `apps/api/src/seed/dto/ensure-account.dto.ts` | + `updatePassword?`, `updateRole?` |
| `apps/api/src/seed/dto/ensure-semester.dto.ts` | + `updateDates?` |
| `apps/api/src/seed/dto/ensure-room.dto.ts` | + `updateCapacity?` |
| `apps/api/src/seed/dto/ensure-course.dto.ts` | code, name, semesterName, departmentHeadEmail |
| `apps/api/src/seed/dto/ensure-class.dto.ts` | + `reassignTeacher?` |
| `apps/api/src/seed/dto/ensure-roster.dto.ts` | courseCode, semesterName, className, students[], removeMissing? |
| `apps/api/src/seed/seed.types.ts` | `{ id, created, ... }` view chung / mã lỗi const |
| `apps/api/test/seed-api.e2e-spec.ts` | Happy path + idempotent + claim CS101 + roster |
| `apps/api/test/seed-api-disabled.e2e-spec.ts` | Flag tắt → 404 |

**Sửa**

| File | Thay đổi |
| --- | --- |
| `apps/api/src/accounts/accounts.module.ts` | `exports: [AccountsService]` |
| `apps/api/src/room/room.module.ts` | `exports: [RoomService]` |
| `apps/api/src/course/course.module.ts` | `exports` thêm `SemesterService`, `RosterService` (giữ exports hiện có) |
| `apps/api/src/app.module.ts` | Import điều kiện `SeedModule` khi flag |
| `apps/api/.env.example` | Thêm `SEED_API_ENABLED=` + comment tiếng Anh ngắn (file env đang EN) |

**Không tạo trong MVP**

- `POST /admin/seed/bundle`
- `scripts/seed-sample-data.mjs`
- Đổi DEMO-RUNBOOK (làm cùng PR script follow-up)

**Có thể cần sửa nhẹ service domain** (chỉ nếu thiếu lookup theo khóa tự nhiên):

| File | Khi nào |
| --- | --- |
| `accounts.service.ts` | Thêm `findByEmail` nếu seed không nên query repo trực tiếp |
| `semester.service.ts` | `findByName` |
| `room.service.ts` | `findByName` |
| `course.service.ts` | `findBySemesterAndCode` — hoặc seed query qua repo TypeORM trong SeedService cho read; **write** vẫn qua service |
| `class.service.ts` | `findByCourseAndName` / `createForHead` tái dùng nếu nhận `teacherId` |

Ruling plan: **SeedService được InjectRepository đọc** các entity cần match
idempotent; **mọi create/update** đi qua service domain đã có
(`AccountsService.create`, `SemesterService.create`, `RoomService.create`,
`CourseService` save/assignOwner, `ClassService.createForHead` hoặc
tương đương, `RosterService.importForClass`). Nếu `createForHead` bắt buộc
caller là head — seed gọi với `headId` đã resolve (không phải admin id),
đúng semantics ownership.

---

## Task 0: Mở export module + env example

**Files:**
- Modify: `accounts.module.ts`, `room.module.ts`, `course.module.ts`
- Modify: `apps/api/.env.example`

- [ ] **Step 1:** Thêm `exports: [AccountsService]` / `[RoomService]` /
  bổ sung `SemesterService`, `RosterService` vào `CourseModule.exports`.
- [ ] **Step 2:** Trong `.env.example` thêm:

```env
# Dev/demo only. When unset or not "true", SeedModule is not registered
# (no /seed/* or /admin/seed/* routes). Never enable in production.
# SEED_API_ENABLED=true
```

- [ ] **Step 3:** `pnpm --filter api build` pass.
- [ ] **Step 4:** Commit `chore(seed): export domain services for SeedModule`.

---

## Task 1: Skeleton SeedModule + cổng flag

**Files:**
- Create: `seed.module.ts`, `seed.controller.ts` (rỗng hoặc health stub),
  `seed.service.ts` (rỗng), `seed.types.ts`
- Modify: `app.module.ts`
- Test: `seed-api-disabled.e2e-spec.ts`

**Hành vi AppModule:**

```ts
const seedEnabled = process.env.SEED_API_ENABLED === 'true';
// ...
imports: [
  // ...
  ...(seedEnabled ? [SeedModule] : []),
],
```

- [ ] **Step 1:** Viết e2e `seed-api-disabled.e2e-spec.ts`: **không** set
  `SEED_API_ENABLED`. `POST /seed/bootstrap-admin` và
  `POST /admin/seed/accounts` → **404**.
- [ ] **Step 2:** Implement conditional import + module skeleton (controller
  có thể chưa có route thật — miễn 404 khi tắt).
- [ ] **Step 3:** Chạy e2e disabled → pass.
- [ ] **Step 4:** Commit `feat(seed): gate SeedModule behind SEED_API_ENABLED`.

---

## Task 2: Bootstrap admin

**Spec:** §5.3, §6.1

**Files:**
- Create: `dto/bootstrap-admin.dto.ts`
- Modify: `seed.service.ts`, `seed.controller.ts`
- Test: mở rộng `seed-api.e2e-spec.ts` (tạo mới, **bật flag trước khi load app**)

**Contract:**

```http
POST /seed/bootstrap-admin
Content-Type: application/json

{ "name": "Admin", "email": "admin@example.com", "password": "Demo123456!" }
```

- 201 + `{ id, email, role: "admin" }` (không password) khi count=0
- 409 `{ code: "BOOTSTRAP_NOT_AVAILABLE" }` khi đã có account
- Không JWT

- [ ] **Step 1:** E2e fail trước:
  1. DB có thể đã có account từ migration/test khác — bootstrap test nên
     dùng transaction/cleanup **hoặc** đếm trước: nếu count>0 kỳ vọng 409;
     để test “tạo được”, xóa hết account trong `beforeAll` của describe
     bootstrap **chỉ trong file này** (cẩn thận không chạy song song với
     file e2e khác trên cùng DB — chạy tuần tự như suite hiện tại).
  2. Cách an toàn hơn (khuyến nghị): describe riêng bootstrap dùng
     `DELETE FROM examcollect.account CASCADE`… **không** — FK RESTRICT.
     Thay vào đó: dùng DB sạch hoặc chỉ assert 409 khi đã có data + một
     test integration gọi service với repo mock count=0 ở unit.
  3. **Ruling thực dụng:** e2e chính: (a) với DB đã có account từ
     `createTestAccount` → bootstrap → 409; (b) unit/service test
     `SeedService.bootstrapAdmin` với count giả lập 0 → gọi
     `AccountsService.create` role admin. Nếu executor tìm được pattern
     wipe an toàn trong repo thì thêm e2e empty-DB; không bắt buộc nếu
     unit phủ nhánh count=0.
- [ ] **Step 2:** Implement: count accounts → 0 thì
  `AccountsService.create({ ..., role: 'admin' })` + audit
  `seed.bootstrap_admin` với `actorId` = id mới.
- [ ] **Step 3:** Route **public** (không `JwtAuthGuard` trên method này).
  Các route `/admin/seed/*` vẫn có guard.
- [ ] **Step 4:** E2e/unit pass. Commit `feat(seed): bootstrap-admin when account table empty`.

---

## Task 3: Ensure account

**Spec:** §6.2

```http
POST /admin/seed/accounts
Authorization: Bearer <admin>
```

- Match `email` (citext — so khớp case-insensitive).
- Chưa có → create; `created: true`; audit `seed.ensure_account`.
- Đã có → `created: false`; **không** đổi password/role trừ
  `updatePassword` / `updateRole` === true.
- Reject `super_admin` → 400/409 `SUPER_ADMIN_NOT_SEEDABLE`.
- Non-admin JWT → 403.

- [ ] **Step 1:** E2e: login admin (tạo bằng `createTestAccount` role admin)
  → ensure teacher 2 lần → cùng `id`, lần 2 `created: false` → login được
  với password ban đầu.
- [ ] **Step 2:** E2e: lần 2 gửi password khác **không** flag → login vẫn
  password cũ; với `updatePassword: true` → login password mới.
- [ ] **Step 3:** Implement + DTO.
- [ ] **Step 4:** Commit `feat(seed): ensure account by email`.

---

## Task 4: Ensure semester + room

**Spec:** §6.3, §6.4

- Semester match `name`; `updateDates` mặc định false.
- Room match `name`; `updateCapacity` mặc định false.
- 201/200 + `created`.

- [ ] **Step 1:** E2e ensure semester/room hai lần idempotent.
- [ ] **Step 2:** Implement qua `SemesterService` / `RoomService` create
  khi thiếu; update chỉ khi cờ.
- [ ] **Step 3:** Commit `feat(seed): ensure semester and room`.

---

## Task 5: Ensure course (+ claim unowned)

**Spec:** §6.5, quyết định §11.3

Body: `code`, `name`, `semesterName`, `departmentHeadEmail`.

Luồng:

1. Resolve semester by name → thiếu → 404 `SEMESTER_NOT_FOUND`.
2. Resolve head by email → thiếu hoặc không phải `department_admin` →
   `ACCOUNT_NOT_FOUND` / `ACCOUNT_ROLE_INVALID`.
3. Tìm course `(semester_id, code)`:
   - Không có → tạo với `departmentHeadId = head.id` (đừng dùng admin làm
     owner). Audit `seed.ensure_course`.
   - Có, `department_head_id` null → `assignOwner(id, head.id, actorAdminId)`
     (tái dùng audit sẵn có + có thể thêm action seed hoặc để
     `assignOwner` ghi action hiện tại — **ưu tiên gọi `assignOwner`** để
     một đường gán chủ). Response `created: false` nhưng có thể
     `claimed: true` (field optional; nếu thêm phải ghi trong OpenAPI).
   - Có, owner đúng head → no-op `created: false`.
   - Có, owner khác → 409 `COURSE_OWNED_BY_OTHER`.

- [ ] **Step 1:** E2e: đảm bảo học kỳ trùng tên với migration seed (“Học kỳ
  1 2026-2027” — **đọc đúng tên từ migration**
  `AddCourseRoomExamType`) + head → ensure `CS101` → môn unowned được
  gán head; ensure lần 2 cùng id.
- [ ] **Step 2:** E2e: course mới mã khác → tạo mới `created: true`.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Commit `feat(seed): ensure course and claim unowned migration rows`.

---

## Task 6: Ensure class

**Spec:** §6.6

Body: `courseCode`, `semesterName`, `name`, `teacherEmail`,
`reassignTeacher?`.

- Resolve course + teacher (`teacher` role).
- Match `(course_id, name)`.
- Thiếu → `ClassService.createForHead(headId, { courseId, name, teacherId })`
  với `headId` = owner của course (không phải admin).
- Có, khác teacher, không flag → `CLASS_TEACHER_MISMATCH`.
- Có, `reassignTeacher: true` → update teacher.

- [ ] **Step 1:** E2e idempotent + mismatch 409.
- [ ] **Step 2:** Implement.
- [ ] **Step 3:** Commit `feat(seed): ensure class by course and name`.

---

## Task 7: Ensure roster

**Spec:** §6.7

Body: giống product import + khóa lớp bằng
`courseCode` + `semesterName` + `className`.

- Resolve `ClassEntity` đủ quan hệ cho `RosterService.importForClass`.
- Gọi `importForClass(klass, { students, removeMissing })` — **không** qua
  `findTaughtBy` (đó là chỗ escape hatch).
- Validate DTO tái dùng rule MSSV (import `RosterStudentDto` /
  cùng regex từ `common/student-mssv`).
- Audit một event `seed.ensure_roster` khi có thay đổi (added/renamed/…) —
  nếu import trả counts = 0 giữ nguyên, có thể bỏ audit.

- [ ] **Step 1:** E2e: ensure roster → `GET /classes/:id/roster` (token
  teacher) thấy SV; ensure lần 2 không nhân bản.
- [ ] **Step 2:** E2e: MSSV invalid → 400, không ghi gì.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Commit `feat(seed): admin ensure roster via RosterService`.

---

## Task 8: Bộ e2e tổng + hoàn thiện

**Files:** `seed-api.e2e-spec.ts` (siết), có thể thêm unit
`seed.service.spec.ts` cho nhánh bootstrap count=0 nếu chưa có.

Kịch bản “demo mỏng” trong một test (flag bật):

1. Admin sẵn có (createTestAccount) **hoặc** bootstrap nếu suite cho phép
2. Ensure head + teacher
3. Ensure semester (tên migration) + room mới
4. Ensure CS101 claim
5. Ensure class Nhóm 01
6. Ensure roster 2 SV
7. Teacher login → `GET classes/teaching` thấy lớp; roster đủ 2

- [ ] **Step 1:** Chạy full `pnpm --filter api test:e2e -- seed` pass.
- [ ] **Step 2:** `pnpm --filter api lint` + `build` pass.
- [ ] **Step 3:** (Tuỳ chọn) regenerate OpenAPI client nếu team muốn seed
  trong shared types.
- [ ] **Step 4:** Commit `test(seed): end-to-end ensure graph for demo-ready DB`.

---

## Ngoài phạm vi plan này (follow-up)

Ghi để không ai “tiện tay” làm trong MVP:

| Hạng mục | Ghi chú |
| --- | --- |
| `POST /admin/seed/bundle` | Spec §6.8 / phase 1b |
| `scripts/seed-sample-data.mjs` | Root; map JSON Cine anh em; gọi endpoint rời |
| Cập nhật `DEMO-RUNBOOK.md` | Thay SQL account + click roster bằng seed |
| Lab/workstation/layout | Không bao giờ thuộc ExamCollect seed |

Khi làm script follow-up: đọc spec §7; giữ thêm roster `MSSVTEST01…20` nếu
còn cần mock-agent.

---

## Thứ tự commit gợi ý

1. `chore(seed): export domain services for SeedModule`
2. `feat(seed): gate SeedModule behind SEED_API_ENABLED`
3. `feat(seed): bootstrap-admin when account table empty`
4. `feat(seed): ensure account by email`
5. `feat(seed): ensure semester and room`
6. `feat(seed): ensure course and claim unowned migration rows`
7. `feat(seed): ensure class by course and name`
8. `feat(seed): admin ensure roster via RosterService`
9. `test(seed): end-to-end ensure graph for demo-ready DB`

---

## Tiêu chí xong nhánh (merge-ready API)

- [ ] Flag tắt → không có `/seed/*`, `/admin/seed/*`
- [ ] Admin + flag bật ensure được full graph § mục tiêu
- [ ] Re-seed idempotent; password không đổi nếu không cờ
- [ ] `CS101`/`CS201` unowned được claim đúng head
- [ ] Roster ghi `enrollment`; product `@Roles` không đổi
- [ ] E2e seed xanh; lint/build api xanh
- [ ] Spec vẫn khớp code (đặc biệt §5–§6)

# Admin lớp học phần + phân công GV — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin tạo lớp học phần (chọn môn + học kỳ catalog), gắn/thêm sinh viên, phân công giảng viên; lớp đã gán hiện ở「Lớp của tôi」. Teacher không còn tạo/xoá lớp.

**Architecture:** Expand/contract trên `class` + `enrollment` (không bảng mới). Module NestJS admin under prefix `/admin/course-sections`. Roster tái dùng `RosterService` (nới quyền gọi từ admin). Teacher `GET /classes/teaching` + roster giữ; gỡ `POST/PATCH/DELETE /classes`.

**Tech Stack:** NestJS 11 + TypeORM + PostgreSQL 16 (`examcollect`), Jest/supertest e2e; Next.js App Router + TanStack Query + shadcn; `openapi-typescript` (`@cine/shared generate:api-client`).

**Spec:** `docs/superpowers/specs/2026-10-07-admin-course-section-design.md`

**Branch:** `feature/sync-master-data-schema`

---

## Verified facts

- `class`: `teacher_id` NOT NULL, unique `uq_class_teacher_course_name` (`teacherId`, `courseName`, `name`); `course_name` điền từ hằng `COURSE_NAME` ở `createForTeacher`.
- `enrollment`: `home_teacher_id` NOT NULL; unique `(home_class_id, student_mssv)`; roster copy `homeTeacherId` từ `klass.teacherId`.
- Catalog đã có: `course`, `semester`, `student` (module `master-data`).
- Teacher CRUD e2e: `apps/api/test/classes-teacher-crud.e2e-spec.ts` — **phải viết lại** theo mô hình admin tạo + assign.
- Fixtures seed lớp: `INSERT INTO examcollect.class (course_name, name, teacher_id)` — vẫn hợp lệ với cột mới nullable.
- OpenAPI: `API_URL=http://localhost:4000/api-docs-json pnpm --filter @cine/shared generate:api-client`.
- E2E chỉ `.env.test` → Postgres docker `localhost:5442`; cấm `apps/api/.env` cloud.
- Migration mới: timestamp **> `1789520000000`** (hiện latest `AddRoomFloorComputerLocation`). Gợi ý: `1789530000000-ExpandClassForAdminCourseSection.ts`.
- `ADMIN_NAV` trong `apps/web/src/lib/nav-config.ts` — thêm mục「Lớp học phần」.

## Global constraints

- **Không** đổi `exam_session` schema / overlap / grading / agent protocol trong đợt này.
- **Không** bảng `course_section` mới.
- Snapshot: `course_name`, `student_mssv`, `student_name` — không cascade từ catalog.
- `ON DELETE`: `class.course_id` / `semester_id` → **RESTRICT**; `enrollment.student_id` → **SET NULL**.
- Handwritten migration only — không `migration:generate`.
- Commit theo task khi được yêu cầu; không push/PR đến khi được bảo.

## Review focus

1. Lớp `teacher_id IS NULL` không xuất hiện ở `/classes/teaching`.
2. Assign backfill mọi `enrollment.home_teacher_id` trong cùng transaction.
3. Teacher `POST /classes` → 404/410 (route gỡ) hoặc không còn trong OpenAPI; UI không còn「Tạo lớp」.
4. Sibling roster: ưu tiên `course_id`, fallback `course_name`.
5. Legacy class (FK NULL) + teacher đã gán vẫn tạo phiên được.

---

## Task 0: Docs trên branch (khi được yêu cầu)

**Files:**
- `docs/superpowers/specs/2026-10-07-admin-course-section-design.md`
- `docs/superpowers/plans/2026-10-07-admin-course-section.md`

- [ ] **Step 1:** Commit riêng docs khi user yêu cầu (không stage `.cursor/`).

---

## Task 1: Migration + entity expand

**Files:**
- Create: `apps/api/src/database/migrations/1789530000000-ExpandClassForAdminCourseSection.ts`
- Modify: `apps/api/src/course/entities/class.entity.ts`
- Modify: `apps/api/src/course/entities/enrollment.entity.ts`

**DDL `up` (thứ tự):**

1. `ALTER TABLE examcollect.class ADD COLUMN course_id uuid NULL`, `semester_id uuid NULL`.
2. FK `fk_class_course` → `course(id) ON DELETE RESTRICT`; `fk_class_semester` → `semester(id) ON DELETE RESTRICT`.
3. `ALTER TABLE examcollect.class ALTER COLUMN teacher_id DROP NOT NULL`.
4. Drop index `uq_class_teacher_course_name`.
5. Unique `uq_class_semester_course_name` trên `(semester_id, course_id, name)`.
6. Partial unique legacy (khuyến nghị):  
   `uq_class_legacy_teacher_name ON (teacher_id, name) WHERE course_id IS NULL AND teacher_id IS NOT NULL`.
7. `ALTER TABLE examcollect.enrollment ALTER COLUMN home_teacher_id DROP NOT NULL`.
8. `ADD COLUMN student_id uuid NULL` + FK `fk_enrollment_student` → `student(id) ON DELETE SET NULL`.

**`down`:** đảo ngược an toàn (drop FK/index/columns; restore NOT NULL chỉ nếu không còn NULL — hoặc document down không hỗ trợ nếu đã có hàng NULL).

**Entity:**

- `ClassEntity`: `courseId` / `semesterId` optional `ManyToOne`; `teacherId: string | null`; bỏ decorator unique cũ; thêm unique mới.
- `EnrollmentEntity`: `homeTeacherId: string | null`; `studentId` optional.

- [ ] **Step 1:** Viết migration handwritten.
- [ ] **Step 2:** Cập nhật entities + comment *why* (nullable = chưa phân công).
- [ ] **Step 3:** Chạy migration trên DB **test** (`.env.test`).
- [ ] **Step 4:** `tsc` api sạch.

---

## Task 2: RosterService — nullable teacher + sibling theo course_id

**Files:**
- Modify: `apps/api/src/course/roster.service.ts`
- Modify: unit spec nếu có (`roster.service.spec.ts`)

**Thay đổi:**

1. Mọi `insert`/`update` `homeTeacherId: klass.teacherId ?? null` (không ép string).
2. So sánh “teacher drift”: coi `null === null` là unchanged.
3. `siblingEnrollments`: nếu `klass.courseId` → `WHERE course_id = :id`; else `WHERE course_name = :name` (legacy).
4. `addStudent` / import: optional resolve `student_id` theo mssv citext nếu có hàng catalog (soft link); nếu DTO có `studentId` thì load catalog `active` và điền mssv/name.

- [ ] **Step 1:** Sửa service + comment.
- [ ] **Step 2:** Unit test: thêm SV khi `teacherId` null → `home_teacher_id` null; sibling theo `course_id`.

---

## Task 3: Admin API — course-sections CRUD + assign

**Files:**
- Create: `apps/api/src/course/admin-course-section.controller.ts` (hoặc `admin-course-section/`)
- Create: `apps/api/src/course/admin-course-section.service.ts`
- Create: DTOs (`create`, `update`, `list-query`, `assign`, extend roster student với `studentId?`)
- Modify: `apps/api/src/course/course.module.ts` — đăng ký controller/providers; import catalog repos hoặc `MasterDataModule` exports nếu cần
- Modify: `apps/api/src/app.module.ts` nếu tách module mới

**Routes** (`@Roles('admin')`, prefix `/admin/course-sections`):

| Method | Path |
|---|---|
| GET/POST | `/` |
| GET/PATCH/DELETE | `/:id` |
| POST | `/:id/assign` body `{ teacherId }` |

**Create:** require `courseId`, `semesterId`, `name`; optional `teacherId`.  
Load course + semester; set `courseName = course.name`; nếu có teacher → validate `role=teacher` và set cả `home_teacher_id` khi thêm SV sau.

**Assign:** transaction set `class.teacher_id` + `UPDATE enrollment SET home_teacher_id`. Reassign = cùng path.  
**Unassign (MVP):** chỉ khi không có `exam_session` trỏ lớp; else 409.

**PATCH name:** luôn (admin). Đổi `courseId`/`semesterId`: chỉ khi 0 enrollment và 0 session; cập nhật `course_name` snapshot.

**DELETE:** 409 nếu còn enrollment hoặc session; hoặc cho xoá roster trước rồi xoá lớp (document trong service). Khuyến nghị MVP: 409 nếu còn enrollment/session — admin xóa SV trước.

**List:** `{ items, total }`, `page`/`pageSize`, filter `semesterId`, `courseId`, `teacherId`, `unassigned`, `q`. Embed `courseName`, `semesterName`, teacher email/name, `studentCount`.

- [ ] **Step 1:** Service + DTOs + controller + Swagger tag.
- [ ] **Step 2:** Wire module.
- [ ] **Step 3:** e2e `apps/api/test/admin-course-section.e2e-spec.ts` (DB test):
  - admin tạo chưa gán → `teacher_id` null
  - teacher gọi admin API → 403
  - assign → teaching list thấy lớp
  - reassign backfill enrollment
  - duplicate `(semester, course, name)` → 409
  - delete còn session → 409

---

## Task 4: Admin roster endpoints

**Files:**
- Extend: `admin-course-section.controller.ts`
- Reuse: `RosterService` (truyền `ClassEntity` đã load bởi admin service — **không** qua `findTaughtBy`)
- DTO: `AddCourseSectionStudentDto` — `studentId?: uuid` XOR `{ mssv, name }`

| Method | Path |
|---|---|
| GET | `/:id/roster` |
| POST | `/:id/roster` (ImportRosterDto) |
| POST | `/:id/roster/students` |
| DELETE | `/:id/roster/students/:mssv` |

- [ ] **Step 1:** Endpoints gọi `RosterService` sau `findById` admin (không check teacher).
- [ ] **Step 2:** e2e: thêm bằng `studentId` trước assign; import bulk; cross-class same course → 409.

---

## Task 5: Khoá teacher tạo / sửa / xoá lớp

**Files:**
- Modify: `apps/api/src/course/class.controller.ts` — **xóa** `POST`, `PATCH`, `DELETE` (giữ `GET teaching` + roster).
- Modify: `apps/api/src/course/class.service.ts` — có thể giữ `createForTeacher` private/unused hoặc xóa; cập nhật comment ownership.
- Modify: `apps/api/src/course/dto/course.dto.ts` nếu chỉ admin dùng shape khác.
- Rewrite: `apps/api/test/classes-teacher-crud.e2e-spec.ts` → ca:
  - `POST /classes` → 404
  - Admin tạo + assign → teacher teaching list + roster OK
  - Teacher vẫn import roster trên lớp đã gán
- Grep fixtures/e2e còn `POST /classes` → chuyển sang seed SQL hoặc admin API + assign.

- [ ] **Step 1:** Gỡ route + cập nhật comment controller.
- [ ] **Step 2:** Sửa mọi e2e/helper tạo lớp qua teacher POST.
- [ ] **Step 3:** `classes-teacher-crud` (hoặc đổi tên file) xanh theo mô hình mới.

---

## Task 6: OpenAPI client

**Files:**
- Regenerate: `packages/shared/src/api/schema.d.ts`
- Modify: `apps/web/src/lib/api/teaching.ts` (bỏ create/update/delete class nếu typed)
- Create: `apps/web/src/lib/api/admin-course-sections.ts` (hoặc tương đương)

- [ ] **Step 1:** API chạy local → generate client.
- [ ] **Step 2:** Wrapper typed cho admin course-sections + cập nhật teaching wrappers.

---

## Task 7: Web admin — Lớp học phần

**Files:**
- Modify: `apps/web/src/lib/nav-config.ts` — `{ label: 'Lớp học phần', href: '/admin/course-sections', ... }`
- Create: `apps/web/src/app/admin/course-sections/page.tsx` — list + filter + dialog tạo
- Create: `apps/web/src/app/admin/course-sections/[id]/page.tsx` — chi tiết, roster, assign dialog
- Hooks: `useAdminCourseSections` mirror accounts/master-data patterns
- Reuse: parse roster file từ `apps/web/src/lib/roster-file.ts` nếu teacher đã có

**UX tối thiểu:**

- List: tên, môn, học kỳ, GV /「Chưa phân công」, sĩ số.
- Tạo: select course, select semester (filter year), name, optional teacher.
- Chi tiết: bảng roster; thêm SV (search catalog hoặc form mssv+tên); import; nút Phân công.

- [ ] **Step 1:** Nav + list/create.
- [ ] **Step 2:** Detail + roster + assign.
- [ ] **Step 3:** Smoke thủ công hoặc component test nhẹ nếu repo đã có pattern admin.

---

## Task 8: Web teacher — bỏ tạo/xoá lớp

**Files:**
- Modify: `apps/web/src/app/teacher/classes/page.tsx` — bỏ nút Tạo lớp, edit/delete class dialogs; cập nhật `PageHeader` description (lớp do admin phân công).
- Modify/remove: `class-form-dialog.tsx`, `delete-class-dialog.tsx` usage.
- Modify: `apps/web/src/app/teacher/classes/page.test.tsx`
- Roster page: giữ; breadcrumb copy ổn.

- [ ] **Step 1:** UI teacher chỉ list + link roster.
- [ ] **Step 2:** Test trang classes cập nhật.

---

## Task 9: Regression gate

- [ ] **Step 1:** `npx tsc --noEmit` (api + web).
- [ ] **Step 2:** e2e: `admin-course-section`, classes (mới), một slice `exam-session` tạo phiên từ lớp đã assign.
- [ ] **Step 3:** Đánh dấu spec **implemented** khi xong; không làm sync `exam_session.semester_id` trừ khi user yêu cầu thêm.

---

## Commit gợi ý (khi được bảo)

1. `docs: admin course section spec + plan`
2. `feat(db): expand class/enrollment for admin course sections`
3. `feat(api): admin course-sections CRUD, assign, roster`
4. `fix(api): remove teacher class create/update/delete`
5. `chore(shared): regenerate openapi for course-sections`
6. `feat(web): admin course-sections UI; teacher classes read-only meta`

---

## Out of scope (không làm trong plan này)

- Prefill `exam_session` từ `class.semester_id` ([sync-master-data-schema](../specs/2026-10-07-sync-master-data-schema-design.md)).
- Bỏ hằng `COURSE_NAME` toàn hệ thống.
- Import nhiều lớp + email GV một file.
- Gán máy / chỗ ngồi.

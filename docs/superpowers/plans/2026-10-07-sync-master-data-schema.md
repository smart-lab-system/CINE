# Đồng bộ catalog → exam_session (FK + snapshot) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gắn catalog `semester` / `room` vào `exam_session` bằng FK nullable + dual-write snapshot text — **không** đảo `ContractMasterData`, không đổi nguồn đọc runtime (overlap / export / filter vẫn dùng text).

**Architecture:** Expand/contract trên `exam_session` (không bảng mới). Create path resolve Id → validate status → ghi `*_id` + copy `*.name` vào cột text; không Id → giữ gõ text, FK `NULL`. Teacher được GET list subset catalog để dropdown; CRUD vẫn admin.

**Tech Stack:** NestJS 11 + TypeORM + PostgreSQL 16 (`examcollect`), Jest/supertest e2e; Next.js App Router + TanStack Query + shadcn; `openapi-typescript` (`@cine/shared generate:api-client`).

**Spec:** `docs/superpowers/specs/2026-10-07-sync-master-data-schema-design.md`

**Branch:** `feature/sync-master-data-schema`

---

## Verified facts

- `exam_session.semester_name`: `update: false` (entity) — bất biến sau tạo; e2e `exam-session-semester-name.e2e-spec.ts` pin.
- `exam_session.room_name`: text; exclusion `ex_exam_session_room_overlap` trên `room_name` (GiST) — **không** đổi predicate trong phase 1.
- Create: `ExamSessionService.create` ghi `roomName` / `semesterName` từ DTO; hiện **không** có PATCH đổi phòng — dual-write phase 1 chỉ trên **create** (không thêm endpoint PATCH room mới).
- Catalog: module `master-data`; controllers hiện `@Roles('admin')` class-level trên years / semesters / rooms.
- Semester status: `active` | …; room status: `available` | … (sau rename migration).
- Migration mới: timestamp **> `1789530000000`** (`ExpandClassForAdminCourseSection`). Gợi ý: `1789540000000-AddExamSessionSemesterRoomFk.ts`.
- OpenAPI: `API_URL=http://localhost:4000/api-docs-json pnpm --filter @cine/shared generate:api-client`.
- E2E chỉ `.env.test` → Postgres docker `localhost:5442`; cấm `apps/api/.env` cloud.
- UI tạo phiên: `apps/web/src/app/teacher/exam-sessions/new/` — hiện input + datalist từ phiên cũ; schema `new/schema.ts` require `roomName` / `semesterName` text.
- `verify-schema.ts` chỉ assert **tables**, không assert cột — cập nhật chỉ nếu sau này thêm assert cột.

## Global constraints

- **Giữ** cột `semester_name` / `room_name` / `course_name`; không backfill bắt buộc; không `NOT NULL` trên FK.
- **ON DELETE SET NULL** cho cả hai FK (xoá catalog không chặn phiên lịch sử; snapshot text còn).
- Runtime đọc: overlap, `ScheduleConflictService`, filter/export theo kỳ → vẫn **text**.
- Không exclusion trên `room_id`; không cascade đổi tên catalog → phiên cũ.
- Không đụng `class.course_id` / enrollment student / grading / agent (trừ compile nếu DTO đổi).
- Handwritten migration only — không `migration:generate`.
- Commit theo task khi được yêu cầu; không push/PR đến khi được bảo.

## Review focus

1. Dual-write: có Id → text DB = `catalog.name`, không phải text client lệch.
2. Không Id → FK NULL; text bắt buộc như cũ; overlap/list kỳ regression xanh.
3. Teacher GET years/semesters/rooms → 200; POST/PATCH/DELETE → 403.
4. Xoá room/semester catalog đang được phiên trỏ → SET NULL; `room_name`/`semester_name` còn.
5. Không đổi `ex_exam_session_room_overlap` predicate.

---

## Task 0: Docs trên branch (khi được yêu cầu)

**Files:**
- `docs/superpowers/specs/2026-10-07-sync-master-data-schema-design.md`
- `docs/superpowers/plans/2026-10-07-sync-master-data-schema.md`

- [ ] **Step 1:** Commit riêng docs khi user yêu cầu (không stage `.cursor/`).

---

## Task 1: Migration + entity columns

**Files:**
- Create: `apps/api/src/database/migrations/1789540000000-AddExamSessionSemesterRoomFk.ts`
- Modify: `apps/api/src/exam-session/entities/exam-session.entity.ts`
- Optionally: import entity semester/room từ `master-data/entities` cho `@ManyToOne` (tránh circular: chỉ type + string relation name nếu cần)

**DDL `up`:**

1. `ALTER TABLE examcollect.exam_session ADD COLUMN semester_id uuid NULL`.
2. `ALTER TABLE examcollect.exam_session ADD COLUMN room_id uuid NULL`.
3. FK `fk_exam_session_semester` → `examcollect.semester(id) ON DELETE SET NULL`.
4. FK `fk_exam_session_room` → `examcollect.room(id) ON DELETE SET NULL`.
5. Index btree `idx_exam_session_semester_id`, `idx_exam_session_room_id` (không unique).

**`down`:** drop FK + drop indexes + drop columns.

**Entity:**

- `semesterId: string | null`, `roomId: string | null`.
- `@ManyToOne` nullable, `onDelete: 'SET NULL'`, **không** `eager`.
- Comment *why*: FK mềm + snapshot text; overlap vẫn trên `room_name`.
- Giữ nguyên `semesterName` `update: false` và exclusion trên `room_name`.

- [x] **Step 1:** Viết migration handwritten.
- [x] **Step 2:** Cập nhật entity + comment.
- [x] **Step 3:** Chạy migration trên DB **test** (`.env.test`).
- [x] **Step 4:** `tsc` api sạch.

---

## Task 2: Dual-write trong ExamSessionService.create

**Files:**
- Modify: `apps/api/src/exam-session/exam-session.service.ts`
- Modify: `apps/api/src/exam-session/exam-session.module.ts` — inject repos `SemesterEntity` / `RoomEntity` (hoặc service catalog đọc-only)
- Modify: `apps/api/src/exam-session/exam-session.service.spec.ts` (unit dual-write)
- Modify: `apps/api/src/exam-session/dto/create-exam-session.dto.ts` (+ `.spec.ts`)
- Modify: `apps/api/src/exam-session/dto/exam-session-response.dto.ts`
- Map response trong `toResponse` / list mapper: thêm `semesterId` / `roomId` nullable

**DTO create:**

| Field | Rule |
|---|---|
| `semesterId?` | optional uuid |
| `semesterName?` | required **khi không có** `semesterId` (custom validator XOR-friendly) |
| `roomId?` | optional uuid |
| `roomName?` | required **khi không có** `roomId` |

**Resolve create (thứ tự):**

1. Có `semesterId` → load semester; 404 nếu không có; 400 nếu `status !== 'active'`; set `semesterId` + `semesterName = semester.name` (bỏ text client).
2. Không `semesterId` → require `semesterName`; `semesterId = null`.
3. Có `roomId` → load room; 404 nếu không có; 400 nếu `status !== 'available'`; set `roomId` + `roomName = room.name`.
4. Không `roomId` → require `roomName`; `roomId = null`.

**Không** thêm PATCH đổi `semesterId` (entity `update: false` đã chặn). **Không** thêm PATCH room mới trong phase 1.

- [x] **Step 1:** DTO + validator `(Id || Name)` cho semester và room.
- [x] **Step 2:** Dual-write trong `create` + wire module repos.
- [x] **Step 3:** Response DTO + mapper thêm Id nullable.
- [x] **Step 4:** Unit test: Id thắng text lệch; inactive Id → lỗi; text-only → FK null.

---

## Task 3: Nới GET roles catalog (teacher)

**Files:**
- Modify: `apps/api/src/master-data/master-data.controllers.ts`

**Cách làm (khuyến nghị):** bỏ `@Roles('admin')` class-level trên 3 controller years / semesters / rooms; gắn:

- `GET` list + `GET :id` → `@Roles('admin', 'teacher')`
- `POST` / `PATCH` / `DELETE` → `@Roles('admin')`

Không mở student / computer / course / nominal-class cho teacher.

- [x] **Step 1:** Đổi decorator roles từng method trên 3 controller.
- [x] **Step 2:** e2e nhỏ (file mới hoặc gắn master-data e2e): teacher GET semesters/rooms 200; teacher POST room 403.

---

## Task 4: OpenAPI client

**Files:**
- Regenerate: `packages/shared` (generated types)
- Consume: web API wrappers nếu typed từ shared

- [x] **Step 1:** API chạy local → `generate:api-client`.
- [x] **Step 2:** Commit generated khi user yêu cầu (cùng hoặc sau task API).

---

## Task 5: Web teacher — form tạo phiên select + fallback text

**Files:**
- Modify: `apps/web/src/app/teacher/exam-sessions/new/schema.ts`
- Modify: `apps/web/src/app/teacher/exam-sessions/new/page.tsx`
- Optionally: hook nhỏ list semesters/rooms (reuse pattern master-data hooks nếu đã có; hoặc fetch trực tiếp)
- List/detail phiên: giữ hiển thị text snapshot; Id chỉ prefill edit nếu sau này có form sửa phòng (phase 1: create only)

**UX:**

- Select **Học kỳ**: load semesters `status=active` (có thể nhóm theo năm — GET years active rồi filter `academicYearId`).
- Select **Phòng**: load rooms `status=available`.
- Toggle / collapse **「Nhập tay」**: gửi `semesterName` / `roomName` không Id (e2e + catalog trống).
- Khi chọn select: chỉ gửi Id (không gửi text, hoặc gửi cũng được — server bỏ qua).

- [x] **Step 1:** Schema zod: `(semesterId || semesterName)` và `(roomId || roomName)`.
- [x] **Step 2:** UI select + fallback; submit payload đúng.
- [x] **Step 3:** Smoke / component test nhẹ nếu đã có pattern trang `new`.

---

## Task 6: e2e dual-write + regression

**Files:**
- Create: `apps/api/test/exam-session-catalog-fk.e2e-spec.ts` (hoặc mở rộng `exam-session-semester-name.e2e-spec.ts`)
- Keep green: `exam-schedule-conflict.e2e-spec.ts`, create-session paths dùng text-only

**Ca bắt buộc:**

| Ca | Kỳ vọng |
|---|---|
| Tạo chỉ text | 201; `semester_id`/`room_id` NULL |
| Tạo có `semesterId` + `roomId` active/available | 201; Id set; text = catalog.name |
| `semesterId` không tồn tại / không active | 404/400 |
| `roomId` retired/maintenance | 400 |
| Id + text lệch | DB text = catalog.name |
| Teacher GET `/master-data/semesters` | 200 |
| Teacher POST `/master-data/rooms` | 403 |
| Xoá room catalog đang được phiên trỏ | phiên `room_id` NULL; `room_name` còn |
| Regression schedule-conflict + semester-name snapshot | xanh |

- [x] **Step 1:** Viết e2e dual-write + roles.
- [x] **Step 2:** Chạy regression conflict + semester-name trên DB test.
- [x] **Step 3:** `tsc` api + web sạch.

---

## Task 7: Regression gate + đóng spec

- [x] **Step 1:** Đánh dấu spec **implemented** khi xong.
- [x] **Step 2:** Không làm phase sau (`class.course_id` đã/đang ở plan admin-course-section; roster student; overlap theo `room_id`; bỏ gõ tự do) trừ khi user yêu cầu.

---

## Commit gợi ý (khi được bảo)

1. `docs: sync master-data schema spec + plan`
2. `feat(db): add exam_session semester_id/room_id FK nullable`
3. `feat(api): dual-write semester/room on exam session create`
4. `feat(api): allow teacher GET catalog years/semesters/rooms`
5. `chore(shared): regenerate openapi for session FK fields`
6. `feat(web): exam session form select semester/room with text fallback`

---

## Out of scope (không làm trong plan này)

- `exam_session.course_id`; đổi overlap sang `room_id`.
- Prefill phiên từ `class.semester_id` (có thể follow-up sau admin course-section ổn định).
- PATCH đổi phòng / học kỳ sau tạo.
- Bỏ cột text hoặc bắt buộc chọn catalog.
- Cascade rename catalog → phiên đã tạo.
- Import Excel / gán máy.

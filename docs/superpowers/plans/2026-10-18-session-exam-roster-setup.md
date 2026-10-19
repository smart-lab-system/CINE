# Cấu hình danh sách thi theo phiên — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trên hub Thiết lập, giảng viên cấu hình **danh sách thi chỉ cho phiên**: mặc định xem/chốt từ enrollment lớp; có thể materialize → thêm tay / import file / gỡ SV trước khi mở — không sửa enrollment lớp.

**Architecture:** Tái dùng bảng `session_roster` làm ảnh chốt sớm khi `scheduled`. Lần ghi đầu (add/import/remove) **materialize** full enrollment rồi mới sửa. `freeze`/`open`: rỗng → chép lớp như cũ; đã có dòng → dùng nguyên, seed seats thiếu, flip `active`. UI tái dùng ColumnMapper / ImportReview / ManualAddStudentForm với adapter phiên.

**Tech Stack:** NestJS + TypeORM; Next.js, TanStack Query, Vitest, Jest e2e.

**Spec:** `docs/superpowers/specs/2026-10-18-session-exam-roster-setup-design.md`

**Phụ thuộc:** Hub setup-edit + create-slim (open cần ≥ 1 deliverable); không phụ thuộc ops-lobby.

**Ngoài phạm vi:** sửa enrollment lớp; gỡ `frozen` sau `active`; phiên `classId` null full import; auto re-sync từ lớp.

---

## Verified facts (2026-10-18)

- `freeze()` chép enrollment → `session_roster` `source=frozen`; nếu đã có dòng + `scheduled` chỉ flip `active` (không seed lại) — phải sửa khi pre-seed.
- `POST/DELETE …/roster/students` đã có; `removeManual` chỉ `source=manual`.
- `addManually` không check freeze — footgun nếu thêm 1 SV rồi open.
- Class roster UI: `RosterScreen` + `lib/roster-file` + import qua `POST /classes/:id/roster`.
- Hub: `teacher/exam-sessions/[id]/page.tsx` — chưa có khối danh sách.

---

## Global constraints

- **Không** ghi `enrollment` từ hub phiên.
- Materialize **trước** mọi mutate khi `session_roster` rỗng.
- `scheduled`: được gỡ mọi source. `active+`: chỉ `manual`.
- Open với roster tùy chỉnh không được “kéo lại” SV đã gỡ từ lớp.
- E2E: Postgres docker `.env.test`; không dùng `.env` cloud.
- Commit theo task khi user yêu cầu; không push/PR đến khi được bảo.

---

## File structure

| File | Phase | Trách nhiệm |
|---|---|---|
| `session-roster.service.ts` | A | `listEffective`, `materialize`, `importStudents`, nới `remove`, sửa `freeze` |
| `exam-session.controller.ts` + DTO | A | GET roster, POST materialize, POST import |
| `apps/api/test/*roster*` / freeze e2e | A | Hợp đồng trên |
| `lib/api/…` + `useExamSession.ts` | B | Client + hooks |
| `SessionExamRosterCard.tsx` (+ test) | B | UI hub |
| `teacher/…/[id]/page.tsx` | B | Gắn card |
| setup-edit / create-slim docs | C | Một dòng trỏ spec |

---

## Review focus

1. Chưa tùy chỉnh → open = full lớp như cũ.
2. Materialize + gỡ 1 SV → open không còn SV đó; lớp enrollment nguyên.
3. Add khi rỗng không để lại roster chỉ 1 người (phải materialize trước).
4. Import `removeMissing` thay đúng danh sách phiên.
5. Sau `active` không DELETE được dòng `frozen`.

---

# Phase A — API session roster

## Task A.1: `listEffective` + `materialize`

**Files:** `session-roster.service.ts`, controller, DTO view

- [x] **Step 1:** `listEffective(session)` → `{ customized, students }` (`class` ảo nếu count=0).
- [x] **Step 2:** `materializeFromEnrollment(session)` — chỉ `scheduled`; no-op nếu đã có dòng; chép enrollment `source=frozen` (chưa seed seats — để freeze/add lo).
- [x] **Step 3:** `GET /exam-sessions/:id/roster` (teacher owner).
- [x] **Step 4:** `POST …/roster/materialize`.
- [x] **Step 5:** Unit/e2e: rỗng → class view; sau materialize `customized=true`.

## Task A.2: import + add/remove + freeze

**Files:** `session-roster.service.ts`, `POST …/roster/import`, sửa `addManually` / `removeManual` / `freeze`

- [x] **Step 1:** `importStudents({ students, removeMissing })` — materialize-if-empty; upsert; nếu `removeMissing` xoá MSSV không có trong file (scheduled only).
- [x] **Step 2:** Đầu `addManually`: nếu roster rỗng và `scheduled` → materialize rồi thêm `manual`.
- [x] **Step 3:** `remove`: nếu `scheduled` cho phép mọi source; nếu `active` giữ chỉ `manual`. Xoá seats an toàn như hiện tại.
- [x] **Step 4:** `freeze`: nếu đã có dòng → `seedSeats` cho mọi SV thiếu chỗ ngồi, flip `active`, **không** chép enrollment; nếu rỗng → chép như cũ.
- [x] **Step 5:** E2E: (1) open không tùy chỉnh; (2) materialize+remove+open; (3) import removeMissing; (4) delete frozen khi active → 409.

- [x] **Step 6:** Regenerate OpenAPI / cập nhật `packages/shared` nếu repo yêu cầu sau đổi controller.

---

# Phase B — Hub UI

## Task B.1: Client hooks

**Files:** `apps/web/src/lib/api/exam-session.ts` (hoặc `session-roster.ts`), `hooks/useExamSession.ts`

- [x] **Step 1:** `listSessionRoster`, `materializeSessionRoster`, `importSessionRoster`, reuse add/remove mutations.
- [x] **Step 2:** Query key invalidate cùng detail/attendance khi open.

## Task B.2: `SessionExamRosterCard`

**Files:** tạo `_components/SessionExamRosterCard.tsx` (+ test); sửa `[id]/page.tsx`

- [x] **Step 1:** Card: badge Theo lớp / Đã tùy chỉnh; bảng; search; Thêm SV; Tải file (mapper + ImportReview); gỡ khi scheduled.
- [x] **Step 2:** `mutable === scheduled` mới cho mutate; không scheduled → read-only từ GET.
- [x] **Step 3:** Wire vào page (sau Lịch & phòng).
- [x] **Step 4:** Vitest: hiện enrollment; sau mock customized; ẩn nút khi khoá.

---

# Phase C — Docs

## Task C.1: Ghi chú setup-edit

- [x] **Step 1:** setup-edit §5.2 thêm mục **Danh sách thi** trỏ spec này; ma trận §6: danh sách phiên sửa khi `scheduled`.
- [x] **Step 2:** Đánh dấu spec roster-setup `implemented` khi xong Phase A–B.

---

## Tiêu chí xong (spec §8)

1. Hub cấu hình danh sách chỉ-phiên.
2. Open mặc định = lớp; open sau tùy chỉnh = danh sách phiên.
3. Enrollment lớp không đổi.
4. Không gỡ `frozen` sau active.
5. Test API + web xanh.

# Flow thiết lập / chỉnh sửa phiên thi — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Làm thật status `scheduled` (create → chưa mở; mở phiên = freeze + `active`), rồi dựng hub **Thiết lập phiên** và dọn UX để giảng viên có một flow tạo → thiết lập → mở → thi → thu → chấm rõ ràng, không còn “active nhưng chưa freeze”.

**Architecture:** Ba phase tuần tự. Phase 1 chỉ backend lifecycle + display/e2e (không UI hub). Phase 2 thêm route teacher hub tái dùng API PATCH/open/materials/rubric đã có. Phase 3 nối land-after-create, CTA sau thi, calendar, cập nhật docs audit. Không hard-delete; không PATCH danh sách deliverables.

**Tech Stack:** NestJS 11, TypeORM 0.3, PostgreSQL 16, Jest e2e; Next.js App Router, TanStack Query, Vitest; OpenAPI client `@cine/shared`.

**Spec:** `docs/superpowers/specs/2026-10-18-exam-session-setup-edit-flow-design.md`

**Ngoài phạm vi:** hard-delete phiên; PATCH filenames/deliverables; wizard tạo nhiều bước; auto-open khi `startTime`; gộp grading vào lobby; dùng `draft` trong teacher flow.

---

## Verified facts (2026-10-18)

- `create()` ghi `status: 'active'` — comment nợ tại `exam-session.entity.ts` L18–41 và `exam-session.service.ts` ~L218–224.
- `POST /exam-sessions/:id/open` → `SessionRosterService.freeze()` — chỉ chụp roster + seed seats; **không** đổi status. Idempotent khi đã có dòng `session_roster`.
- “Đã freeze” trên API/UI ≈ có dòng `session_roster` (`rosterFrozen`), không phải status.
- `PATCH /:id` (phòng/giờ) + `POST …/cancel` đã có; guard theo chưa freeze / chưa exam over. Conflict đã nhận `excludeSessionId` (crud Wave C).
- `getDisplaySessionStatus`: với `active` suy nhãn theo đồng hồ (`Sắp diễn ra` / `Đang diễn ra` / `Đã kết thúc`) — sẽ sai sau khi create = `scheduled`.
- Labels hiện tại: `scheduled: 'Đã lên lịch'`, `active: 'Đang diễn ra'` — spec muốn **Sắp diễn ra** / **Đang thi**.
- List: dialog sửa lịch + huỷ khi `!rosterFrozen`; calendar click → lobby.
- Create success: CTA chính vào phòng chờ — chưa có hub.
- E2E assert create = `active`: `apps/api/test/exam-session.e2e-spec.ts` (vd. finalize ~L1031), và các suite freeze/conflict/lifecycle.
- Migration timestamp mới phải **> `1789610000000`** (hiện cao nhất: `ExamProblemBackfill`).
- E2E: Postgres docker `.env.test` (`localhost:5442`); cấm dùng `apps/api/.env` cloud.
- OpenAPI regenerate chỉ khi đổi contract HTTP (Phase 1 có thể không đổi path; response `status` sau create đổi giá trị — client type đã có `'scheduled'` trong enum).

---

## Global constraints

- **Không** auto-open / auto-freeze khi `startTime` đến.
- **Không** nới `agent:join` sang `scheduled` — join vẫn chỉ khi `active` + đã freeze (sau Phase 1 hai điều kiện trùng nghĩa).
- **Không** PATCH tên / lớp / loại kỳ. Deliverables: **không** sửa sau `active`; khi `scheduled` dùng PUT (create-slim).
- Collection phase (`active → collecting → completed`) và socket `exam:finalize` / recollect **không** đổi hành vi.
- Migration data: chỉ đổi nhãn status; **không** tự freeze phiên treo.
- `freeze()` giữ guard lớp rỗng (thi bù chưa hỗ trợ) — spec §5.4 checklist cảnh báo, không bỏ guard này ở Phase 1.
- File service backend ≤ ~500 dòng khi thêm logic nặng: nếu `open` phình, bọc flip status trong `session-roster.service` transaction hiện có hoặc helper nhỏ — không nhét grading vào exam-session.
- Commit theo task khi user yêu cầu; không push/PR đến khi được bảo.

---

## File structure

| File | Phase | Trách nhiệm |
|---|---|---|
| `apps/api/src/database/migrations/<ts>-ScheduledSessionStatus.ts` | 1 | Data migrate `active` chưa freeze → `scheduled`; optional `draft` → `scheduled` nếu `start_time` tương lai |
| `apps/api/src/exam-session/exam-session.service.ts` | 1 | `create()` → `scheduled`; comment; cancel/patch gate nếu cần siết theo status |
| `apps/api/src/exam-session/session-roster.service.ts` | 1 | Trong transaction freeze: `UPDATE status = 'active' WHERE id AND status = 'scheduled'`; 409 nếu không còn scheduled (trừ idempotent đã freeze) |
| `apps/api/src/exam-session/entities/exam-session.entity.ts` | 1 | Thay comment nợ bằng trỏ spec |
| `apps/api/test/exam-session.e2e-spec.ts` (+ freeze/lifecycle/conflict) | 1 | Expect create = `scheduled`; open → `active` + roster |
| `apps/web/src/lib/exam-session-display.ts` (+ test) | 1 | Map status thẳng; đổi labels |
| `apps/web/src/app/teacher/exam-sessions/[id]/page.tsx` (+ `_components/*`) | 2 | Hub thiết lập |
| `apps/web/src/app/teacher/exam-sessions/page.tsx` | 2–3 | Link Thiết lập; dialog lịch (giữ shortcut hoặc chỉ link) |
| `apps/web/src/app/teacher/exam-sessions/new/page.tsx` | 3 | Land CTA chính → hub |
| `apps/web/src/app/(exam-live)/exam-sessions/[id]/page.tsx` | 2–3 | Banner mở khi `scheduled`; link hub; CTA bài thu/chấm |
| `apps/web/src/app/teacher/exam-sessions/_components/session-calendar.tsx` | 3 | Click theo status |
| `docs/superpowers/specs/2026-10-12-crud-audit-design.md` | 3 | §2.5 / P1.2–P1.4 cập nhật |

---

## Review focus

1. Create không còn `active`; open là **một** transaction freeze + flip status.
2. Open lần hai (đã freeze): idempotent, không 409 oan, status vẫn `active`.
3. Cancel / PATCH lịch chỉ khi chưa mở (`scheduled` / chưa freeze) — cùng ý nghĩa.
4. UI không suy “Sắp diễn ra” từ đồng hồ trên `active`.
5. Hub không thay lobby; materials/rubric tái dùng hook hiện có.
6. Không regression thu bài / chấm.

---

# Phase 1 — Status thật

## Task 1.1: Migration data `active` chưa freeze → `scheduled`

**Files:**
- Create: `apps/api/src/database/migrations/1789620000000-ScheduledSessionStatus.ts` (timestamp > `1789610000000`; chỉnh nếu repo đã có số cao hơn lúc implement)

**SQL ý tưởng (không bọc transaction riêng nếu project đang `migrationsTransactionMode: 'none'` — làm một statement an toàn):**

```sql
-- Phiên đang gọi là active nhưng chưa có ảnh chốt roster = chưa mở cửa
UPDATE exam_session AS s
SET status = 'scheduled'
WHERE s.status = 'active'
  AND NOT EXISTS (
    SELECT 1 FROM session_roster r WHERE r.exam_session_id = s.id
  );

-- draft hiếm: còn giờ tương lai → scheduled
UPDATE exam_session
SET status = 'scheduled'
WHERE status = 'draft'
  AND start_time > NOW();
```

- [x] **Step 1:** Viết migration `up` như trên; `down` **không** cố đoán lại (hoặc no-op có comment) — đảo `scheduled→active` sẽ phá phiên đúng nghĩa.
- [x] **Step 2:** Chạy migrate trên DB local/test; đếm trước/sau vài hàng mẫu.
- [x] **Step 3:** Không regenerate OpenAPI (không đổi schema HTTP).

---

## Task 1.2: `create()` → `scheduled`

**Files:**
- Modify: `apps/api/src/exam-session/exam-session.service.ts` (~L218–224)
- Modify: `apps/api/src/exam-session/entities/exam-session.entity.ts` (comment L18–41 → trỏ spec)

**Hợp đồng:** `POST /exam-sessions` response `status === 'scheduled'`. `agent:join` trước open vẫn fail (`SESSION_NOT_ACTIVE` hoặc chưa freeze — giữ hành vi từ chối).

- [ ] **Step 1:** Đổi `status: 'active'` → `status: 'scheduled'`; cập nhật comment *why* (publish/open là nút “Mở phiên”).
- [ ] **Step 2:** Rút gọn comment entity: nửa trước không còn fiction; link `2026-10-18-exam-session-setup-edit-flow-design.md`.
- [ ] **Step 3:** Unit/e2e create: expect `scheduled` (Task 1.4).

---

## Task 1.3: `open` = freeze + flip `active` một transaction

**Files:**
- Modify: `apps/api/src/exam-session/session-roster.service.ts` — `freeze()`
- Optionally touch: `exam-session.controller.ts` chỉ nếu đổi shape response (ưu tiên giữ)

**Hợp đồng:**

| Tình huống | Kết quả |
|---|---|
| `scheduled`, lớp có SV | freeze roster + `status = 'active'`; 200 |
| Đã có roster (idempotent) | không insert lại; đảm bảo `status = 'active'` nếu vẫn lệch; 200 |
| `collecting` / `completed` / `cancelled` | 409 Conflict |
| Lớp 0 SV | giữ `BadRequestException` hiện tại |

**Cách làm đề xuất:** trong transaction `freeze` hiện có, sau khi insert (hoặc nhánh already > 0):

```ts
const updated = await manager
  .getRepository(ExamSessionEntity)
  .createQueryBuilder()
  .update()
  .set({ status: 'active' })
  .where('id = :id', { id: session.id })
  .andWhere("status = 'scheduled'")
  .execute();

// already frozen + already active: OK (idempotent)
// scheduled→active: updated.affected === 1
// wrong status and no roster yet: ConflictException
```

Chi tiết nhánh idempotent vs conflict: bám spec §4.2; viết e2e phủ cả hai.

- [ ] **Step 1:** Sửa `freeze()` theo bảng trên.
- [ ] **Step 2:** Đảm bảo PATCH/cancel vẫn chặn khi đã freeze (đã có) — thêm assert status `scheduled` nếu muốn defense-in-depth (optional, cùng PR nếu nhỏ).
- [ ] **Step 3:** `tsc` api sạch.

---

## Task 1.4: E2E + quét assert `active` sau create

**Files (tối thiểu):**
- `apps/api/test/exam-session.e2e-spec.ts`
- `apps/api/test/session-roster-freeze.e2e-spec.ts`
- `apps/api/test/session-lifecycle.e2e-spec.ts`
- Các file e2e khác `expect(.*status).toBe('active')` ngay sau create — grep và sửa

**Pattern chuẩn sau create:**

```ts
expect(created.body.status).toBe('scheduled');
// trước khi finalize / agent join:
await request(app.getHttpServer()).post(`/exam-sessions/${id}/open`).set(...).expect(201); // hoặc 200 theo controller hiện tại
expect((await getDetail).body.status).toBe('active');
expect((await getDetail).body.rosterFrozen).toBe(true);
```

- [ ] **Step 1:** `rg "status).toBe\\('active'\\)|status: 'active'" apps/api/test --glob '*exam*' ` (và suite liên quan); lập danh sách.
- [ ] **Step 2:** Sửa: create → `scheduled`; chỗ cần thi/finalize thì `open` trước.
- [ ] **Step 3:** Thêm ca: open trên `scheduled` → active; open lần 2 idempotent; cancel khi scheduled OK; cancel sau open 409.
- [ ] **Step 4:** Chạy `pnpm test:e2e` (hoặc jest e2e `--runInBand`) — xanh các suite đã đụng.

---

## Task 1.5: Display labels + bỏ suy diễn đồng hồ

**Files:**
- Modify: `apps/web/src/lib/exam-session-display.ts`
- Modify: `apps/web/src/lib/exam-session-display.test.ts`
- Grep consumers giả định nhãn cũ (`Đang diễn ra`, `Đã lên lịch`)

**Mục tiêu labels (spec §8.1):**

```ts
scheduled: 'Sắp diễn ra',
active: 'Đang thi',
collecting: 'Đang thu bài',
completed: 'Đã kết thúc', // hoặc giữ 'Đã hoàn thành' nếu list/submissions đang phụ thuộc — thống nhất một lần trong PR này; ưu tiên spec: 'Đã kết thúc'
cancelled: 'Đã huỷ',
draft: 'Nháp',
```

`getDisplaySessionStatus`: **bỏ** nhánh `if (status === 'active') { now < start … }`; luôn map từ `EXAM_SESSION_STATUS_LABELS` / badge variant.

- [ ] **Step 1:** Đổi labels + hàm; cập nhật test (các case đồng hồ trên `active` → kỳ vọng luôn “Đang thi”).
- [ ] **Step 2:** `pnpm --filter web test -- exam-session-display`.
- [ ] **Step 3:** Rà list filter copy nếu cứng chuỗi cũ.

**Done Phase 1 khi:** create = scheduled; open = active + frozen; UI nhãn đúng; e2e liên quan xanh.

---

# Phase 2 — Hub Thiết lập

## Task 2.1: Skeleton trang hub

**Files:**
- Create: `apps/web/src/app/teacher/exam-sessions/[id]/page.tsx`
- Create (tuỳ chọn tách): `_components/SetupChecklist.tsx`, `ScheduleEditor.tsx`, `DeliverablesReadonly.tsx`, `SessionMetaHeader.tsx`

**Hợp đồng UI:**
- Load `useExamSessionDetail(id)`.
- Header: tên, mã, badge status, lớp, loại kỳ, HK (chỉ đọc).
- CTA: Vào phòng chờ → `/exam-sessions/{id}`; khi `scheduled`: Mở phiên + Huỷ.
- Khi không `scheduled`: khối chỉnh sửa khoá; chỉ liên kết (§5.3).

- [ ] **Step 1:** Route render được với session thật (mock trong test nếu có pattern page test).
- [ ] **Step 2:** Wire `useOpenSession` / `useCancelExamSession` với confirm dialog (reuse copy list nếu có).

---

## Task 2.2: Khối lịch & phòng (catalog)

**Files:** hub components; reuse `useRooms`, `useUpdateExamSessionSchedule`

**Hợp đồng:** Form giống create: `SearchableSelect` phòng → `roomId` (+ snapshot name từ option); datetime start/end. Chỉ enable khi `status === 'scheduled'` (và `!rosterFrozen`).

- [ ] **Step 1:** Implement editor; bỏ phụ thuộc ô `roomName` text làm đường chính trên hub.
- [ ] **Step 2:** Toast lỗi conflict 409 từ API.
- [ ] **Step 3:** List page: thêm link **Thiết lập** → hub; **giữ** dialog sửa lịch nhanh (mặc định spec §14) nhưng đổi dialog sang chọn `roomId` catalog cho đồng bộ — hoặc giữ text nếu thời gian eo hẹp, ghi nợ trong PR description.

---

## Task 2.3: Đề phát + deliverables readonly + rubric

**Files:**
- Reuse/adapt: `ExamMaterialsCard` từ lobby (extract shared nếu import cross-route khó — ưu tiên extract nhẹ vào `components/exam/` hoặc truyền props)
- Rubric: reuse pattern `RubricPicker` / API set rubric từ grading hooks (`useSetSessionRubric` hoặc tương đương đã có)
- Deliverables: list readonly từ detail + copy huỷ+tạo lại

- [ ] **Step 1:** Materials trên hub khi `scheduled` / `active` theo ma trận spec §6.
- [ ] **Step 2:** Rubric gắn/đổi khi chưa grading lock (API quyết định; UI disable khi lỗi).
- [ ] **Step 3:** Optional: language cho `code_project` — chỉ nếu hook declare language đã dùng được ngoài PreparePanel; không block Phase 2 nếu phải kéo nhiều grading UI.

---

## Task 2.4: Checklist sẵn sàng mở

**Files:** `_components/SetupChecklist.tsx`

| Mục | Chặn nút Mở? |
|---|---|
| Giờ hợp lệ, `end > start`, chưa past end | Có |
| `status === 'scheduled'` | Có |
| Lớp 0 SV | Không (banner vàng; freeze API vẫn có thể 400) |
| 0 materials | Không (banner vàng) |
| Không rubric | Không (banner vàng) |

- [ ] **Step 1:** Implement checklist + disable/enable CTA Mở.
- [ ] **Step 2:** Vitest component cho chặn giờ + không chặn thiếu đề.

---

## Task 2.5: Lobby — banner theo `scheduled`

**Files:**
- `apps/web/src/app/(exam-live)/exam-sessions/[id]/page.tsx`

- [ ] **Step 1:** Điều kiện banner Mở phiên: `status === 'scheduled'` (thay `!rosterFrozen` nếu đang dùng cờ đó — dual-check OK: `scheduled && !rosterFrozen`).
- [ ] **Step 2:** Khi `scheduled`, thêm link **Thiết lập phiên** về hub.
- [ ] **Step 3:** Smoke test lobby không vỡ thu bài.

**Done Phase 2 khi:** GV thiết lập phòng/giờ/đề/rubric trên hub; mở phiên từ hub hoặc lobby; sau active hub khoá lịch.

---

# Phase 3 — Dọn UX & docs

## Task 3.1: Land sau create

**Files:** `apps/web/src/app/teacher/exam-sessions/new/page.tsx`

- [ ] **Step 1:** CTA chính **Thiết lập phiên** → `/teacher/exam-sessions/{id}`.
- [ ] **Step 2:** CTA phụ **Vào phòng chờ** giữ nguyên.
- [ ] **Step 3:** Cập nhật test page create nếu assert link cũ.

---

## Task 3.2: CTA sau thi (hub + lobby)

**Files:** hub page; lobby page

Khi `collecting` | `completed`:

- Link **Quản lý bài thu** → `/teacher/submissions` (hoặc deep-link session nếu đã có query).
- Link **Chuẩn bị chấm** / Chấm điểm → `/teacher/grading?sessionId={id}` (đúng pattern query hiện có).

- [ ] **Step 1:** Hub read-only CTAs §5.3.
- [ ] **Step 2:** Lobby thêm cùng nhóm CTA (không nhồi grading UI vào lobby).

---

## Task 3.3: Calendar navigation

**Files:** `apps/web/src/app/teacher/exam-sessions/_components/session-calendar.tsx`

- [ ] **Step 1:** Click thẻ: `scheduled` → hub; `active` | `collecting` → lobby; `completed` → hub hoặc submissions (chọn **hub** để một chỗ xem meta + CTA chấm).
- [ ] **Step 2:** Cập nhật test calendar nếu có.

---

## Task 3.4: Docs audit

**Files:**
- `docs/superpowers/specs/2026-10-12-crud-audit-design.md` §2.5, P1.2–P1.4
- Spec setup-edit: đổi trạng thái thành **approved for implementation** nếu đã duyệt (hoặc giữ đề xuất + ghi “plan đã có”)

- [ ] **Step 1:** Ghi P1.2/P1.4 đã có API+UI; P1.3 = soft-cancel; gap settings → trỏ `2026-10-18-exam-session-setup-edit-flow-design.md` + plan này.
- [ ] **Step 2:** Không sửa nội dung ngoài § liên quan phiên thi.

**Done Phase 3 khi:** create land hub; CTA chấm rõ; calendar đúng; audit không còn bảo thiếu PATCH lịch.

---

## Acceptance checklist (tổng)

- [ ] Tạo phiên → `scheduled`, nhãn **Sắp diễn ra**
- [ ] Mở phiên → `active` + roster frozen, nhãn **Đang thi**
- [ ] Trước mở: sửa phòng catalog + giờ trên hub; huỷ được
- [ ] Không sửa deliverables / lớp / tên trên UI
- [ ] Sau mở: không sửa lịch; không huỷ
- [ ] Lobby không còn “active nhưng chưa freeze”
- [ ] Collection + grading không regression (e2e freeze + lifecycle + một smoke grading nếu có)
- [ ] Docs audit cập nhật

---

## Thứ tự làm việc đề xuất

1. Phase 1 đủ xanh rồi mới hub (tránh UI giả định status cũ).
2. Trong Phase 2: 2.1 → 2.2 → 2.4 → 2.3 → 2.5 (checklist trước materials tinh chỉnh).
3. Phase 3 độc lập từng task sau hub merge.

Khi implement: đánh dấu checkbox `- [x]` trên file plan này theo từng step hoàn thành.

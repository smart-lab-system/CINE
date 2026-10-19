# UX danh sách · hub thông tin · Vận hành phiên thi — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cố định chiều cao hàng danh sách phiên; lưới thông tin phiên trên hub; đổi “Phòng chờ” → **Vận hành phiên thi** + meta trên trang live; search SV theo họ tên/MSSV; cột **Trạng thái** với **Chưa vào** (mặc định) và luật hết giờ → **Vắng mặt**.

**Architecture:** Chủ yếu frontend. Derive `RoomStatus` từ `AttendanceStudentView.firstSeenAt` / `connected` + `endTime`/`status` phiên — không đổi API attendance trong phase này. Copy + layout tách task để review dễ.

**Tech Stack:** Next.js App Router, TanStack Query, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-18-exam-ops-lobby-ux-design.md`

**Phụ thuộc:** Lobby gộp bảng đã có ([waiting-room](./2026-10-08-exam-waiting-room-ui.md) / hub setup-edit).

**Ngoài phạm vi:** đổi socket/agent:join; search server; đổi cột nộp bài; auto-open phiên.

---

## Verified facts (2026-10-18)

- List: `teacher/exam-sessions/page.tsx` — `TableRow` không `h-*`; thao tác `flex-wrap`; nút “Phòng chờ”.
- Hub header: `teacher/exam-sessions/[id]/page.tsx` — dồn `course · class · type · semester` + dòng giờ·phòng; CTA “Phòng chờ”.
- Live: `(exam-live)/exam-sessions/[id]/page.tsx` — `h1` “Phòng chờ phiên thi”; chỉ hiện `name` dưới title.
- `AttendanceService`: mọi `!connected` → mảng `absent` (cả chưa vào và đã disconnect). `firstSeenAt: null` = chưa từng connect.
- `resolveRoomStatus`: map `absent` → luôn `absent` — **không** phân biệt `firstSeenAt`; `disconnected` gần như không hiện cho roster lớp.
- Cột header: `Trạng thái phòng`; labels trong `ROOM_STATUS_LABEL`.

---

## Global constraints

- Derive trạng thái **đọc `firstSeenAt`**, không tin tên mảng `absent`/`present` một mình.
- `deadlinePassed = now >= endTime OR status ∈ {collecting, completed}`.
- Filter “Có mặt” vẫn gồm `present` + `disconnected` (nhóm đã từng vào phòng).
- Trước deadline: đếm/ô **Vắng mặt** = 0; **Chưa vào** là mặc định cho chưa connect.
- Không regen OpenAPI trừ khi phát hiện thiếu field (không kỳ vọng).
- Commit theo task khi user yêu cầu; không push/PR đến khi được bảo.

---

## File structure

| File | Task | Trách nhiệm |
|---|---|---|
| `lib/lobby-roster.ts` (+ test) | 1 | `not_joined`; `resolveRoomStatus` + opts endTime/status |
| `LobbyDashboard.tsx` (+ test) | 2 | Ô Chưa vào / Vắng mặt |
| `LobbyRosterTable.tsx` (+ test) | 2–3 | Cột Trạng thái; filter; search |
| `(exam-live)/…/page.tsx` (+ test) | 3–4 | Tiêu đề Vận hành; meta; wire endTime; search state |
| `teacher/…/[id]/page.tsx` | 4 | Lưới Thông tin phiên; CTA Vận hành |
| `teacher/…/page.tsx` (+ test nếu có) | 5 | Hàng `h-14`; nút Vận hành |
| Spec waiting-room (một dòng) | 5 | Supersede §6 trỏ spec mới |

---

## Review focus

1. Chưa từng vào trước hết giờ = **Chưa vào**, không **Vắng mặt**.
2. Sau hết giờ / collecting / completed: cùng SV = **Vắng mặt**.
3. Đã vào rồi disconnect = **Mất kết nối**, không Vắng mặt / Chưa vào.
4. Mọi CTA/title “Phòng chờ” → Vận hành phiên thi.
5. Search AND với filter; hàng list cao cố định.

---

# Phase 1 — Trạng thái Chưa vào / Vắng mặt

## Task 1: `lobby-roster` derive

**Files:**
- Modify: `apps/web/src/lib/lobby-roster.ts`
- Modify: `apps/web/src/lib/lobby-roster.test.ts`

**Hợp đồng:**

```ts
export type RoomStatus =
  | 'not_joined'
  | 'present'
  | 'disconnected'
  | 'absent'
  | 'makeup'
  | 'unknown';

export function resolveRoomStatus(
  mssv: string,
  attendance: Attendance | undefined,
  opts: { endTime: string; status: string; now?: number },
): RoomStatus
```

Luật (spec §5.2): makeup → present(connected) → disconnected(firstSeenAt) → not_joined / absent theo `deadlinePassed`.

`ROOM_STATUS_LABEL.not_joined = 'Chưa vào'`; `unknown` giữ fallback hiếm.

`filterLobbyRows`: thêm `not_joined`; `present` filter = present|disconnected; `absent` = chỉ `absent`.

`buildLobbyRosterRows` nhận thêm opts (hoặc resolve ở chỗ gọi với endTime từ session).

- [x] **Step 1:** Đổi type + labels + `resolveRoomStatus` + filter.
- [x] **Step 2:** Unit test: chưa vào trước/sau endTime; disconnect; present; makeup.
- [x] **Step 3:** `pnpm --filter web exec vitest run src/lib/lobby-roster.test.ts`.

---

## Task 2: Dashboard + bảng — cột Trạng thái + filter

**Files:**
- Modify: `LobbyDashboard.tsx` (+ test)
- Modify: `LobbyRosterTable.tsx` (+ test)
- Modify: live `page.tsx` (truyền `notJoinedCount` / `absentCount` nếu tách)

**Dashboard:** thêm/đổi ô **Chưa vào**; **Vắng mặt** chỉ sau deadline (hoặc luôn hiện số, thường 0 trước giờ).

**Bảng:** header **Trạng thái**; badge dùng label mới; filter tab **Chưa vào**.

- [x] **Step 1:** Wire counts từ rows đã derive (đếm `roomStatus`), không đếm mù `attendance.absent.length`.
- [x] **Step 2:** Cập nhật test dashboard / roster table.
- [x] **Step 3:** Chạy test component liên quan.

---

# Phase 2 — Search + Vận hành meta + copy

## Task 3: Search họ tên / MSSV

**Files:**
- Modify: `LobbyRosterTable.tsx` (+ test)
- Có thể helper `matchesLobbySearch(row, query)` trong `lobby-roster.ts`

- [x] **Step 1:** Input toolbar; filter AND với tab.
- [x] **Step 2:** Test: khớp tên, MSSV, kết hợp filter Có mặt.
- [x] **Step 3:** Vitest xanh.

---

## Task 4: Copy Vận hành + thông tin phiên (live + hub)

**Files:**
- Modify: `(exam-live)/exam-sessions/[id]/page.tsx` (+ test copy title)
- Modify: `teacher/exam-sessions/[id]/page.tsx`

**Live:** `h1` = Vận hành phiên thi; khối meta §4.1; truyền `endTime`/`status` xuống roster builder.

**Hub:** card/lưới Thông tin phiên; nút **Vận hành phiên thi**.

- [x] **Step 1:** Hub lưới metadata.
- [x] **Step 2:** Live title + meta + wire opts trạng thái.
- [x] **Step 3:** Cập nhật assert “Phòng chờ” → “Vận hành” trong test live nếu có.

---

# Phase 3 — Danh sách cố định chiều cao

## Task 5: List rows + docs note

**Files:**
- Modify: `teacher/exam-sessions/page.tsx` (+ `page.test.tsx` nếu assert “Phòng chờ”)
- Modify: `docs/superpowers/specs/2026-10-08-exam-waiting-room-ui-design.md` (một dòng supersede §6)

- [x] **Step 1:** `TableRow` `h-14`; truncate tên; `flex-nowrap` thao tác; nút Vận hành.
- [x] **Step 2:** Ghi chú waiting-room spec.
- [x] **Step 3:** Chạy test: `lobby-roster`, LobbyRoster*, LobbyDashboard*, exam-sessions page/live liên quan.

---

## Tiêu chí xong (spec §10)

1. Hàng list cao đều.
2. Hub lưới thông tin rõ.
3. Không còn “Phòng chờ” trên UI teacher màn này.
4. Vận hành có meta phiên.
5. Search + filter AND.
6. Chưa vào / hết giờ → Vắng mặt / mất kết nối / có mặt đúng luật.
7. Test xanh.

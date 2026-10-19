# Design: Flow thiết lập / chỉnh sửa / cài đặt phiên thi

**Ngày:** 2026-10-18
**Trạng thái:** implementing (plan `docs/superpowers/plans/2026-10-18-exam-session-setup-edit-flow.md`)
**Liên quan:**
- Nợ status `draft`/`scheduled` trong `apps/api/src/exam-session/entities/exam-session.entity.ts`
- [exam-collection-phase](./2026-09-11-exam-collection-phase-design.md) (`active → collecting → completed`)
- [exam-waiting-room-ui](./2026-10-08-exam-waiting-room-ui-design.md) (lobby live)
- [session-pinned-rubric](./2026-09-05-session-pinned-rubric-design.md)
- [crud-audit](./2026-10-12-crud-audit-design.md) §2.5 — **một phần đã lỗi thời** (xem §1.2)
- [sync-master-data](./2026-10-07-sync-master-data-schema-design.md) (PATCH phòng trước giờ thi)

---

## 1. Vấn đề

Giảng viên cần **tạo → thiết lập → mở → thi → thu → chấm**, nhưng hệ thống hiện không có một flow chỉnh sửa / cài đặt / thiết lập phiên thi thống nhất. Các thao tác bị rải ở ba cụm UI khác nhau, và **trạng thái DB không khớp ngôn ngữ người dùng**.

### 1.1 Hiện trạng UI / API (đối chiếu code 2026-10-18)

| Cụm | Route | Việc làm được |
|---|---|---|
| Quản lý | `/teacher/exam-sessions`, `/teacher/exam-sessions/new` | Tạo; sửa **phòng + giờ** (dialog); huỷ mềm; vào phòng chờ |
| Live | `/exam-sessions/[id]` (shell exam-live) | Đề thi, **Mở phiên** (freeze roster), roster, thu bài |
| Sau thi | `/teacher/submissions`, `/teacher/grading` | Archive / attention; **chuẩn bị chấm** (rubric, language, đề tham chiếu) |

API vận hành đã có: `PATCH /exam-sessions/:id` (phòng/giờ, trước freeze), `POST …/cancel`, `…/open`, materials, roster manual add/remove, finalize / confirm-end / recollect; `PATCH …/rubric` và deliverable language nằm ở grading.

**Không có** route/màn “Thiết lập phiên” hay edit tổng quát sau tạo.

### 1.2 Audit CRUD 2026-10-12 — cập nhật

| Mục audit | Hiện tại |
|---|---|
| P1.2 thiếu `PATCH /exam-sessions/:id` | **Đã có** API + dialog trên list |
| P1.4 thiếu DELETE roster manual | **Đã có** |
| P1.3 thiếu xoá/huỷ phiên nháp | Có **soft-cancel** (`POST …/cancel`); **không** hard-delete |
| Không có màn settings | **Vẫn đúng** — gap UX chính của spec này |

Gap còn lại chủ yếu là **lifecycle + UX**, không phải thiếu API PATCH lịch cơ bản.

### 1.3 Năm lệch logic gốc

1. **Status fiction.** Enum có `draft` / `scheduled` nhưng `ExamSessionService.create()` ghi thẳng `active`. “Mở phiên” chỉ freeze roster, **không** đổi status. Hệ quả: không có khoảnh khắc DB nào nghĩa là “ca thi bắt đầu”; `agent:join` phụ thuộc nút người bấm nhớ.
2. **Setup phân mảnh.** Tạo: lớp / giờ / deliverables / rubric tuỳ chọn. Sau tạo: lịch ở list; đề ở lobby; rubric / language ở grading. Không có một nơi “thiết lập phiên”.
3. **Hai nghĩa “Chuẩn bị”.** Chuẩn bị **thi** (đề, roster, mở cửa) vs chuẩn bị **chấm** (`PreparePanel` readiness) — cùng từ, khác route, dễ quên đến lúc thiếu rubric / đề.
4. **Bất biến sau tạo không được nói rõ.** Tên, lớp, loại kỳ, danh sách deliverables **không** sửa được; chỉ huỷ + tạo lại. UI không hướng dẫn thay thế.
5. **Phòng catalog lúc tạo / text tự do lúc sửa.** Lệch trải nghiệm chỉnh lịch; dễ lệch khỏi master data phòng.

```
Hiện tại (rút gọn):

  Tạo (status=active) ──► Lobby (đề + mở + thi + thu)
         │                      ▲
         └── Dialog phòng/giờ ──┘
  Soạn đề ── gắn ──► Lobby / materials
  Thu xong ──(nav riêng)──► Bài thu / Chuẩn bị chấm
```

---

## 2. Phạm vi

### Trong phạm vi

- Làm thật status `scheduled`: create → `scheduled`; mở phiên → freeze + `active` trong một transaction
- Migration dữ liệu: `active` chưa freeze roster → `scheduled`
- Hub **Thiết lập phiên** tại `/teacher/exam-sessions/[id]` (shell teacher)
- Ma trận quyền sửa theo phase (sản phẩm + gate API hiện có / bổ sung nhỏ)
- Copy hiển thị status; tách “Chuẩn bị ca thi” vs “Chuẩn bị chấm”
- Checklist sẵn sàng mở; land sau create vào hub
- CTA liên kết sau thi (Bài thu / Chuẩn bị chấm) từ hub và/hoặc lobby
- Cập nhật filter list, `getDisplaySessionStatus`, e2e liên quan create/open
- Ghi chú cập nhật crud-audit §2.5 (tránh spec chết)

### Ngoài phạm vi (cố ý)

| Không làm | Vì sao |
|---|---|
| Hard-delete phiên | Soft-cancel đủ cho vận hành; xoá cứng cần audit riêng |
| `PATCH`/`PUT` deliverables sau `active` | Rủi ro mismatch agent / bài nộp; khi `scheduled` thì **được** PUT — xem [create-slim](./2026-10-18-exam-session-create-slim-design.md) |
| Wizard nhiều bước trên form tạo | Form một card đã đủ; hub lo phần sau tạo |
| Gộp grading vào lobby | Quy ước cũ: điểm thuộc post-hoc |
| Dùng `draft` trong teacher flow | Form tạo all-or-nothing; `draft` giữ trong enum nhưng không ghi từ create |
| Đổi contract socket thu bài (`exam:finalize`, recollect) | Collection phase đã ổn định |
| Tự mở phiên khi `startTime` đến | Vẫn cần giảng viên chốt roster; không auto-open |

---

## 3. Quyết định đã chốt

1. Phiên thi là **workflow object**: sửa theo **phase**, không CRUD catalog tự do.
2. **Một hub Thiết lập** trước giờ mở; lobby chỉ lo **vận hành live**.
3. Status khớp ngôn ngữ: **Sắp diễn ra = `scheduled` (chưa mở)**; **Đang thi = `active` (đã mở + freeze)**.
4. Copy tách: **Chuẩn bị ca thi** (hub) vs **Chuẩn bị chấm** (grading).
5. Deliverables / tên / lớp / loại kỳ: **bất biến sau tạo**; hướng dẫn huỷ + tạo lại.
6. Sửa phòng trên hub dùng **catalog `roomId`** (cùng UX lúc tạo), không ô text tự do làm đường chính.

---

## 4. Máy trạng thái mục tiêu

Nửa sau (`active → collecting → completed`) giữ nguyên [collection-phase](./2026-09-11-exam-collection-phase-design.md). Spec này làm thật nửa trước.

```
                 create()
                    │
                    ▼
               scheduled  ◄── "đã lên lịch, chưa mở cửa"
                    │
        ┌───────────┼───────────────┐
        │           │               │
   "Huỷ phiên"  "Mở phiên thi"   (chỉnh phòng/giờ,
   → cancelled   freeze roster    đề, rubric…)
                 + status=active
                        │
                        ▼
                     active
                        │
           (finalize / sweep endTime — không đổi ở đây)
                        ▼
                   collecting → completed
```

| Sự kiện | Status | Ý nghĩa người dùng |
|---|---|---|
| Submit form tạo | `scheduled` | Đã lên lịch, chưa mở cửa cho SV |
| **Mở phiên thi** | `active` + freeze roster (1 transaction) | SV / agent được vào |
| Hết giờ / Chốt bài sớm | `collecting` | Đang thu bài |
| Xác nhận kết thúc / grace sweep | `completed` | Ca thi đóng |
| Huỷ trước khi mở | `cancelled` | Huỷ mềm |

### 4.1 Migration dữ liệu

| Điều kiện trước migrate | Sau migrate |
|---|---|
| `status = 'active'` và roster **chưa** freeze | `status = 'scheduled'` |
| `status = 'active'` và roster **đã** freeze | giữ `active` |
| `collecting` / `completed` / `cancelled` | không đổi |
| Hàng `draft` (nếu có — hiện đo được ~0) | đưa về `scheduled` hoặc `cancelled` tùy có đủ field bắt buộc; mặc định đề xuất: `scheduled` nếu còn `start_time` tương lai, else để admin xử lý tay trong script migrate |

Script migrate chạy một lần cùng deploy Phase 1. Không tự freeze các phiên đang “treo” — chỉ sửa nhãn status cho khớp thực tế “chưa mở”.

### 4.2 Thay đổi backend cụ thể

| Điểm | Hiện tại | Mục tiêu |
|---|---|---|
| `create()` | ghi `status: 'active'` | ghi `status: 'scheduled'` |
| `POST …/open` | freeze roster, **không** đổi status | freeze + `UPDATE … SET status = 'active' WHERE status = 'scheduled'` trong cùng transaction; 409 nếu không còn `scheduled` |
| `PATCH …/:id` | chặn khi đã freeze / exam over | giữ; với status mới: chỉ cho khi `scheduled` (tương đương chưa freeze) |
| `POST …/cancel` | chặn khi đã freeze / over | chỉ khi `scheduled` (cùng ý) |
| `agent:join` | từ chối nếu chưa freeze | giữ; sau Phase 1, “chưa freeze” ≡ `scheduled` |
| Filter search status | có `draft`/`scheduled` trong enum | UI list bắt đầu dùng `scheduled` thật |

Comment nợ dài trong entity (L18–41) được thay bằng tham chiếu spec này sau khi Phase 1 merge.

---

## 5. Hub “Thiết lập phiên”

### 5.1 Route & shell

- **Mới:** `/teacher/exam-sessions/[id]` — AppShell teacher (sidebar).
- **Giữ:** `/exam-sessions/[id]` — phòng chờ live (exam-live), không thay thế hub.
- List / calendar: link “Thiết lập” → hub; “Phòng chờ” → lobby (khi đã gần giờ hoặc đã `active`).

### 5.2 Khối nội dung khi `scheduled`

1. **Lịch & phòng** — chọn phòng từ catalog (`roomId`) + `startTime` / `endTime`; gọi `PATCH /exam-sessions/:id` hiện có. Conflict check đã có `excludeSessionId`.
2. **Danh sách thi** — mặc định enrollment lớp; tùy chỉnh **chỉ phiên** (upload / thêm tay / gỡ) khi `scheduled` — [session-exam-roster-setup](./2026-10-18-session-exam-roster-setup-design.md). Không sửa roster lớp.
3. **Đề phát cho SV** — upload / xoá materials; liên kết “Gắn từ Soạn đề” (giữ luật attach: `now < startTime`).
4. **Cấu hình thư mục bài thi** (file phải nộp) — **sửa khi `scheduled`** qua `PUT …/required-deliverables` ([create-slim](./2026-10-18-exam-session-create-slim-design.md)); chỉ đọc sau khi mở. Create không còn bắt buộc khai file. Nhãn UI + preview cây thư mục: [exam-folder-config-preview](./2026-10-18-exam-folder-config-preview-design.md).
5. **Rubric ca thi** — gắn / đổi sớm (reuse `PATCH …/rubric`). Không bắt buộc trước khi mở, nhưng checklist cảnh báo nếu thiếu. Form tạo không còn chọn rubric.
6. **Ngôn ngữ deliverable** (code_project) — cho phép khai sớm tại hub (reuse PATCH deliverable); không bắt buộc chờ PreparePanel.
7. **Checklist sẵn sàng mở** — xem §5.4.
8. **Huỷ phiên** — confirm; chỉ khi `scheduled`.

Meta chỉ đọc: tên phiên, mã, lớp, học kỳ, loại kỳ (TK/GK/CK).

### 5.3 Khi `active` / `collecting` / `completed` / `cancelled`

Hub chuyển **chỉ đọc + liên kết**:

| Status | CTA chính |
|---|---|
| `active` | Vào phòng chờ |
| `collecting` | Phòng chờ (thu bài) · Quản lý bài thu |
| `completed` | Quản lý bài thu · **Chuẩn bị chấm** / Chấm điểm |
| `cancelled` | Quay lại danh sách (không mở lại) |

Khối lịch / đề / rubric: khoá chỉnh sửa theo ma trận §6; vẫn xem được snapshot.

### 5.4 Checklist sẵn sàng mở

| Mục | Bắt buộc để enable “Mở phiên thi”? | UX khi thiếu |
|---|---|---|
| `startTime` / `endTime` hợp lệ, chưa over | Có | Chặn + giải thích |
| Roster lớp nguồn > 0 SV **hoặc** đã có kế hoạch thêm tay | Cảnh báo mạnh; **không** chặn cứng nếu sản phẩm vẫn cho lớp trống + thêm tay (giữ hành vi hiện tại) | Banner vàng |
| Có ≥ 1 exam material | Không bắt buộc cứng (có ca chỉ nộp file không phát đề) | Banner vàng “Chưa có đề phát” |
| Có ≥ 1 file bắt buộc | **Có** (create-slim) | Chặn + “Hãy khai báo file bắt buộc trước khi mở.” |
| Có rubric gắn phiên | Không | Banner vàng “Chưa gắn rubric — sẽ cần trước khi chấm” |
| Chưa freeze / đang `scheduled` | Có | — |

CTA:

- **Mở phiên thi** — gọi `POST …/open` (sau Phase 1: freeze + `active`). Có thể đặt trên hub **và** giữ banner trên lobby khi `scheduled`.
- **Vào phòng chờ** — luôn có; trên lobby, nếu vẫn `scheduled` thì banner mở phiên nổi bật.

### 5.5 Land sau create

Màn thành công tạo phiên:

1. Hiện mã phiên (giữ như hiện tại).
2. CTA chính: **Thiết lập phiên** → `/teacher/exam-sessions/{id}`.
3. CTA phụ: **Vào phòng chờ** → `/exam-sessions/{id}`.
4. Không mặc định nhảy thẳng lobby (tránh quên đề / rubric).

---

## 6. Ma trận chỉnh sửa

| Nhóm | `scheduled` | `active` | `collecting` / `completed` |
|---|---|---|---|
| Phòng, giờ | Sửa | Khoá | Khoá |
| Đề phát (materials) | Upload / xoá | Upload / xoá (giữ rule hiện tại) | Xoá khoá khi exam over |
| Rubric gắn phiên | Sửa | Sửa đến grading lock | Theo lock hiện có |
| Deliverable `language` | Sửa | Sửa đến lock | Theo lock |
| Tên / lớp / loại kỳ | Không | Không | Không |
| File bắt buộc (filenames, type, entries) | **Sửa (PUT)** — [create-slim](./2026-10-18-exam-session-create-slim-design.md) | Khoá | Khoá |
| Danh sách thi (session roster) | Xem lớp / materialize / import / thêm / gỡ mọi source — [session-exam-roster-setup](./2026-10-18-session-exam-roster-setup-design.md) | Thêm tay / gỡ `manual` (rule cũ) | Không |
| Roster manual add / remove (lobby) | Theo rule roster hiện tại | Manual, chưa có bài thật | Không |
| Huỷ phiên | Có | Không | Không |
| Mở phiên | Có | — | — |
| Finalize / recollect / confirm-end | — | Finalize | Recollect, confirm-end |

Gate API lấy **status + freeze + grading lock** làm nguồn sự thật; UI chỉ phản ánh, không tự nghĩ rule mới.

---

## 7. Lobby live — thu hẹp nhiệm vụ

Giữ nguyên trách nhiệm vận hành:

- Điểm danh, access request, bảng nộp (waiting-room UI)
- Materials xem / thao tác hạn chế
- Finalize / recollect / confirm-end

Điều chỉnh hành vi:

- Banner **Mở phiên thi** chỉ khi `status === 'scheduled'` (không còn “active nhưng chưa freeze”).
- Không đẩy form sửa phòng/giờ lên lobby; link “Thiết lập” về hub khi còn `scheduled`.
- Khi `collecting` \| `completed`: thêm CTA rõ **Quản lý bài thu** / **Chuẩn bị chấm** để hết đứt mạch sang grading.

---

## 8. Copy & hiển thị status

### 8.1 Nhãn

| Status DB | Nhãn UI |
|---|---|
| `scheduled` | **Sắp diễn ra** |
| `active` | **Đang thi** |
| `collecting` | Đang thu bài |
| `completed` | Đã kết thúc |
| `cancelled` | Đã huỷ |
| `draft` | (không dùng teacher flow; nếu lộ ra filter admin: “Nháp”) |

### 8.2 `getDisplaySessionStatus`

Hiện tại: với `status === 'active'`, hàm suy “Sắp diễn ra / Đang diễn ra / Đã kết thúc” theo đồng hồ — **sai sau Phase 1**.

Mục tiêu:

- Map trực tiếp theo status DB (§8.1).
- Đồng hồ chỉ là **phụ đề** (“Bắt đầu lúc …”, “Còn … phút”), không thay status.
- Xóa nhánh suy diễn “active + now < start ⇒ Sắp diễn ra”.

Cập nhật test tại `apps/web/src/lib/exam-session-display.test.ts`.

### 8.3 Thuật ngữ

| Tránh | Dùng |
|---|---|
| “Chuẩn bị” chung chung trên hub | **Chuẩn bị ca thi** / **Thiết lập phiên** |
| “Chuẩn bị” trên grading | **Chuẩn bị chấm** (giữ `PreparePanel`, chỉ thống nhất copy) |
| “Chốt” cho cả finalize và confirm-end | Giữ copy hiện có: **Chốt bài ngay** vs **Xác nhận kết thúc** |

---

## 9. Hành trình người dùng mục tiêu

```
Danh sách phiên
      │
      ├── Tạo phiên ──► Hub thiết lập (scheduled)
      │                      │
      │              chỉnh phòng/giờ, đề, rubric
      │                      │
      │              ┌───────┴────────┐
      │              ▼                ▼
      │         Mở phiên         Vào phòng chờ
      │         (→ active)       (vẫn scheduled
      │              │            đến khi mở)
      │              ▼
      ├── Phòng chờ ◄── live / thu bài
      │              │
      │              ▼
      └── Hub (read-only) ──► Bài thu / Chuẩn bị chấm
```

Bước ngắn:

1. **Tạo** → land hub Thiết lập.
2. **Thiết lập** đến checklist chấp nhận được → **Mở phiên** (hoặc vào lobby rồi mở).
3. **Live** trên lobby đến thu bài.
4. **Sau thi** → Bài thu / Chuẩn bị chấm từ CTA rõ ràng.

---

## 10. Phase thi công

### Phase 1 — Status thật (nền)

- `create()` → `scheduled`
- `open` → freeze + `active` một transaction
- Migration `active` chưa freeze → `scheduled`
- `getDisplaySessionStatus` + filter list + e2e create/open/cancel/schedule conflict
- Cập nhật comment entity

**Tiêu chí xong:** tạo phiên mới thấy `scheduled`; mở phiên mới thành `active` và có snapshot roster; agent join trước mở vẫn bị từ chối; phiên cũ chưa mở hiển thị “Sắp diễn ra”.

### Phase 2 — Hub Thiết lập

- Trang `/teacher/exam-sessions/[id]`
- Các khối §5.2–5.3; checklist §5.4
- Chuyển dialog sửa lịch từ list vào hub (list giữ shortcut hoặc chỉ link)
- Phòng = catalog `roomId`
- Rubric + (optional) language trên hub
- CTA sang lobby

**Tiêu chí xong:** GV sửa phòng/giờ và upload đề trên hub khi `scheduled`; sau `active` hub khoá lịch; không regression lobby thu bài.

### Phase 3 — Dọn UX & docs

- Land sau create → hub
- CTA Bài thu / Chuẩn bị chấm từ hub + lobby khi `collecting` \| `completed`
- Calendar: hành vi sửa lịch đồng bộ với hub (click thẻ → hub nếu `scheduled`, lobby nếu `active`+)
- Cập nhật [crud-audit](./2026-10-12-crud-audit-design.md) §2.5 trỏ sang spec này; đánh dấu P1.2/P1.4 đã xong

**Tiêu chí xong:** không còn đường “tạo xong chỉ còn lobby” làm mặc định; audit doc không còn bảo thiếu PATCH lịch.

---

## 11. File chính sẽ đụng

| Vùng | File |
|---|---|
| Backend create/open/patch/cancel | `apps/api/src/exam-session/exam-session.service.ts`, `session-roster.service.ts`, `exam-session.controller.ts` |
| Entity / migration | `exam-session.entity.ts`, migration status mới |
| Display / API client | `apps/web/src/lib/exam-session-display.ts`, `lib/api/exam-session.ts`, `hooks/useExamSession.ts` |
| List / create | `apps/web/src/app/teacher/exam-sessions/page.tsx`, `…/new/page.tsx` |
| Hub mới | `apps/web/src/app/teacher/exam-sessions/[id]/page.tsx` (+ components con) |
| Lobby | `apps/web/src/app/(exam-live)/exam-sessions/[id]/page.tsx` |
| E2E | `apps/api/test/session-lifecycle.e2e-spec.ts`, `session-roster-freeze.e2e-spec.ts`, các suite create/conflict |

---

## 12. Rủi ro & giảm thiểu

| Rủi ro | Giảm thiểu |
|---|---|
| E2E / seed giả định create = `active` | Quét assert status sau create; cập nhật fixtures một lần trong Phase 1 |
| Demo runbook / agent docs nói “phiên active ngay” | Cập nhật runbook cùng Phase 1 |
| GV quen mở cửa bằng vào lobby | Giữ banner mở trên lobby; hub không bắt buộc mở tại chỗ |
| Phiên lịch sử `active` chưa freeze bị đổi thành `scheduled` lúc đang gần giờ | Đúng ý (chưa mở thì chưa phải đang thi); thông báo release note ngắn |
| Trùng UI materials (hub + lobby) | Shared component `ExamMaterialsCard`; không nhân đôi API |

---

## 13. Tiêu chí chấp nhận tổng

- Tạo phiên → status `scheduled`, nhãn **Sắp diễn ra**.
- Mở phiên → `active` + roster frozen; nhãn **Đang thi**; agent join được trong khung giờ.
- Trước mở: sửa được phòng (catalog) + giờ + file bắt buộc trên hub; huỷ được; không sửa được lớp / loại kỳ / tên.
- Sau mở: không sửa lịch; không huỷ.
- Hub tồn tại và là đích mặc định sau create.
- Lobby không còn trạng thái “active nhưng chưa freeze”.
- Collection phase và grading không regression.
- crud-audit §2.5 phản ánh đúng API đã có + trỏ spec này cho hub/status.

---

## 14. Quyết định còn mở (không chặn Phase 1)

Các mục sau **không** block làm thật `scheduled`; chốt trước Phase 2 nếu ảnh hưởng UI:

1. Checklist: thiếu đề / thiếu rubric — chỉ cảnh báo hay (sau này) chặn mở?
2. List còn giữ dialog sửa lịch nhanh hay chỉ còn link sang hub?
3. Có cho phép đổi `name` (display) khi `scheduled` không? (Mặc định spec: **không**, tránh lệch báo cáo.)

Mặc định đang áp dụng trong spec: cảnh báo không chặn; list có thể giữ shortcut PATCH; không sửa tên.

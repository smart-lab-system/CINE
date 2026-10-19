# Design: UX danh sách phiên · hub thông tin · Vận hành phiên thi

**Ngày:** 2026-10-18  
**Trạng thái:** implemented (plan `docs/superpowers/plans/2026-10-18-exam-ops-lobby-ux.md`)  
**Trang:**
- `/teacher/exam-sessions` — Quản lý kỳ thi / danh sách
- `/teacher/exam-sessions/[id]` — Thiết lập phiên thi
- `/exam-sessions/[id]` — **Vận hành phiên thi** (đổi tên từ Phòng chờ)

**Liên quan:**
- [exam-waiting-room-ui](./2026-10-08-exam-waiting-room-ui-design.md) — **§6.1–6.3 bị supersede một phần** bởi spec này (cột Trạng thái + bộ badge + search)
- [exam-session-setup-edit-flow](./2026-10-18-exam-session-setup-edit-flow-design.md) — hub; copy CTA lobby
- [exam-folder-config-preview](./2026-10-18-exam-folder-config-preview-design.md) — không đụng

**Quyết định user (2026-10-18):**
1. “Phòng chờ” → **Vận hành phiên thi**
2. Thêm trạng thái **Chưa vào** (chưa từng vào phiên); đây là **mặc định**. Hết giờ mà vẫn Chưa vào → **Vắng mặt**
3. Hàng danh sách phiên: chiều cao cố định — OK
4. Lưới thông tin phiên trên hub + vận hành — OK

---

## 1. Vấn đề

1. **Danh sách phiên** — hàng bảng cao thấp không đều (tên wrap, nút thao tác `flex-wrap`).
2. **Hub Thiết lập** — metadata phiên dồn một–hai dòng (`môn · lớp · loại · HK` / giờ · phòng), khó quét.
3. **“Phòng chờ”** — từ hẹp: màn còn giám sát điểm danh + nộp bài suốt ca, không chỉ chờ mở cửa.
4. **Vận hành** — thiếu khối thông tin phiên (mã, phòng, giờ…) giống hub; GV phải nhảy trang.
5. **Bảng SV** — không tìm theo họ tên / MSSV khi sĩ số lớn.
6. **“Trạng thái phòng”** — backend gộp mọi người `!connected` vào `absent`; UI gọi hết **Vắng mặt**, lẫn người **chưa từng vào** với người **đã vào rồi mất kết nối**. Chưa có trạng thái mặc định “Chưa vào”, cũng chưa có luật hết giờ → Vắng mặt.

---

## 2. Phạm vi

### Trong phạm vi

- Cố định chiều cao hàng bảng danh sách phiên (+ truncate tên, thao tác một hàng).
- Tổ chức lại card thông tin phiên trên hub (lưới label/giá trị).
- Đổi copy **Phòng chờ** → **Vận hành phiên thi** (nút list, hub, tiêu đề trang live, test/assert liên quan).
- Thêm khối thông tin phiên trên trang vận hành (read-only).
- Ô search client-side trên bảng SV (họ tên + MSSV).
- Đổi tiêu đề cột → **Trạng thái**; bộ badge mới (§5); filter/dashboard khớp nghĩa mới.
- Derive trạng thái từ `AttendanceStudentView` + `endTime` / status phiên (ưu tiên **client**; không bắt buộc đổi API attendance).

### Ngoài phạm vi

| Không làm | Vì sao |
|---|---|
| Đổi contract socket / `agent:join` | Chỉ UI + derive |
| Gộp card đề / thư mục bài thi | Spec folder-preview đã chốt |
| Search server-side roster | Dữ liệu đã đủ trên client |
| Đổi cột nộp bài / “Chưa nộp” | Trực giao với cột Trạng thái |
| Tự mở phiên khi `startTime` | Giữ setup-edit |

---

## 3. Quyết định đã chốt

1. Nhãn sản phẩm: **Vận hành phiên thi** (không dùng lại “Phòng chờ” trên teacher UI).
2. Hàng list: chiều cao cố định (`h-14` / 56px), tên `truncate`, thao tác không wrap.
3. Hub + vận hành: lưới **Thông tin phiên** (§4).
4. Cột bảng SV: **Trạng thái** (bỏ “phòng”).
5. Bộ trạng thái + luật chuyển (§5) — `not_joined` mặc định; hết giờ → `absent`.

---

## 4. Thông tin phiên (hub + vận hành)

### 4.1 Hub — `/teacher/exam-sessions/[id]`

Thay khối header dồn dòng bằng card **Thông tin phiên**:

| Nhãn | Nguồn |
|---|---|
| Tên phiên | `name` + badge `getDisplaySessionStatus` |
| Mã phiên | `code` + nút sao chép |
| Môn học | `courseName` |
| Lớp | tên lớp catalog |
| Loại kỳ | TK/GK/CK |
| Học kỳ | `semesterName` |
| Phòng thi | `roomName` (chỉ đọc ở đây; sửa ở card Lịch & phòng) |
| Thời gian | `startTime` → `endTime` |

CTA (Vận hành / Huỷ / Bài thu / Chuẩn bị chấm) **dưới** lưới, không lẫn metadata.

### 4.2 Vận hành — `/exam-sessions/[id]`

Dưới `h1` **Vận hành phiên thi** + badge status: khối meta cùng các trường §4.1 (rút gọn 2 cột hoặc một strip rõ nhãn). Không form sửa lịch — link **Thiết lập phiên** khi còn `scheduled`.

---

## 5. Cột Trạng thái (bảng SV)

### 5.1 Bộ giá trị

| Key | Nhãn UI | Ý nghĩa |
|---|---|---|
| `not_joined` | **Chưa vào** | Có trong roster dự thi, **chưa từng** kết nối agent (`firstSeenAt === null`). **Mặc định.** |
| `present` | **Có mặt** | Đang kết nối (`connected === true`) |
| `disconnected` | **Mất kết nối** | Đã từng vào (`firstSeenAt != null`) nhưng hiện `connected === false` |
| `absent` | **Vắng mặt** | Chưa từng vào **và** đã hết giờ thi (hoặc phiên đã qua pha thi — xem §5.2) |
| `makeup` | **Thi bổ sung** | Nhóm makeup (giữ); nếu `!connected` vẫn hiện Thi bổ sung + có thể ghi chú mất kết nối qua StudentMarks |

Bỏ dùng badge `unknown` / “—” cho dòng roster thường: roster class luôn map được một trong các key trên. Chỉ giữ fallback hiếm nếu dòng chỉ có từ submission lệch.

### 5.2 Luật derive (client)

Nguồn: `AttendanceStudentView` trong `present` | `absent` | `makeup` + `session.endTime` + `session.status`.

```
deadlinePassed =
  now >= endTime
  OR status ∈ { collecting, completed }
```

| Điều kiện | Key |
|---|---|
| Trong `makeup` | `makeup` |
| `connected === true` | `present` |
| `firstSeenAt != null` && `!connected` | `disconnected` |
| `firstSeenAt === null` && !deadlinePassed | `not_joined` |
| `firstSeenAt === null` && deadlinePassed | `absent` |

**Lưu ý backend hiện tại:** `AttendanceService` đẩy mọi `!connected` vào mảng `absent` (kể cả đã từng vào). Derive **không** tin nhãn mảng; phải đọc `firstSeenAt` / `connected` trên từng `AttendanceStudentView` (đã có trên API).

Không bắt buộc tách lại `present`/`absent` trên API trong phase này. Nếu sau này muốn dashboard server-side khớp, có thể bổ sung — ngoài phạm vi tối thiểu.

### 5.3 Filter toolbar

| Filter id | Nhãn | Khớp |
|---|---|---|
| `all` | Tất cả | — |
| `not_joined` | Chưa vào | `roomStatus === not_joined` |
| `present` | Có mặt | `present` **hoặc** `disconnected` (đã từng có mặt trong phòng — giữ hành vi “nhóm có mặt” cũ) |
| `absent` | Vắng mặt | `absent` |
| `makeup` | Thi bổ sung | `makeup` (ẩn khi 0) |
| `not_submitted` | Chưa nộp | giữ § waiting-room 5.1 |

### 5.4 Dashboard

| Ô | Công thức |
|---|---|
| Có mặt | số `present` (+ có thể tách “Mất kết nối” nếu muốn; tối thiểu: đếm `present`) |
| Chưa vào | số `not_joined` |
| Vắng mặt | số `absent` (sau deadline; trước deadline thường 0) |
| Thi bổ sung | số `makeup` (ẩn nếu 0) |
| … nộp bài | giữ nguyên |

Trước giờ kết thúc: ô **Vắng mặt** = 0 (hoặc ẩn); ô **Chưa vào** thay chỗ “vắng sớm” gây hiểu nhầm.

### 5.5 Cột header

`Trạng thái phòng` → **Trạng thái**.

---

## 6. Search bảng SV

- Ô input trên toolbar (cạnh filter), placeholder dạng `Tìm họ tên hoặc MSSV`.
- Lọc client: normalize bỏ khoảng thừa; so khớp substring không phân biệt hoa thường trên `fullName` và `studentMssv`.
- Kết hợp **AND** với filter tab (§5.3).
- Không debounce bắt buộc nếu roster < vài trăm; có thể debounce 150–200ms cho đồng nhất với list phiên.

---

## 7. Danh sách phiên — hàng cố định

File: `apps/web/src/app/teacher/exam-sessions/page.tsx`

- `TableRow`: chiều cao cố định (vd. `h-14`).
- Ô tên: `max-w-*` + `truncate` + `title={name}`.
- Cột thao tác: `flex-nowrap`; ưu tiên icon-only cho Sửa lịch / Huỷ nếu chật.
- Không đổi cột dữ liệu.

---

## 8. Copy “Vận hành phiên thi”

Đổi mọi chỗ teacher-facing:

| Chỗ | Mới |
|---|---|
| Nút list / hub | Vận hành phiên thi (hoặc rút **Vận hành** nếu chỗ hẹp — cùng tooltip đủ tên) |
| `h1` trang live | Vận hành phiên thi |
| Assert test / aria | Khớp |

Không đổi route `/exam-sessions/[id]`.

---

## 9. File dự kiến

| File | Việc |
|---|---|
| `teacher/exam-sessions/page.tsx` | Hàng cố định; nút Vận hành |
| `teacher/exam-sessions/[id]/page.tsx` | Lưới Thông tin phiên; CTA Vận hành |
| `(exam-live)/exam-sessions/[id]/page.tsx` | Tiêu đề; khối meta; truyền endTime/status xuống bảng |
| `LobbyRosterTable.tsx` (+ test) | Cột Trạng thái; search; filter Chưa vào |
| `LobbyDashboard.tsx` (+ test) | Ô Chưa vào / Vắng mặt theo §5.4 |
| `lib/lobby-roster.ts` (+ test) | `RoomStatus` + `not_joined`; `resolveRoomStatus(…, { endTime, status, now? })` |
| Spec waiting-room | Ghi chú supersede §6 (một dòng trỏ spec này) |

---

## 10. Tiêu chí xong

1. List: mọi hàng cùng chiều cao; tên dài không đẩy hàng phình.
2. Hub: metadata đọc được theo lưới nhãn/giá trị.
3. Không còn chữ “Phòng chờ” trên UI teacher liên quan màn này.
4. Trang vận hành hiện đủ thông tin phiên (mã, lớp, phòng, giờ…).
5. Search lọc đúng theo tên / MSSV kết hợp filter.
6. SV chưa từng vào → **Chưa vào**; sau `endTime` (hoặc collecting/completed) cùng điều kiện → **Vắng mặt**; đã vào rồi disconnect → **Mất kết nối**; đang connect → **Có mặt**.
7. Test lobby-roster / LobbyRosterTable / dashboard / list copy xanh.

---

## 11. Lịch sử quyết định

| Ngày | Quyết định |
|---|---|
| 2026-10-18 | Phòng chờ → Vận hành phiên thi |
| 2026-10-18 | Thêm Chưa vào (mặc định); hết giờ → Vắng mặt |
| 2026-10-18 | Hàng list cố định chiều cao |
| 2026-10-18 | Lưới thông tin phiên trên hub + vận hành |
| 2026-10-18 | Cột Trạng thái phòng → Trạng thái |

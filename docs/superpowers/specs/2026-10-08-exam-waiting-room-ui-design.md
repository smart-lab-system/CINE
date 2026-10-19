# Design: UI Phòng chờ phiên thi — dashboard tổng quan + bảng SV gộp

**Ngày:** 2026-10-08
**Trạng thái:** Implementing on `feature/exam-waiting-room-ui`
**Branch:** `feature/exam-waiting-room-ui`
**Trang:** `apps/web/src/app/(exam-live)/exam-sessions/[id]/page.tsx`
**Builds on:** điểm danh live + trạng thái nộp bài hiện có trên lobby; không đổi contract socket/API

> **2026-10-18:** Copy “Phòng chờ”, cột Trạng thái, bộ badge **Chưa vào** / luật hết giờ → Vắng mặt, search SV, và meta phiên trên lobby — xem [exam-ops-lobby-ux](./2026-10-18-exam-ops-lobby-ux-design.md) (supersede một phần §6.1–6.3 và nhãn trang).

---

## 1. Vấn đề

Phòng chờ phiên thi hiện tách thành **hai panel cạnh nhau**:

1. **Điểm danh** (`AttendancePanel`) — ba nhóm Có mặt / Chưa vào / Thi bù, badge sĩ số, nút Chốt sĩ số, cột Ghi chú tự sinh.
2. **Trạng thái nộp bài** (card + `SubmissionStatusTable`) — ma trận file bắt buộc theo từng SV, dòng tổng `đã nộp đủ / tổng`.

Giảng viên (và máy chiếu) phải đối chiếu cùng một MSSV ở hai chỗ. Counter điểm danh và counter nộp bài nằm ở hai header khác nhau; không có một vùng “nhìn một phát biết phòng đang thế nào”.

Dữ liệu để gộp **đã có sẵn ở client** — `buildSubmissionRows(attendance, submissions)` + nhóm `present` / `absent` / `makeup` / cờ `connected`. Không cần API mới.

---

## 2. Phạm vi

### Trong phạm vi

- Dashboard tổng quan (các ô số) phía trên vùng danh sách
- Một bảng SV thay cho layout `lg:grid-cols-2` hai panel
- Gộp thông tin điểm danh + nộp bài trên cùng một dòng
- Filter / tab lọc bảng theo trạng thái phòng và “chưa nộp”
- Di chuyển nút **Xác nhận sĩ số** (và trạng thái đã xác nhận) lên toolbar bảng hoặc cạnh dashboard
- Giữ ghi chú **tự sinh** hiện có (logic `StudentMarks`)
- Cập nhật test lobby cho layout mới

### Ngoài phạm vi

| Không làm | Vì sao |
|---|---|
| Ghi chú tay theo SV (API/DB) | User chốt phương án A: chỉ giữ ghi chú tự sinh |
| Đổi contract socket (`teacher:subscribe`, `lobby:*`) | Chỉ redesign layout; merge live submission vẫn như hiện tại |
| Đổi API attendance / submissions | Dữ liệu đã đủ |
| Chấm điểm / điểm số trên lobby | Đã có quy ước: điểm chỉ thuộc trang post-hoc |
| Đổi AccessRequestPanel, ExamMaterialsCard, CollectionPhaseActions, Finalize | Giữ hành vi; chỉ có thể chỉnh khoảng cách layout nếu cần |
| Animate cập nhật hàng khi socket đẩy event | Spec lobby cũ: không stagger/fade trên update; chỉ pulse “live” nếu còn |

---

## 3. Quyết định đã chốt (chat 2026-10-08)

1. **Cột Ghi chú:** chỉ giữ / tái sử dụng ghi chú tự sinh (vào muộn + phút, mất kết nối, mới vào / kết nối lại sau chốt; lớp gốc khi thi bù). Không ô ghi tay.
2. **Ô «Chưa nộp» trên dashboard:** đếm trên **cả roster** trong bảng gộp (present + absent + makeup, và mọi dòng `buildSubmissionRows` tạo ra), **không** chỉ người có mặt. Sinh viên vắng mặt và chưa có file vẫn tính là “chưa nộp”.

---

## 4. Layout mới

Thứ tự từ trên xuống (một cột, `max-w-7xl` như hiện tại):

```
Header phiên (tên, badge trạng thái, Finalize)
CollectionPhaseActions          ← giữ nguyên khi phase phù hợp
Alerts pha / mở phiên / late-after-confirm
AccessRequestPanel              ← giữ nguyên
ExamMaterialsCard               ← giữ nguyên
Dashboard tổng quan             ← MỚI
Toolbar bảng (filter + Xác nhận sĩ số)
Bảng SV gộp                     ← thay 2 panel cũ
```

Không còn `lg:grid-cols-2` cho điểm danh | nộp bài.

### 4.1 Ràng buộc projector / a11y (giữ)

- Mỗi trạng thái nộp bài có **chữ + ký hiệu**, không chỉ màu (`STATE_PRESENTATION` hiện tại).
- Vùng bảng scroll được bằng bàn phím: `role="region"`, `tabIndex={0}`, `aria-label` rõ.
- Sticky header cột trong scrollport của bảng (cùng pattern `SubmissionStatusTable`).
- Không animate hàng khi dữ liệu live đổi.

---

## 5. Dashboard tổng quan

Các ô số (metric cards / badge lớn — chi tiết visual khi implement, không bắt buộc card nếu design system không cần). Mỗi ô chỉ là **số + nhãn**, không danh sách.

| Ô (nhãn UI) | Nguồn / công thức |
|---|---|
| Sĩ số lớp | `attendance.rosterSize` |
| Có mặt | `attendance.present.length` |
| Vắng mặt | `attendance.absent.length` |
| Thi bổ sung | `attendance.makeup.length` — **ẩn ô nếu 0** |
| Đã nộp | `countFullySubmitted(rows, deliverables)` |
| Chưa nộp | số dòng trong `rows` mà **chưa** đủ mọi deliverable ở trạng thái `collected`. Mẫu số = toàn bộ `rows` (cả roster). Xem §5.1 |
| File lỗi | số SV có ≥ 1 deliverable `invalid` |
| Xác nhận sĩ số | nếu `confirmedAt`: hiện `confirmedCount` + giờ xác nhận; nếu chưa: nhãn “Chưa xác nhận” (không bắt buộc ô riêng nếu đã gắn vào nút Xác nhận sĩ số) |

### 5.1 Công thức «Chưa nộp»

Cho mỗi SV trong `rows` (đã merge live submissions như page hiện tại):

- Nếu mọi `requiredDeliverable` có `state === 'collected'` → **đã nộp**.
- Ngược lại → **chưa nộp** (gồm: chưa có file, nộp thiếu, invalid, absent-marked, hoặc vắng mặt).

```
chưaNộp = rows.length - fullySubmitted
```

Không trừ `absent` khỏi mẫu số. Ô dashboard và filter bảng «Chưa nộp» dùng **cùng một định nghĩa**.

### 5.2 Cập nhật live

Số trên dashboard đọc từ cùng `rows` / `attendance` mà bảng dùng — khi socket hoặc refetch đổi dữ liệu, số đổi theo, không snapshot riêng. `countedAt` (nếu còn dùng cho CollectionPhaseActions) giữ hành vi hiện tại.

### 5.3 Phiên chưa gắn lớp (`classId === null`)

Giữ cảnh báo hiện có của AttendancePanel (không xác nhận được sĩ số; vẫn xem được ai đang kết nối). Dashboard vẫn hiện các số có thể tính được từ `present` / `makeup` / submissions; sĩ số lớp có thể 0 hoặc không áp dụng — copy rõ ràng, không giả số giả.

---

## 6. Bảng SV gộp

Một danh sách phẳng, **một dòng = một MSSV**, sắp xếp mặc định theo MSSV (như `buildSubmissionRows`).

### 6.1 Cột

| Cột | Nội dung |
|---|---|
| Họ tên | `fullName` / `name` |
| MSSV | monospace |
| Trạng thái phòng | Badge: **Có mặt** · **Vắng mặt** · **Thi bổ sung** · **Mất kết nối** (có `firstSeenAt` nhưng `connected === false`) |
| Ghi chú | Reuse `StudentMarks`: vào muộn lúc … (trễ N phút); Kết nối lại sau khi xác nhận sĩ số; Mới vào sau khi xác nhận sĩ số; Mất kết nối lúc …. Với thi bổ sung: thêm lớp gốc (`homeClassName` / `makeupFromClass`). Không có mark → `—` |
| Nộp bài | Ma trận deliverable như `SubmissionStatusTable` hiện tại (một cột / file bắt buộc: ✓ Đã nộp / ✕ Không hợp lệ / ○ Vắng thi / — Chưa nộp; giờ nộp; archive check khi có) |
| Xem bài nộp | Nút + dialog như hiện tại |

Nếu số deliverable lớn làm bảng rộng: scroll ngang trong cùng scrollport với sticky cột SV (họ tên + MSSV) nếu làm được không phá a11y; tối thiểu giữ scroll ngang như bảng cũ.

### 6.2 Nguồn trạng thái phòng

Map từ attendance (không suy từ submission):

| Điều kiện | Badge |
|---|---|
| Trong `present` và `connected` | Có mặt |
| Trong `present` và không `connected` (đã từng vào) | Mất kết nối |
| Trong `absent` | Vắng mặt |
| Trong `makeup` | Thi bổ sung (và mất kết nối nếu `!connected`) |

SV chỉ xuất hiện từ submissions (không có trong ba nhóm) — hiếm; vẫn hiện dòng nộp bài, trạng thái phòng `—` hoặc suy từ dữ liệu có sẵn; không bịa “Có mặt”.

### 6.3 Toolbar

- **Filter (một lựa chọn):** Tất cả | Có mặt | Vắng mặt | Thi bổ sung | Chưa nộp  
  - «Thi bổ sung» ẩn hoặc disabled khi `makeup.length === 0`.  
  - «Chưa nộp» dùng định nghĩa §5.1.
- **Xác nhận sĩ số / Xác nhận lại sĩ số:** cùng enable/disable như AttendancePanel hiện tại (`canConfirm`, `noClass`, `confirming`); hiện `confirmedAt` / `confirmedCount` cạnh nút.
- Cảnh báo `discrepancy` (lệch sĩ số–bài nộp): giữ nguyên nội dung, đặt **trên** bảng (dưới dashboard hoặc dưới toolbar), không chôn trong scroll list.

### 6.4 Quan hệ với `SubmissionStatusTable`

Trang chi tiết bài thu post-hoc vẫn dùng `SubmissionStatusTable` (có `focusStudentMssv`, `gradingByMssv`).

Hai hướng chấp nhận được khi thi công (chọn cái ít đụng hơn):

1. Component lobby mới (ví dụ `LobbyRosterTable`) compose lại cell nộp bài / dialog; hoặc
2. Mở rộng `SubmissionStatusTable` bằng props tùy chọn (cột trạng thái phòng, ghi chú, filter) — **mặc định off** để trang post-hoc không đổi hành vi.

Không được phá consumer post-hoc.

---

## 7. Thành phần giữ nguyên (chỉ có thể đổi chỗ)

- Subscribe socket + recovery UNAUTHORIZED
- `AccessRequestPanel` + toast
- `ExamMaterialsCard` + `canEdit` (chặn khi `completed` / `collecting`)
- `CollectionPhaseActions`, `FinalizeSessionButton`
- Alert `needsOpening` / phase / `lateAfterConfirm`
- Confirm attendance mutation + discrepancy notice

---

## 8. File dự kiến khi thi công (sau khi spec duyệt)

| File | Việc |
|---|---|
| `page.tsx` | Bỏ grid 2 cột; gắn dashboard + bảng gộp |
| `_components/LobbyDashboard.tsx` (tên gần đúng) | Ô số §5 |
| `_components/LobbyRosterTable.tsx` hoặc mở rộng `SubmissionStatusTable` | Bảng §6 |
| `AttendancePanel.tsx` | Có thể thu hẹp / xóa khỏi lobby nếu logic đã chuyển; giữ export helper (`StudentMarks`, `lateMinutes`) nếu vẫn dùng |
| `page.test.tsx` (+ component tests) | Assert dashboard metrics, filter, một bảng thay hai panel; không regress xác nhận sĩ số / mở phiên |

Không migration, không đổi OpenAPI trừ khi phát hiện thiếu field (không kỳ vọng).

---

## 9. Tiêu chí chấp nhận

1. Mở phòng chờ: thấy dashboard với sĩ số, có mặt, vắng mặt, đã nộp, chưa nộp (roster đầy đủ), không còn hai panel song song.
2. Một SV có mặt + vào muộn + chưa nộp hiện **một dòng**: badge Có mặt, ghi chú vào muộn, ô nộp bài «Chưa nộp».
3. Filter «Chưa nộp» gồm cả SV trong nhóm Vắng mặt.
4. Xác nhận sĩ số vẫn hoạt động; discrepancy vẫn hiện khi lệch.
5. Socket `lobby:submission_status` cập nhật ô nộp bài và số dashboard mà không reload trang.
6. Trang chi tiết bài thu (post-hoc) không đổi hành vi bảng cũ.
7. Không thêm API ghi chú tay.

---

## 10. Lịch sử quyết định

| Ngày | Quyết định |
|---|---|
| 2026-10-08 | Gộp 2 table → 1; thêm dashboard tổng quan |
| 2026-10-08 | Ghi chú = chỉ tự sinh (A) |
| 2026-10-08 | Chưa nộp đếm trên cả roster (B) |
| 2026-10-08 | Nhãn dashboard/UI: Vắng mặt, Thi bổ sung, Đã nộp, Chưa nộp, Xác nhận sĩ số |

# Extension vi phạm trên Vận hành phiên thi — thiết kế

**Ngày:** 2026-11-28 · **Trạng thái:** implementing  

**Ứng dụng:** `apps/api` + `apps/web` (`(exam-live)/exam-sessions/[id]`)  
**Builds on:** [violations UI 2B](./2026-11-18-ide-utilities-violations-ui-design.md); [JPlag exam flow](./2026-11-15-ide-extension-jplag-exam-flow-design.md); [VSIX sync](./2026-11-02-ide-extension-vsix-storage-sync-design.md)  
**Implementation plan:** [`docs/superpowers/plans/2026-11-28-session-ops-violations-panel.md`](../plans/2026-11-28-session-ops-violations-panel.md)

---

## 0. Mục tiêu

Giảng viên trên màn **Vận hành phiên thi** xem danh sách extension vi phạm **của phiên đó** (rule 2B), mở chi tiết SV, và mở VSIX / mã chuẩn hóa / JPlag **không** phải thiết lập tay sau khi Hub đã đồng bộ scan.

---

## 1. Quyết định

| # | Quyết định | Chi tiết |
|---|---|---|
| 1 | Định nghĩa | 2B - blocked + chưa duyệt global; filter `examSessionId` |
| 2 | Cột list | Tên tiện ích · Nhà phát hành · Phát hành gần nhất · JPlag text |
| 3 | Chi tiết | Meta + bảng MSSV / Họ tên / Số máy / Thời điểm + 3 nút |
| 4 | Auto pipeline | Extract ready → bind/re-enqueue `vs_model`; processVsModel defer khi chưa sẵn catalog/extract |

---

## 2. API

`GET /ide-extensions/violations?examSessionId=` — giữ 2B; khi có session: chỉ incident phiên đó + `publishedAt`, `primaryVersionId`, `extractStatus`, `jplagText` / `jplagStatus` / `jplagRunId`.

---

## 3. UI

`SessionViolationsPanel` dưới `LobbyDashboard` trên trang live. Deep-link browse `?view=normalized`.

---

## 4. Ngoài phạm vi

- Server-side download Marketplace thay Hub.
- Nút Thêm vào catalog trên màn vận hành.

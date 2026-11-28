# Hub auto theo dõi extension trong phiên — thiết kế

**Ngày:** 2026-11-28 · **Trạng thái:** implemented  

**Ứng dụng:** `apps/agent` (Teacher Hub)  
**Builds on:** [`2026-10-18-lab-management-ide-extensions-design.md`](./2026-10-18-lab-management-ide-extensions-design.md), [`2026-11-28-hub-prompt-identify-exam-join-design.md`](./2026-11-28-hub-prompt-identify-exam-join-design.md)  
**Plan:** [`../plans/2026-11-28-hub-exam-extension-auto-monitor.md`](../plans/2026-11-28-hub-exam-extension-auto-monitor.md)

---

## 0. Vì sao

Spec Oct-18 giữ nút thủ công. GV cần **opt-in** một công tắc để tự quét / đối chiếu / sync trong giờ thi mà không bấm từng bước.

---

## 1. Quyết định

| # | Quyết định |
|---|---|
| 1 | Một công tắc «Theo dõi extension trong phiên» - chỉ khi đã gắn kỳ thi |
| 2 | Pipeline: refresh → scan → compare → sync |
| 3 | VSIX chỉ ở lượt finalize (+ nút tay) |
| 4 | Định kỳ 10 phút khi `active` |
| 5 | Poll status mỗi 60s (`GET /exam-sessions/:id`) |
| 6 | Mặc định tắt; `leaveSession` / đổi kỳ / stop Hub → tắt monitor |
| 7 | Không auto PROMPT_IDENTIFY / đề xuất phòng / activity log |

---

## 2. Ba mốc

1. **Baseline** - lần đầu `status === active` (và có node) sau khi bật → 1 pipeline  
2. **Periodic** - mỗi 10 phút khi còn `active`  
3. **Finalize** - chuyển `collecting` \| `completed` → 1 pipeline + tải VSIX blocked → dừng timer  

Bật khi đã `collecting`/`completed` → chỉ finalize một lần.

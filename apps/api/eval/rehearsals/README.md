# Lịch sử diễn tập chấm điểm thật

Mỗi lượt chạy thật (model + sandbox thật, trên bản deploy) một kịch bản có kỳ vọng dựng sẵn cho
từng bài, rồi chấm lượt đó theo kỳ vọng. Một bản sửa chỉ được coi là có tác dụng khi lượt chạy
SAU nó tốt hơn lượt trước trên bảng này. Chi tiết từng bài: `<lượt>/run.json`.

Chạy: `pnpm --filter api rehearsal -- --scenario <id> --deploy <sha> --note "<vì sao chạy>"`
(cần `REHEARSAL_BASE_URL`, `REHEARSAL_EMAIL`, `REHEARSAL_PASSWORD`, `REHEARSAL_CLASS_ID`).
Bảng này sinh lại từ mọi `run.json` sau mỗi lượt — đừng sửa tay.

| Lượt | Thời điểm (UTC) | Bản chạy | Model | Kịch bản | Tự duyệt SAI | Điểm đúng | Lỗi bắt được | Lỗi thừa | Quyết định đúng | Tự duyệt (thực/kỳ vọng) | Cờ oan | Cờ bỏ lỡ | Lăng kính hỏng | Chấm (s) | Ghi chú |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 20260928T033631Z-a668d84 | 2026-09-28 03:36 | a668d84 | glm-5.3-flash | ngan-xep-v1 | 0 | 1/1 | 4/4 | 0 | 1/1 | 0/0 | 0 | 0 | 1 | 79 | r1: lượt thật đầu tiên của bước 6, 1 bài (ghi bù từ log) |
| 20260928T063427Z-b95bbbb | 2026-09-28 06:34 | b95bbbb | glm-5.3-flash | ngan-xep-v1 | 0 | 4/5 | 7/8 | 0 | 3/5 | 1/3 | 3 | 0 | 0 | 94.2 | r2: tải 5 bài song song, sau PR #57 (ghi bù từ log) |
| 20260928T070841Z-566cf45 | 2026-09-28 07:08 | 566cf45 | glm-5.3-flash | ngan-xep-v1 | 1 | 3/5 | 4/8 | 0 | 3/5 | 3/3 | 0 | 1 | 0 | 89.4 | r3: sau PR #58 (sửa cờ oan lăng kính cấp bài) |

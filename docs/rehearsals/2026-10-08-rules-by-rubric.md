# Rehearsal gate — rules-by-rubric (2026-10-08)

## Status

**Chờ chạy trên môi trường diễn tập (Railway)** — Plan A Task A11 §7.7 / D12.

Backend Plan A (A0–A10) đã xanh trên e2e rules-related (16 suites / 88 tests) và đã regenerate OpenAPI client (`/rubric-errors*`, `/rules/{id}/split`; bỏ `/rules/preview` và `/rules/{id}/price`).

## Cách chạy (cần tài khoản + REHEARSAL_BASE_URL)

```powershell
pnpm --filter api rehearsal
```

Ghi kết quả vào bảng so với lần diễn tập trước: score accuracy, error recall/precision, auto/review, false/missed flags, lens failures, wall time. Kỳ vọng: **không đổi** hành vi chấm (D12).

## Ghi chú

- Không coi e2e xanh là đủ để mở Plan B web — cần dòng này có số liệu thật.
- `apps/web` có thể type-check đỏ sau OpenAPI regen; Plan B Task B1 cắt lại UI.

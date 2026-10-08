# Rehearsal gate — rules-by-rubric (2026-10-08)

## Status

**Blocked local (2026-10-08):** không chạy được rehearsal thật trên máy này.

| Điều kiện | Local hiện tại |
|---|---|
| API `:4000` + Postgres/Redis/MinIO | OK |
| `GRADING_TIER*_API_KEY` / model | **commented / trống** trong `apps/api/.env` |
| Sandbox worker process/container | **không chạy** |
| So với lần trước | Có baseline `apps/api/eval/rehearsals/README.md` (2026-09-28) |

Backend Plan A (A0–A11 code + OpenAPI) đã commit. E2e rules-related: 16 suites / 88 tests xanh.

**Plan B web** bắt đầu vì điều kiện mở plan B là *OpenAPI regenerated and committed* (A11 step 1) — đã có ở `da23e3d`. Rehearsal D12 vẫn cần chạy khi có key + sandbox (local hoặc Railway); ghi số vào bảng dưới khi có.

## Cách chạy khi đủ điều kiện

```powershell
$env:REHEARSAL_BASE_URL = "http://localhost:4000"   # hoặc URL Railway
$env:REHEARSAL_EMAIL = "..."
$env:REHEARSAL_PASSWORD = "..."
$env:REHEARSAL_CLASS_ID = "..."
pnpm --filter api rehearsal -- --scenario ngan-xep-v1 --deploy <sha|local> --note "rules-by-rubric A11 gate"
```

So với lượt `20260928T094907Z-f83a05c` (điểm 5/5, lỗi 8/8). Kỳ vọng D12: không đổi hành vi chấm.

## Kết quả lượt này

| Lượt | Bản chạy | Điểm đúng | Lỗi bắt | Quyết định | Ghi chú |
|---|---|---|---|---|---|
| — | — | — | — | — | chưa chạy — thiếu model key + sandbox worker |

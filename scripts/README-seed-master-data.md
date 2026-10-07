# Seed master data

Nguồn JSON (commit trong git):

- `danh_sach_giang_vien.json` → tài khoản `teacher`
- `danh_sach_mon_hoc.json` → `course`
- `danh_sach_phong_may.json` → `room` (+ sinh `computer`)

Chạy (từ `apps/api`, `.env` trỏ Postgres local):

```bash
pnpm seed:master-data
pnpm seed:master-data -- --fresh-catalog --reset-passwords
pnpm seed:master-data -- --seed 20261007
```

| Vai trò | Email | Mật khẩu |
|---------|--------|----------|
| Admin | `bao@hui.edu.vn`, `phat@hui.edu.vn` | `Admin@123` |
| Giảng viên | `href` trong JSON | `Teacher@123` |

Spec: `docs/superpowers/specs/2026-10-07-seed-master-data-design.md`  
Sau `scripts/reset-dev-data.sql`, chạy lại `pnpm seed:master-data`.

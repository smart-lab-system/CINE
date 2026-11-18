# Plan — Import dsa_vi_03

**Spec:** `docs/superpowers/specs/2026-11-18-dsa-vi03-import-design.md`

## Tasks

- [x] Parser rubric.txt + load index.csv
- [x] `ImportDsaVi03Service` + `POST /exam-bank/import/dsa-vi-03`
- [x] CLI `pnpm import:dsa-vi-03`
- [x] Unit tests parser (01, 03, 18)

## Chạy

```bash
cd apps/api
pnpm import:dsa-vi-03 -- --teacher-email=gv@example.com --course-code=XXXX --dry-run
pnpm import:dsa-vi-03 -- --teacher-email=gv@example.com --course-code=XXXX
```

Mỗi câu → 1 đề TK + 1 rubric QS. GV phải được phân công dạy môn đó.

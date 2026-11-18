# Import dsa_vi_03 → kho đề + rubric QS

**Ngày:** 2026-11-18  
**Trạng thái:** implemented  
**Plan:** `docs/superpowers/plans/2026-11-18-dsa-vi03-import.md`

---

## 1. Phạm vi

Mỗi thư mục `dsa_vi_03/NN_*`:

- `question.txt` → nội dung câu kho đề  
- `rubric.txt` → rubric QS (`Solution N` → approach, bước + `[N mark(s)]`)  
- **Không** import `solution.txt` / `sub/`

## 2. Quyết định

| # | Quyết định |
|---|---|
| D1 | Rubric name = `dsa:{folder}` (vd `dsa:01_largest_product`); mỗi lần import tạo phiên bản QS mới. |
| D2 | Điểm câu = **max** tổng mark các hướng. Mỗi đề 1 câu → tổng điểm đề = điểm câu đó. |
| D3 | **Mỗi câu → 1 đề kho + 1 rubric QS** (không gộp 25 câu một đề). Mô tả chứa `[import:dsa_vi_03] dsa:{folder}`. Import lại (mặc định replace): xóa đề marker cũ chưa gắn phiên rồi tạo mới. |
| D4 | Ngôn ngữ mặc định `java`; loại đề mặc định **`TK` (thường kỳ)**. |
| D5 | Quyền: GV phải dạy môn (`assertTeachesCourse`). |

## 3. API / CLI

- `POST /exam-bank/import/dsa-vi-03` `{ courseId, examType?, language?, limit?, replace?, dryRun? }`
- CLI: `pnpm --filter api import:dsa-vi-03 -- --teacher-email=… --course-code=…`

## 4. Parser

`apps/api/src/exam-bank/dsa-import/parse-dsa-rubric.ts` — hỗ trợ `Solution N:` (tên trống → Hướng N), bước có/không mark (không mark → 1 điểm), bullet nối vào bước trước.

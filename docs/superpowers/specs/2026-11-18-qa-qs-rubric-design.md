# QA vs QS Rubric — thiết kế

**Ngày:** 2026-11-18  
**Trạng thái:** implemented (lớp additive + thư viện QS; QA giữ nguyên; pipeline AI chọn hướng chưa gắn UC33)  
**Liên quan:** plan multi-approach rubric; dataset `dsa_vi_03`; multi-problem `exam_problem.rubric_id`

---

## 1. Vấn đề

CINE hôm nay chỉ có một hình rubric: tiêu chí phẳng + trừ điểm, tái sử dụng giữa câu (rehearsal `ngan-xep-*`). Dataset DSA (`dsa_vi_03`) là **checklist theo câu**, mỗi câu nhiều hướng (Solution 1…N). Nếu dán mọi hướng thành tiêu chí cộng dồn, bài đúng một hướng bị trừ oan ở hướng khác.

## 2. Quyết định

| # | Quyết định |
|---|---|
| D1 | Hai kiểu: **QA** (Question-Agnostic) và **QS** (Question-Specific). |
| D2 | Rubric không khai / `kind = qa` → hành vi chấm **y hệt** trước khi có QS. |
| D3 | DSA / `dsa_vi_03` dùng **QS**: một rubric gắn một câu (`exam_problem.rubric_id`). |
| D4 | QS: điểm = chấm checklist của **một hướng thắng** (max-of-approaches); hướng khác không trừ/không cộng. |
| D5 | UC33 / lifecycle / finalize / export **không đổi hợp đồng**. QS chỉ thêm resolve approach trước khi tính điểm. |
| D6 | Schema **additive**: cột `rubric.kind`, bảng `rubric_approach`; tiêu chí QS gắn `approach_id`. |

## 3. Taxonomy

| | QA | QS |
|---|---|---|
| Phạm vi | Nhiều câu / dạng bài | Một câu |
| Cấu trúc | Criteria + rules phẳng | Approaches → checklist bước |
| Điểm | `max − Σ trừ` | Chọn hướng → điểm checklist hướng đó (quy về điểm câu) |
| Ví dụ | `ngan-xep-v1` | `01_largest_product` trong `dsa_vi_03` |

## 4. Use case

| UC | Vai trò |
|---|---|
| UC21 | Quản lý rubric QA (giữ) |
| **UC21b** | Quản lý QS: soạn approach + bước; (sau) import `rubric.txt` |
| UC33 | Bắt đầu chấm — không đổi; QS resolve approach trong pipeline |
| UC35 | Rà soát — có thể hiện “Hướng đã chọn” |

## 5. Mô hình dữ liệu (additive)

```
rubric.kind ∈ {'qa','qs'}  DEFAULT 'qa'

rubric_approach (rubric_id, key, name, sort_order)
rubric_criterion.approach_id NULL  -- QA: luôn NULL; QS: FK approach
```

- `kind = qa`: không có dòng approach; mọi `approach_id` NULL.
- `kind = qs`: ≥ 1 approach; mọi tiêu chí thuộc đúng một approach; tổng điểm hiển thị = **max** tổng điểm các hướng (không cộng mọi hướng).

## 6. Tính điểm QS

1. AI / heuristic chọn `approachKey` thắng (hoặc điểm tạm từng hướng rồi lấy max).
2. Chỉ tiêu chí (và luật trỏ tới) của hướng đó vào primitive tính điểm.
3. `score = earned / approachMax × problemPoints` (hundredths), nếu điểm câu ≠ tổng mark hướng.

Thư viện thuần: `apps/api/src/grading/qs/`.

## 7. Regression

- Rubric cũ sau migration: `kind = qa`, không approach → cùng điểm như trước.
- Rehearsal `ngan-xep-v1` không đổi kỳ vọng.

## 8. Ngoài phạm vi đợt này

- UI đầy đủ UC21b trên web (có thể API + pilot trước).
- Import tự động toàn bộ 25 câu `dsa_vi_03`.
- Sandbox Java.

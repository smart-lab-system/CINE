# Đường cơ sở DB trước P1 (cham-diem-duyet-nhanh)

Task 1 của plan `2026-10-21-cham-diem-duyet-nhanh-p1`. Không sửa code, không ghi DB. Số đếm này là đường cơ sở cho Task 11.

- Commit gốc của nhánh: `bdde467` (`bdde4675b698fc6c23b0c4331403d1c7ce297110`)
- Thời điểm chạy (UTC): `2026-10-21T05:24:03Z`
- Cơ sở dữ liệu: Supabase thật, schema `examcollect` (chỉ ghi nhãn, không ghi host hay thông tin đăng nhập)
- Chạy chỉ đọc: toàn bộ script nằm trong `BEGIN TRANSACTION READ ONLY; ... ROLLBACK;`. Bảng 0 bên dưới in `transaction_read_only = on` ngay trong giao dịch.
- Phạm vi: TOÀN BỘ dòng `examcollect.grading_result` (không lọc theo một phiên). Chú thích "phiên đã chọn" trong brief được hiểu là toàn DB. Bảng 5 tách thêm theo phiên thi.

## Quy ước phân nhóm lỗi

"Lượt tính mới nhất" của một kết quả là dòng `score_computation` có `(created_at, id)` lớn nhất theo `grading_result_id`. Danh sách lỗi lấy từ `breakdown -> 'errors'`.

Ba nhóm được đếm ĐỘC LẬP, nên một bài có thể thuộc cả `has_machine` lẫn `has_llm`:

- `no_error`: có lượt tính và mảng `errors` rỗng.
- `has_machine`: có ít nhất một lỗi mà `source` KHÔNG phải `llm_only` và KHÔNG phải `llm_with_tools` (tức `deterministic`; `source` rỗng cũng bị xếp vào đây).
- `has_llm`: có ít nhất một lỗi mà `source` là `llm_only` hoặc `llm_with_tools`.

Hai cột phụ để tổng khớp: `no_computation` (chưa có dòng `score_computation` nào, không thể nói là có lỗi hay không) và `has_error_any` (có ít nhất một lỗi). Luôn có:

- `no_computation + no_error + has_error_any = total`
- `has_machine + has_llm - has_both = has_error_any`

Mảng `errors` được đọc nguyên trạng, không lọc theo trường `counted` (`counted`, `excluded`, `unpriced`, `refuted`): một lỗi đã bị `refuted` hay `excluded` vẫn làm bài rời nhóm `no_error`.

## Kết quả

### 0. Bằng chứng chỉ đọc

| transaction_read_only | db_name | run_at_utc |
| --- | --- | --- |
| on | postgres | 2026-10-21T05:24:03Z |

### 1. Số dòng grading_result theo mọi trạng thái

| status | n |
| --- | --- |
| ai_grading | 0 |
| ai_graded | 0 |
| auto_approved | 54 |
| audit_pending | 6 |
| flagged_for_review | 201 |
| teacher_reviewed | 4 |
| finalized | 0 |
| exported | 0 |

### 2. Đối chiếu: tổng các trạng thái bằng tổng dòng

| total_rows | sum_of_status_counts | reconciles |
| --- | --- | --- |
| 265 | 265 | t |

Đối chiếu: 0 + 0 + 54 + 6 + 201 + 4 + 0 + 0 = 265 = số dòng `grading_result`. Khớp.

### 3. Trạng thái x nhóm lỗi (lượt tính mới nhất)

Ba trạng thái được hỏi là `auto_approved`, `audit_pending`, `flagged_for_review`. Thêm `teacher_reviewed` vì có 4 dòng; dòng TOTAL là tổng mọi trạng thái.

| status | total | no_computation | no_error | has_error_any | has_machine | has_llm | has_both |
| --- | --- | --- | --- | --- | --- | --- | --- |
| auto_approved | 54 | 0 | 19 | 35 | 35 | 1 | 1 |
| audit_pending | 6 | 0 | 2 | 4 | 4 | 0 | 0 |
| flagged_for_review | 201 | 54 | 33 | 114 | 46 | 106 | 38 |
| teacher_reviewed | 4 | 3 | 0 | 1 | 1 | 1 | 1 |
| TOTAL | 265 | 57 | 54 | 154 | 86 | 108 | 40 |

Đối chiếu từng dòng (đã kiểm): `no_computation + no_error + has_error_any = total` và `has_machine + has_llm - has_both = has_error_any`.

- TOTAL: 57 + 54 + 154 = 265 và 86 + 108 - 40 = 154.
- `auto_approved`: 0 + 19 + 35 = 54 và 35 + 1 - 1 = 35.
- `audit_pending`: 0 + 2 + 4 = 6 và 4 + 0 - 0 = 4.
- `flagged_for_review`: 54 + 33 + 114 = 201 và 46 + 106 - 38 = 114.
- `teacher_reviewed`: 3 + 0 + 1 = 4 và 1 + 1 - 1 = 1.

### 4. Giá trị `source` thực có trong lỗi của lượt tính mới nhất

Chỉ có đúng ba giá trị đã biết, không có `source` rỗng hay lạ, nên luật phân nhóm ở trên không bỏ sót trường hợp nào.

| source | n_errors |
| --- | --- |
| deterministic | 127 |
| llm_only | 170 |
| llm_with_tools | 1 |

### 5. Tách theo phiên thi

61 phiên có bài chấm, sắp theo tổng bài giảm dần. `session_id8` là 8 ký tự đầu của `exam_session.id`. `other_status` là mọi trạng thái ngoài ba trạng thái được hỏi.

| session_id8 | session_name | total | auto_approved | audit_pending | flagged_for_review | other_status | no_computation | no_error |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 4c60be23 | TEST dien tap ngan-xep-v2 - xoa sau 1792340306414 | 15 | 3 | 1 | 11 | 0 | 0 | 4 |
| f58816ef | TEST dien tap ngan-xep-v2 - xoa sau 1792339792210 | 15 | 3 | 0 | 12 | 0 | 0 | 6 |
| 034ccf50 | TEST dien tap ngan-xep-v1 - xoa sau 1791947711968 | 5 | 2 | 0 | 3 | 0 | 0 | 1 |
| 0a2bddaf | TEST dien tap ngan-xep-v1 - xoa sau 1790581857775 | 5 | 2 | 0 | 3 | 0 | 0 | 1 |
| 0e137eb8 | TEST dien tap ngan-xep-v1 - xoa sau 1792548405371 | 5 | 2 | 0 | 3 | 0 | 0 | 1 |
| 18287a60 | TEST dien tap ngan-xep-v1 - xoa sau 1792227962050 | 5 | 0 | 0 | 5 | 0 | 5 | 0 |
| 1b709df7 | TEST dien tap ngan-xep-v1 - xoa sau 1791948861641 | 5 | 1 | 1 | 3 | 0 | 0 | 1 |
| 207fc12b | TEST dien tap ngan-xep-v1 - xoa sau 1792255241470 | 5 | 1 | 0 | 4 | 0 | 0 | 1 |
| 20c667e2 | TEST dien tap ngan-xep-v1 - xoa sau 1792396893536 | 5 | 1 | 0 | 4 | 0 | 1 | 2 |
| 25102b6c | TEST dien tap ngan-xep-v1 - xoa sau 1792313218019 | 5 | 2 | 0 | 3 | 0 | 0 | 1 |
| 25b61e58 | TEST dien tap ngan-xep-v1 - xoa sau 1792312829493 | 5 | 2 | 0 | 3 | 0 | 0 | 1 |
| 26262eba | TEST dien tap ngan-xep-v1 - xoa sau 1790582220363 | 5 | 2 | 0 | 3 | 0 | 0 | 1 |
| 2acbfa12 | TEST dien tap ngan-xep-v1 - xoa sau 1792421251635 | 5 | 1 | 0 | 4 | 0 | 0 | 1 |
| 2ad74241 | TEST dien tap ngan-xep-v1 - xoa sau 1792400943532 | 5 | 0 | 0 | 5 | 0 | 0 | 2 |
| 2e302dd7 | TEST dien tap ngan-xep-v1 - xoa sau 1792372932185 | 5 | 0 | 1 | 4 | 0 | 0 | 1 |
| 36748097 | TEST dien tap ngan-xep-v1 - xoa sau 1792233302112 | 5 | 2 | 0 | 3 | 0 | 0 | 1 |
| 395544d7 | TEST dien tap ngan-xep-v1 - xoa sau 1792396583188 | 5 | 1 | 0 | 4 | 0 | 0 | 1 |
| 4565d1f9 | TEST dien tap ngan-xep-v1 - xoa sau 1792306936674 | 5 | 0 | 0 | 5 | 0 | 5 | 0 |
| 48c098ff | TEST dien tap ngan-xep-v1 - xoa sau 1792217677003 | 5 | 0 | 0 | 5 | 0 | 5 | 0 |
| 5f4975ee | TEST dien tap ngan-xep-v1 - xoa sau 1790588688826 | 5 | 1 | 0 | 4 | 0 | 0 | 1 |
| 6c2da75f | TEST dien tap ngan-xep-v1 - xoa sau 1792254442359 | 5 | 0 | 0 | 5 | 0 | 5 | 0 |
| 6c8eb916 | TEST dien tap ngan-xep-v1 - xoa sau 1792256773090 | 5 | 0 | 0 | 5 | 0 | 5 | 0 |
| 71673d29 | TEST dien tap ngan-xep-v1 - xoa sau 1792309221562 | 5 | 1 | 1 | 3 | 0 | 0 | 2 |
| 7a3bb21e | TEST dien tap ngan-xep-v1 - xoa sau 1792421061146 | 5 | 2 | 0 | 3 | 0 | 0 | 1 |
| 7dd6dd3a | TEST dien tap ngan-xep-v1 - xoa sau 1792315608217 | 5 | 2 | 0 | 3 | 0 | 0 | 2 |
| 80c4b4f5 | TEST dien tap ngan-xep-v1 - xoa sau 1790582353579 | 5 | 2 | 0 | 3 | 0 | 0 | 1 |
| 83379692 | TEST dien tap ngan-xep-v1 - xoa sau 1792309438391 | 5 | 1 | 0 | 4 | 0 | 0 | 1 |
| 863073b6 | TEST dien tap ngan-xep-v1 - xoa sau 1790582041290 | 5 | 2 | 0 | 3 | 0 | 1 | 1 |
| 894ad713 | TEST dien tap ngan-xep-v1 - xoa sau 1792313043617 | 5 | 1 | 0 | 4 | 0 | 0 | 1 |
| 8a50cb5c | TEST dien tap ngan-xep-v1 - xoa sau 1792400202904 | 5 | 0 | 0 | 5 | 0 | 0 | 1 |
| 93156e91 | TEST dien tap ngan-xep-v1 - xoa sau 1792216811194 | 5 | 0 | 0 | 5 | 0 | 5 | 0 |
| 96aafd99 | TEST dien tap ngan-xep-v1 - xoa sau 1792232363950 | 5 | 0 | 2 | 3 | 0 | 0 | 1 |
| 9840cb13 | TEST dien tap tai 5 bai - xoa sau 1790577267138 | 5 | 1 | 0 | 4 | 0 | 0 | 2 |
| a24825b5 | TEST dien tap ngan-xep-v1 - xoa sau 1792315831085 | 5 | 1 | 0 | 4 | 0 | 0 | 1 |
| a2908909 | TEST dien tap ngan-xep-v1 - xoa sau 1792219516427 | 5 | 0 | 0 | 5 | 0 | 5 | 0 |
| acecf49c | TEST dien tap ngan-xep-v1 - xoa sau 1792253428089 | 5 | 0 | 0 | 5 | 0 | 5 | 0 |
| b387539c | TEST dien tap ngan-xep-v1 - xoa sau 1791949297602 | 5 | 2 | 0 | 3 | 0 | 0 | 1 |
| c29be8d5 | TEST dien tap ngan-xep-v1 - xoa sau 1790583167146 | 5 | 1 | 0 | 4 | 0 | 0 | 1 |
| c62239e5 | TEST dien tap ngan-xep-v1 - xoa sau 1792328072518 | 5 | 0 | 0 | 5 | 0 | 2 | 0 |
| cd6e1efd | TEST dien tap ngan-xep-v1 - xoa sau 1790582927104 | 5 | 2 | 0 | 3 | 0 | 0 | 1 |
| d54c7bb6 | TEST dien tap ngan-xep-v1 - xoa sau 1792548129036 | 5 | 2 | 0 | 3 | 0 | 0 | 2 |
| ea75f91d | TEST dien tap ngan-xep-v1 - xoa sau 1792256605761 | 5 | 1 | 0 | 4 | 0 | 1 | 1 |
| eb3afc87 | TEST dien tap ngan-xep-v1 - xoa sau 1792327051222 | 5 | 0 | 0 | 5 | 0 | 0 | 1 |
| ec6cede5 | TEST dien tap ngan-xep-v1 - xoa sau 1790588949111 | 5 | 2 | 0 | 2 | 1 | 0 | 1 |
| eda97bf7 | TEST dien tap ngan-xep-v1 - xoa sau 1792307722865 | 5 | 0 | 0 | 5 | 0 | 4 | 0 |
| f5ebe0f2 | TEST dien tap ngan-xep-v1 - xoa sau 1790579324397 | 5 | 3 | 0 | 2 | 0 | 0 | 2 |
| 4be23ada | Kiểm tra cuối kì | 1 | 0 | 0 | 1 | 0 | 1 | 0 |
| 4dd53672 | TEST dien tap ngan-xep-v1 - xoa sau 1792315457590 | 1 | 0 | 0 | 1 | 0 | 0 | 0 |
| 559fce07 | TEST dien tap ngan-xep-v1 - xoa sau 1791945825245 | 1 | 1 | 0 | 0 | 0 | 0 | 0 |
| 609c5d12 | Kiểm tra cuối kì môn CTDL&GT | 1 | 0 | 0 | 1 | 0 | 1 | 0 |
| 71a29ea0 | TEST dien tap ngan-xep-v1 - xoa sau 1791947257449 | 1 | 1 | 0 | 0 | 0 | 0 | 0 |
| 76765596 | TEST dien tap ngan-xep-v1 - xoa sau 1790582138239 | 1 | 0 | 0 | 1 | 0 | 0 | 1 |
| 79016a43 | Kiểm tra giữa kỳ | 1 | 0 | 0 | 0 | 1 | 1 | 0 |
| 7c440f5f | CTDLGT | 1 | 0 | 0 | 0 | 1 | 1 | 0 |
| 7d3ecd16 | Thi lập trình giải thuật | 1 | 0 | 0 | 1 | 0 | 0 | 1 |
| 8779a723 | Kiểm tra cuối kì | 1 | 0 | 0 | 0 | 1 | 1 | 0 |
| 8c36f097 | Kiểm tra thường kỳ lần 2 | 1 | 0 | 0 | 1 | 0 | 1 | 0 |
| a450c3e1 | TEST dien tap buoc 6 - xoa sau 1790566591779 | 1 | 0 | 0 | 1 | 0 | 0 | 0 |
| b09b69b5 | TEST ha tang sandbox - xoa sau 1790522483525 | 1 | 0 | 0 | 1 | 0 | 0 | 1 |
| d71e0ab9 | Kiểm tra giữa kỳ - Môn Quản Trị Cơ sở Dữ Liệu MongoDB | 1 | 0 | 0 | 1 | 0 | 1 | 0 |
| f1bc33e5 | Thi CTDLGT | 1 | 0 | 0 | 1 | 0 | 1 | 0 |

Đối chiếu bảng 5 (cộng cột bằng awk trên đầu ra): 61 phiên, `total` 265, `auto_approved` 54, `audit_pending` 6, `flagged_for_review` 201, `other_status` 4, `no_computation` 57, `no_error` 54. Khớp bảng 3.

### 6. Đối chiếu: mọi dòng đều nối được tới một phiên

| total_rows | rows_joined_to_a_session |
| --- | --- |
| 265 | 265 |

265 = 265, nên bảng 5 không bỏ dòng nào do phép nối.

## Điều đáng chú ý cho Task 11

- Nhóm `no_error` trong ba trạng thái được hỏi: `auto_approved` 19 trên 54, `audit_pending` 2 trên 6, `flagged_for_review` 33 trên 201. Tổng 54 bài `no_error` toàn DB, trong đó 33 bài đang nằm ở `flagged_for_review`.
- 35 trên 54 bài `auto_approved` có ít nhất một lỗi (đều có lỗi do máy; 1 bài có thêm lỗi LLM).
- 54 bài `flagged_for_review` không có dòng `score_computation` nào (và 3 bài `teacher_reviewed`). Script này không điều tra vì sao.
- Gần như toàn bộ dữ liệu là phiên diễn tập tự dựng (tên phiên có tiền tố `TEST dien tap ...` hoặc `TEST ha tang ...`). Đây không phải số liệu bài thi thật.

## Câu truy vấn

Cùng nội dung với `docs/rehearsals/2026-10-21-pre-p1-db-counts.sql`.

```sql
-- Đường cơ sở trước P1 (cham-diem-duyet-nhanh), base commit bdde467.
-- CHỈ ĐỌC: toàn bộ script nằm trong một giao dịch READ ONLY và kết thúc bằng ROLLBACK.
-- Không có INSERT/UPDATE/DELETE/DDL. DB là Supabase thật, dùng chung.
--
-- Chạy (đã nạp .env vào môi trường, KHÔNG in DATABASE_URL):
--   docker run --rm -i -e DATABASE_URL postgres:17-alpine \
--     sh -c 'psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -A -F "|" -t' < docs/rehearsals/2026-10-21-pre-p1-db-counts.sql
--
-- Phạm vi đếm: TOÀN BỘ dòng examcollect.grading_result (không lọc phiên).
-- "Lượt tính mới nhất" của một kết quả = dòng score_computation có
-- (created_at, id) lớn nhất theo grading_result_id.
-- Danh sách lỗi = breakdown -> 'errors'; mỗi lỗi có `source`
-- (deterministic | llm_with_tools | llm_only).
--
-- Ba nhóm lỗi, đếm ĐỘC LẬP (một bài có thể thuộc nhiều nhóm không rỗng):
--   no_error    = có lượt tính và mảng errors rỗng
--   has_machine = có >= 1 lỗi mà source KHÔNG phải llm_only / llm_with_tools
--                 (tức deterministic; source rỗng cũng bị xếp vào đây)
--   has_llm     = có >= 1 lỗi mà source là llm_only hoặc llm_with_tools
-- Thêm hai cột để tổng khớp: no_computation (chưa có dòng score_computation nào)
-- và has_error_any (>= 1 lỗi). Luôn có:
--   no_computation + no_error + has_error_any = total
--   has_machine + has_llm - has_both = has_error_any

BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '60s';
\pset tuples_only off
\pset footer off

\echo '== 0. Bằng chứng chỉ đọc và thời điểm chạy =='
SELECT current_setting('transaction_read_only') AS transaction_read_only,
       current_database() AS db_name,
       to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS run_at_utc;

\echo '== 1. Số dòng grading_result theo MỌI trạng thái =='
SELECT s::text AS status, count(gr.id) AS n
FROM unnest(enum_range(NULL::examcollect.grading_status)) AS s
LEFT JOIN examcollect.grading_result gr ON gr.status = s
GROUP BY s
ORDER BY s;

\echo '== 2. Đối chiếu: tổng các trạng thái = tổng dòng grading_result =='
SELECT (SELECT count(*) FROM examcollect.grading_result) AS total_rows,
       (SELECT sum(n) FROM (
          SELECT count(gr.id) AS n
          FROM unnest(enum_range(NULL::examcollect.grading_status)) AS s
          LEFT JOIN examcollect.grading_result gr ON gr.status = s
          GROUP BY s) t) AS sum_of_status_counts,
       (SELECT count(*) FROM examcollect.grading_result)
         = (SELECT sum(n) FROM (
              SELECT count(gr.id) AS n
              FROM unnest(enum_range(NULL::examcollect.grading_status)) AS s
              LEFT JOIN examcollect.grading_result gr ON gr.status = s
              GROUP BY s) t) AS reconciles;

\echo '== 3. Trạng thái x nhóm lỗi (lượt tính mới nhất), mọi trạng thái, dòng cuối là TOTAL =='
WITH latest AS (
  SELECT DISTINCT ON (sc.grading_result_id)
         sc.grading_result_id, sc.breakdown
  FROM examcollect.score_computation sc
  ORDER BY sc.grading_result_id, sc.created_at DESC, sc.id DESC
),
classified AS (
  SELECT gr.id,
         gr.status,
         (l.grading_result_id IS NOT NULL) AS has_computation,
         CASE WHEN jsonb_typeof(l.breakdown -> 'errors') = 'array'
              THEN l.breakdown -> 'errors' ELSE '[]'::jsonb END AS errs
  FROM examcollect.grading_result gr
  LEFT JOIN latest l ON l.grading_result_id = gr.id
),
flags AS (
  SELECT c.id, c.status, c.has_computation,
         (jsonb_array_length(c.errs) > 0) AS has_any,
         EXISTS (SELECT 1 FROM jsonb_array_elements(c.errs) e
                 WHERE COALESCE(e ->> 'source', '') NOT IN ('llm_only', 'llm_with_tools')) AS has_machine,
         EXISTS (SELECT 1 FROM jsonb_array_elements(c.errs) e
                 WHERE e ->> 'source' IN ('llm_only', 'llm_with_tools')) AS has_llm
  FROM classified c
)
SELECT COALESCE(status::text, 'TOTAL') AS status,
       count(*) AS total,
       count(*) FILTER (WHERE NOT has_computation) AS no_computation,
       count(*) FILTER (WHERE has_computation AND NOT has_any) AS no_error,
       count(*) FILTER (WHERE has_any) AS has_error_any,
       count(*) FILTER (WHERE has_machine) AS has_machine,
       count(*) FILTER (WHERE has_llm) AS has_llm,
       count(*) FILTER (WHERE has_machine AND has_llm) AS has_both
FROM flags
GROUP BY ROLLUP (status)
ORDER BY GROUPING(status), flags.status;

\echo '== 4. Giá trị source thực có trong các lỗi của lượt tính mới nhất (kiểm luật phân nhóm) =='
WITH latest AS (
  SELECT DISTINCT ON (sc.grading_result_id)
         sc.grading_result_id, sc.breakdown
  FROM examcollect.score_computation sc
  ORDER BY sc.grading_result_id, sc.created_at DESC, sc.id DESC
)
SELECT COALESCE(e ->> 'source', '(null)') AS source, count(*) AS n_errors
FROM latest l
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(l.breakdown -> 'errors') = 'array'
       THEN l.breakdown -> 'errors' ELSE '[]'::jsonb END) AS e
GROUP BY 1
ORDER BY 1;

\echo '== 5. Tách theo phiên thi (exam_session), chỉ phiên có bài chấm =='
WITH latest AS (
  SELECT DISTINCT ON (sc.grading_result_id)
         sc.grading_result_id, sc.breakdown
  FROM examcollect.score_computation sc
  ORDER BY sc.grading_result_id, sc.created_at DESC, sc.id DESC
),
classified AS (
  SELECT gr.id, gr.status, sub.exam_session_id,
         (l.grading_result_id IS NOT NULL) AS has_computation,
         CASE WHEN jsonb_typeof(l.breakdown -> 'errors') = 'array'
              THEN l.breakdown -> 'errors' ELSE '[]'::jsonb END AS errs
  FROM examcollect.grading_result gr
  JOIN examcollect.submission sub ON sub.id = gr.submission_id
  LEFT JOIN latest l ON l.grading_result_id = gr.id
)
SELECT left(c.exam_session_id::text, 8) AS session_id8,
       es.name AS session_name,
       count(*) AS total,
       count(*) FILTER (WHERE c.status = 'auto_approved') AS auto_approved,
       count(*) FILTER (WHERE c.status = 'audit_pending') AS audit_pending,
       count(*) FILTER (WHERE c.status = 'flagged_for_review') AS flagged_for_review,
       count(*) FILTER (WHERE c.status NOT IN ('auto_approved', 'audit_pending', 'flagged_for_review')) AS other_status,
       count(*) FILTER (WHERE NOT c.has_computation) AS no_computation,
       count(*) FILTER (WHERE c.has_computation AND jsonb_array_length(c.errs) = 0) AS no_error
FROM classified c
JOIN examcollect.exam_session es ON es.id = c.exam_session_id
GROUP BY c.exam_session_id, es.name
ORDER BY total DESC, session_id8;

\echo '== 6. Đối chiếu bảng 5: tổng các phiên = tổng dòng grading_result =='
SELECT (SELECT count(*) FROM examcollect.grading_result) AS total_rows,
       (SELECT count(*) FROM examcollect.grading_result gr
          JOIN examcollect.submission sub ON sub.id = gr.submission_id
          JOIN examcollect.exam_session es ON es.id = sub.exam_session_id) AS rows_joined_to_a_session;

ROLLBACK;
```

## Lệnh đã chạy (không có bí mật)

Biến `DATABASE_URL` nạp từ file `.env` của API vào môi trường, không in ra. Máy không có `psql`, nên dùng ảnh Docker và truyền URL qua môi trường:

```bash
set -a; . "<đường dẫn>/apps/api/.env"; set +a
docker run --rm -i -e DATABASE_URL postgres:17-alpine \
  sh -c 'psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -A -F "|" -t' \
  < docs/rehearsals/2026-10-21-pre-p1-db-counts.sql
```

Lần chạy thành công ngay lần thử đầu (không cần thử lại), stderr rỗng.

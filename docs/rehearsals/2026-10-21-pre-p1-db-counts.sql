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

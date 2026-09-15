-- Hai chỉ số calibration KHÔNG CẦN NGƯỜI CHẤM (spec §11.5).
--
-- Chạy:
--   docker exec -i cine-postgres-1 psql -U examcollect_admin -d examcollect \
--     -f - < scripts/calibration/free-metrics.sql
--
-- VÌ SAO LÀ SQL THUẦN, KHÔNG PHẢI PYTHON:
-- hai chỉ số này là phép ĐẾM, không phải phép thống kê. Bắt người ta cài
-- pandas + scipy + psycopg2 để chạy một câu `count(*)` là dựng một rào
-- chắn trước đúng cái số liệu đáng lẽ có ngay hôm nay. Kappa và Pearson
-- (§11.4) mới cần Python — chúng ở `analyze.py`.
--
-- Cả hai chỉ số chạy trên 100% số bài production, không cần tổ chức buổi
-- chấm mù nào. Đó là lý do §11.5 gọi chúng là "miễn phí".

\pset border 2
\echo ''
\echo '========================================================================'
\echo ' ĐỘ PHỦ ĐO ĐƯỢC — đọc phần này TRƯỚC khi đọc bất kỳ con số nào ở dưới'
\echo '========================================================================'

-- Trường `check` chỉ được ghi từ 2026-09-15. Mọi dòng chấm trước đó có
-- `criterion_results` nhưng KHÔNG có nó — và "chưa đo" phải tách khỏi
-- "đo ra 0", nếu không tỉ lệ unverified sẽ trông đẹp một cách giả tạo.
SELECT
  count(*)                                                     AS tong_dong_cham,
  count(*) FILTER (WHERE jsonb_array_length(criterion_results) > 0)
                                                               AS co_tieu_chi,
  count(*) FILTER (WHERE criterion_results @> '[{"check": "ok"}]'
                      OR criterion_results @> '[{"check": "empty"}]'
                      OR criterion_results @> '[{"check": "unverified"}]')
                                                               AS do_duoc_unverified
FROM examcollect.grading_result;

\echo ''
\echo '========================================================================'
\echo ' 1. TỈ LỆ UNVERIFIED — dẫn chứng model trích mà máy KHÔNG định vị được'
\echo '========================================================================'
\echo ' Đây cũng là chỉ số nói G2 có đang BÁO ĐỘNG GIẢ hay không (§6.3a):'
\echo ' tỉ lệ cao bất thường nghĩa là phép kiểm quá chặt, không phải model tệ.'
\echo ''

WITH tieu_chi AS (
  SELECT
    gr.model_used,
    gr.rubric_id_version,
    c.value ->> 'check' AS ket_qua_kiem
  FROM examcollect.grading_result gr
  CROSS JOIN LATERAL jsonb_array_elements(gr.criterion_results) AS c(value)
  WHERE c.value ? 'check' AND c.value ->> 'check' IS NOT NULL
)
SELECT
  coalesce(model_used, '(không rõ)')                          AS model,
  count(*)                                                     AS so_tieu_chi,
  count(*) FILTER (WHERE ket_qua_kiem = 'ok')                  AS ok,
  count(*) FILTER (WHERE ket_qua_kiem = 'empty')               AS rong,
  count(*) FILTER (WHERE ket_qua_kiem = 'unverified')          AS khong_dinh_vi_duoc,
  round(100.0 * count(*) FILTER (WHERE ket_qua_kiem = 'unverified') / nullif(count(*), 0), 1)
                                                               AS ti_le_unverified_pct
FROM tieu_chi
GROUP BY model_used
ORDER BY so_tieu_chi DESC;

\echo ''
\echo '========================================================================'
\echo ' 2. TỈ LỆ PHỦ TIÊU CHÍ — model KHÔNG trích nổi dẫn chứng nào'
\echo '========================================================================'
\echo ' Dẫn chứng RỖNG nghĩa là "sinh viên không đề cập tiêu chí này" theo'
\echo ' phán đoán của model. Tỉ lệ rỗng cao ở một rubric có thể là rubric hỏi'
\echo ' thứ đề bài không yêu cầu — một phát hiện về RUBRIC, không về sinh viên.'
\echo ''
\echo ' Chỉ số này đọc được trên MỌI dòng chấm, kể cả trước 2026-09-15.'
\echo ''

WITH tieu_chi AS (
  SELECT
    gr.model_used,
    c.value ->> 'verdict'                                      AS verdict,
    coalesce(c.value ->> 'evidence', '')                       AS evidence
  FROM examcollect.grading_result gr
  CROSS JOIN LATERAL jsonb_array_elements(gr.criterion_results) AS c(value)
)
SELECT
  coalesce(model_used, '(không rõ)')                          AS model,
  count(*)                                                     AS so_tieu_chi,
  count(*) FILTER (WHERE btrim(evidence) = '')                 AS khong_co_dan_chung,
  round(100.0 * count(*) FILTER (WHERE btrim(evidence) = '') / nullif(count(*), 0), 1)
                                                               AS ti_le_rong_pct,
  count(*) FILTER (WHERE verdict = 'met')                      AS met,
  count(*) FILTER (WHERE verdict = 'partially_met')            AS mot_phan,
  count(*) FILTER (WHERE verdict = 'not_met')                  AS khong_dat
FROM tieu_chi
GROUP BY model_used
ORDER BY so_tieu_chi DESC;

\echo ''
\echo '========================================================================'
\echo ' 3. MỨC NGỮ CẢNH THẬT SỰ ĐÃ DÙNG — nền cho việc phân nhánh ở §11.2'
\echo '========================================================================'
\echo ' `grading-readiness` báo mức theo CẤU HÌNH của phiên; ba cột dưới đây'
\echo ' là mức lượt chấm THỰC SỰ đọc được. Hai thứ đó lệch nhau từ khi có'
\echo ' chuỗi dự phòng: endpoint tương thích OpenAI không gửi được PDF.'
\echo ''
\echo ' NULL = chấm trước khi hệ thống biết ghi lại điều này, KHÁC false ='
\echo ' đã đo và không có. Gộp hai thứ đó là biến nhánh B thành nhánh A.'
\echo ''

SELECT
  coalesce(model_used, '(không rõ)')                          AS model,
  count(*)                                                     AS so_bai,
  count(*) FILTER (WHERE context_used_question IS NULL)        AS chua_do,
  count(*) FILTER (WHERE context_used_question IS TRUE)        AS co_de_bai,
  count(*) FILTER (WHERE context_used_model_answer IS TRUE)    AS co_dap_an_mau
FROM examcollect.grading_result
WHERE ai_total_score IS NOT NULL
GROUP BY model_used
ORDER BY so_bai DESC;

\echo ''
\echo '========================================================================'
\echo ' 4. GIẢNG VIÊN CÓ SỬA KHÔNG — dữ liệu QUAN SÁT, không phải thí nghiệm'
\echo '========================================================================'
\echo ' ⚠️  Tập này BỊ NEO: giảng viên nhìn đề xuất của AI TRƯỚC khi sửa'
\echo '     (§11.3). Nó nói về quy mô và xu hướng, và KHÔNG thay thế được'
\echo '     một tập chấm mù. Đừng báo cáo nó như bằng chứng về độ chính xác.'
\echo ''

SELECT
  count(*)                                                     AS so_lan_duyet,
  count(*) FILTER (WHERE tr.edited_criteria IS NOT NULL
                     AND tr.edited_criteria <> '{}'::jsonb)    AS co_sua_tieu_chi,
  round(avg(abs(tr.final_score - gr.ai_total_score))::numeric, 2)
                                                               AS lech_diem_trung_binh,
  count(*) FILTER (WHERE tr.final_score > gr.ai_total_score)    AS nguoi_cham_cao_hon,
  count(*) FILTER (WHERE tr.final_score < gr.ai_total_score)    AS nguoi_cham_thap_hon
FROM examcollect.teacher_review tr
JOIN examcollect.grading_result gr ON gr.id = tr.grading_result_id
WHERE gr.ai_total_score IS NOT NULL;

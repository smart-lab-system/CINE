-- Đưa DB DEV (cả DB e2e local) về trạng thái "vừa dựng xong": giữ các tài khoản demo, xoá MỌI thứ còn lại — lớp, phiên thi, bài nộp, kết quả chấm,
-- rubric, và dữ liệu nền (học kỳ, phòng, lớp danh nghĩa, sinh viên).
--
-- Vì sao cần: các bộ e2e dựng học kỳ, phòng, lớp danh nghĩa, lớp, sinh viên, phiên thi và tài khoản MỖI LẦN CHẠY mà không bao giờ dọn (không thể: mỗi lần cần
-- giá trị riêng, và dọn sau một lần chạy hỏng sẽ phá fixture của lần sau). Sau vài tuần, danh sách chỉ còn rác — và, từ khi có migration thu hẹp
-- (`ContractMasterDataEntities`), rác ở HÌNH DẠNG CŨ (lớp không học kỳ, phiên không phòng) làm migration đó dừng ở tiền điều kiện.
--
--   docker exec -i cine-postgres-1 psql -U examcollect_admin -d examcollect < scripts/reset-dev-data.sql
--
-- AN TOÀN KHI CHẠY LẠI. CHỈ dùng cho DB dev: nó xoá theo "gốc rồi lan theo khoá ngoại" (TRUNCATE … CASCADE), nên mọi bảng phụ thuộc cũng sạch. ĐỌC các dòng
-- NOTICE nó in ra — đó là danh sách bảng đã bị xoá sạch.
--
-- `audit_log` KHÔNG nằm trong danh sách và không có khoá ngoại tới các bảng dưới đây: trigger append-only của nó từ chối DELETE (Security rule 4), nên nó không
-- bao giờ reset được bằng script này; muốn rỗng thì dựng lại DB.
--
-- Cấu hình AI/chi phí của admin (`grading_pipeline_config`, `cost_budget`) giữ nguyên; tài khoản không phải demo bị xoá, hoặc VÔ HIỆU HOÁ nếu còn được tham chiếu (xem khối `DO` bên dưới).

BEGIN;

-- ---- Gốc dữ liệu thi + chấm + nền: mọi bảng phụ thuộc (bài nộp, điểm, danh sách dự thi, enrollment, deliverable …) bị cuốn theo ---------
TRUNCATE
  examcollect.exam_session,
  examcollect.class,
  examcollect.student,
  examcollect.semester,
  examcollect.room,
  examcollect.administrative_class,
  examcollect.rubric,
  examcollect.calibration_run
RESTART IDENTITY CASCADE;

-- ---- Tài khoản: giữ hai tài khoản demo DEMO-RUNBOOK.md nhắc tới --------
-- demo-admin giữ có chủ ý: kiểm route chỉ-cho-giảng-viên cần một đăng nhập admin thật, và từ đợt khôi phục master data, admin là người tạo học kỳ, phòng,
-- lớp và giao lớp cho giảng viên — reset mà mất nó thì không còn cách dựng lại dữ liệu nền.
-- Xoá được thì xoá; tài khoản còn bị tham chiếu thì VÔ HIỆU HOÁ thay vì xoá. `audit_log` là append-only và giữ khoá ngoại RESTRICT tới `account` (cột `actor_id`), cũng như
-- `error_rule`, `price_table_version`, `ai_usage`, `rubric_template`, `grading_pipeline_config`… — một DB đã dùng (nhất là DB e2e: mỗi lần chạy ghi audit cho tài khoản test)
-- luôn có tài khoản như vậy, và một câu `DELETE` thẳng sẽ làm cả giao dịch lùi lại với lỗi 23503 (review cuối, m1). Từng tài khoản một, trong khối con có bắt lỗi, nên một tài khoản
-- bị tham chiếu không kéo theo các tài khoản khác.
DO $$
DECLARE
  r record;
  removed integer := 0;
  deactivated integer := 0;
BEGIN
  FOR r IN SELECT id FROM examcollect.account WHERE email NOT IN ('demo-teacher@example.com', 'demo-admin@example.com') LOOP
    BEGIN
      DELETE FROM examcollect.account WHERE id = r.id;
      removed := removed + 1;
    EXCEPTION WHEN foreign_key_violation THEN
      UPDATE examcollect.account SET is_active = false WHERE id = r.id;
      deactivated := deactivated + 1;
    END;
  END LOOP;
  RAISE NOTICE 'tài khoản: xoá %, vô hiệu hoá (còn bị tham chiếu) %', removed, deactivated;
END
$$;

COMMIT;

SELECT 'account' AS t, count(*) FROM examcollect.account
UNION ALL SELECT 'semester', count(*) FROM examcollect.semester
UNION ALL SELECT 'room', count(*) FROM examcollect.room
UNION ALL SELECT 'administrative_class', count(*) FROM examcollect.administrative_class
UNION ALL SELECT 'class', count(*) FROM examcollect.class
UNION ALL SELECT 'student', count(*) FROM examcollect.student
UNION ALL SELECT 'enrollment', count(*) FROM examcollect.enrollment
UNION ALL SELECT 'exam_session', count(*) FROM examcollect.exam_session
UNION ALL SELECT 'submission', count(*) FROM examcollect.submission
ORDER BY 1;

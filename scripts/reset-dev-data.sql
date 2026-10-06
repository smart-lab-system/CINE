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
-- Cấu hình AI/chi phí của admin (`grading_pipeline_config`, `cost_budget`) và tài khoản giữ nguyên.

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
DELETE FROM examcollect.account
WHERE email NOT IN (
  'demo-teacher@example.com',
  'demo-admin@example.com'
);

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

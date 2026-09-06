-- Dọn DEV database về gần nhất có thể với trạng thái sau `migration:run`:
-- seed của migration AddCourseRoomExamType, cộng ba tài khoản demo mà
-- DEMO-RUNBOOK.md hướng dẫn tạo.
--
-- Vì sao cần: mỗi file e2e tạo một semester/course/class/enrollment và vài
-- tài khoản cho mỗi lần chạy, và không dọn — chúng không thể dọn, vì mỗi
-- lần chạy cần giá trị duy nhất và gỡ ngược lại sẽ khiến một test hỏng phá
-- luôn fixture của lần chạy sau. Đo thật trên một lượt e2e đầy đủ
-- (2026-09-06): **+22 semester, +48 account, +73 exam_session, +83
-- agent_connection_event**. Sau vài tuần, danh sách học kỳ và tài khoản
-- gần như toàn nhiễu.
--
--   docker exec -i cine-postgres-1 psql -U examcollect_admin -d examcollect \
--     -v ON_ERROR_STOP=1 < scripts/reset-dev-data.sql
--
-- AN TOÀN KHI CHẠY LẠI. Đừng bao giờ trỏ vào thứ gì ngoài DB dev: đây là
-- whitelist, mọi thứ không liệt kê dưới đây đều bị xoá.
--
-- ===========================================================================
-- SCRIPT NÀY KHÔNG BAO GIỜ DỌN ĐƯỢC VỀ SẠCH HOÀN TOÀN. Muốn sạch: drop schema.
-- ===========================================================================
--
-- Hai bảng là append-only, trigger từ chối DELETE (Security rule 4):
--
--   audit_log               — trg_audit_log_immutable
--   agent_connection_event  — trg_agent_connection_event_immutable
--
-- Và cả hai đều là RESTRICT foreign key trỏ ngược lên thứ ta muốn xoá:
-- audit_log.actor_id ghim account, agent_connection_event.exam_session_id
-- ghim exam_session — mà một exam_session bị ghim thì ghim tiếp course,
-- class, room và semester của nó.
--
-- Đo trên DB dev ngày 2026-09-06 trước khi rebuild: 3484 event ghim 1044 /
-- 2595 phiên thi, kéo theo 458 môn học và **421 / 1084 học kỳ** không thể
-- xoá. Bản trước của script này gọi thẳng `DELETE FROM
-- agent_connection_event` và chết ngay dòng đó — một dòng bị chặn làm
-- rollback cả transaction, nên KHÔNG DỌN ĐƯỢC GÌ CẢ trong khi vẫn báo như
-- đã chạy.
--
-- Nên mọi DELETE dưới đây đều có mệnh đề NOT EXISTS bỏ qua phần bị ghim,
-- thay vì nghẹn ở đó. Phần còn lại nằm lại vĩnh viễn. Đó là cái giá thật
-- của một audit trail bất biến, và là cái giá đúng: lựa chọn thay thế là
-- audit trail sửa được, hoặc một script reset không chạy.
--
-- Muốn DB thật sự sạch (trước khi demo, hoặc khi nhiễu đã quá nhiều):
--   docker exec cine-postgres-1 psql -U examcollect_admin -d examcollect \
--     -c "DROP SCHEMA examcollect CASCADE; CREATE SCHEMA examcollect;"
--   cd apps/api && pnpm migration:run
--   rồi tạo lại ba tài khoản demo theo DEMO-RUNBOOK.md §5.
-- Nhớ xuất audit_log ra file trước nếu cần giữ làm bằng chứng cho báo cáo.
--
-- Thứ tự xoá đi theo đồ thị FK (mọi FK đều ON DELETE RESTRICT, nên sai thứ
-- tự sẽ hỏng to tiếng chứ không cascade âm thầm).

BEGIN;

-- ---- Dữ liệu chấm điểm + bài nộp: không có gì được seed, xoá hết --------
DELETE FROM examcollect.teacher_review;
DELETE FROM examcollect.grading_result;
DELETE FROM examcollect.grade_export;
DELETE FROM examcollect.submission;
DELETE FROM examcollect.required_deliverable;
DELETE FROM examcollect.exam_material;

-- agent_connection_event KHÔNG có ở đây: append-only, không xoá được.

-- Chỉ những phiên chưa có agent nào kết nối. Phần còn lại bị event ghim.
DELETE FROM examcollect.exam_session s
WHERE NOT EXISTS (
  SELECT 1 FROM examcollect.agent_connection_event e WHERE e.exam_session_id = s.id
);

-- ---- Cấu trúc học vụ: chỉ giữ seed của migration -----------------------
DELETE FROM examcollect.enrollment;

DELETE FROM examcollect.class k
WHERE NOT EXISTS (SELECT 1 FROM examcollect.exam_session s WHERE s.class_id = k.id);

DELETE FROM examcollect.rubric_criterion;
DELETE FROM examcollect.rubric r
WHERE NOT EXISTS (SELECT 1 FROM examcollect.exam_session s WHERE s.rubric_id = r.id);
DELETE FROM examcollect.calibration_run;

DELETE FROM examcollect.course c
WHERE c.code NOT IN ('CS101', 'CS201')
  AND NOT EXISTS (SELECT 1 FROM examcollect.exam_session s WHERE s.course_id = c.id)
  AND NOT EXISTS (SELECT 1 FROM examcollect.class k       WHERE k.course_id = c.id);

DELETE FROM examcollect.semester sem
WHERE sem.name <> 'Học kỳ 1 2026-2027'
  AND NOT EXISTS (SELECT 1 FROM examcollect.course c WHERE c.semester_id = sem.id);

DELETE FROM examcollect.room rm
WHERE rm.name NOT IN ('Phòng máy A1', 'Phòng máy A2', 'Phòng máy B1')
  AND NOT EXISTS (SELECT 1 FROM examcollect.exam_session s WHERE s.room_id = rm.id);

-- ---- Tài khoản: giữ ba cái runbook ghi ---------------------------------
-- demo-admin giữ có chủ đích, không phải cho cân đối: kiểm guard teacher-only
-- trên POST /exam-sessions cần một lần đăng nhập admin thật. demo-head là
-- Trưởng khoa mà bước 5b của runbook cần — từ Phase 3, lớp và danh sách sinh
-- viên được tạo qua tài khoản đó, nên reset mà xoá nó là để demo không còn
-- đường quay về trạng thái chạy được.
--
-- Dùng NOT EXISTS chứ không NOT IN: audit_log.actor_id nullable (hành động
-- hệ thống không có actor), và `id NOT IN (subquery có một NULL)` không bao
-- giờ đúng với bất kỳ dòng nào — DELETE sẽ âm thầm không xoá gì.
DELETE FROM examcollect.cost_budget;

DELETE FROM examcollect.account a
WHERE a.email NOT IN (
    'demo-teacher@example.com',
    'demo-admin@example.com',
    'demo-head@example.com'
  )
  AND NOT EXISTS (SELECT 1 FROM examcollect.audit_log    al WHERE al.actor_id = a.id)
  AND NOT EXISTS (SELECT 1 FROM examcollect.exam_session s  WHERE s.teacher_id = a.id)
  AND NOT EXISTS (SELECT 1 FROM examcollect.class        k  WHERE k.teacher_id = a.id)
  AND NOT EXISTS (SELECT 1 FROM examcollect.course       c  WHERE c.department_head_id = a.id);

COMMIT;

-- Con số nào KHÔNG về mức seed thì phần dư là do append-only ghim — xem
-- header. Ba dòng cuối nói rõ phần dư đó lớn cỡ nào.
SELECT 'account' AS t, count(*) FROM examcollect.account
UNION ALL SELECT 'semester',     count(*) FROM examcollect.semester
UNION ALL SELECT 'course',       count(*) FROM examcollect.course
UNION ALL SELECT 'room',         count(*) FROM examcollect.room
UNION ALL SELECT 'class',        count(*) FROM examcollect.class
UNION ALL SELECT 'enrollment',   count(*) FROM examcollect.enrollment
UNION ALL SELECT 'exam_session', count(*) FROM examcollect.exam_session
UNION ALL SELECT 'submission',   count(*) FROM examcollect.submission
UNION ALL SELECT '-- ghim bởi append-only --', NULL
UNION ALL SELECT 'exam_session (event ghim)', count(DISTINCT exam_session_id)
  FROM examcollect.agent_connection_event
UNION ALL SELECT 'account (audit ghim)', count(DISTINCT actor_id)
  FROM examcollect.audit_log WHERE actor_id IS NOT NULL
ORDER BY 1;

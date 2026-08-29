-- Resets the DEV database back to exactly what a fresh setup produces:
-- the seed rows created by migration AddCourseRoomExamType, plus the two
-- demo accounts DEMO-RUNBOOK.md tells you to create.
--
-- Everything else is residue. The e2e suites create a semester, course,
-- class, enrollment and several accounts per file per run and never clean
-- up (they cannot: each run needs unique values, and unpicking them
-- afterwards would make a failing test destroy the next run's fixtures).
-- Manual verification runs leave exam sessions and submissions behind the
-- same way. After a few weeks of that, the account list and the exam
-- session list are almost entirely noise — which matters now that resource
-- management is getting real screens.
--
--   docker exec -i cine-postgres-1 psql -U examcollect_admin -d examcollect \
--     < scripts/reset-dev-data.sql
--
-- SAFE TO RE-RUN. Never point this at anything but a dev database: it is a
-- whitelist, so anything not listed below is deleted.
--
-- Deletion order follows the FK graph (every FK is ON DELETE RESTRICT, so
-- a wrong order fails loudly rather than cascading).
--
-- audit_log is deliberately absent: its append-only trigger refuses DELETE
-- (Security rule 4), so it can never be reset this way. It is empty today;
-- once entries exist, resetting means recreating the database.

BEGIN;

-- ---- Exam + collection data: none of it is seeded, all of it goes ------
DELETE FROM examcollect.teacher_review;
DELETE FROM examcollect.grading_result;
DELETE FROM examcollect.grade_export;
DELETE FROM examcollect.submission;
DELETE FROM examcollect.required_deliverable;
DELETE FROM examcollect.exam_material;
DELETE FROM examcollect.agent_connection_event;
DELETE FROM examcollect.exam_session;

-- ---- Academic structure: keep only the migration's seed ---------------
DELETE FROM examcollect.enrollment;
DELETE FROM examcollect.class;

DELETE FROM examcollect.rubric_criterion;
DELETE FROM examcollect.rubric;
DELETE FROM examcollect.calibration_run;

DELETE FROM examcollect.course
WHERE code NOT IN ('CS101', 'CS201');

DELETE FROM examcollect.semester
WHERE name <> 'Học kỳ 1 2026-2027';

DELETE FROM examcollect.room
WHERE name NOT IN ('Phòng máy A1', 'Phòng máy A2', 'Phòng máy B1');

-- ---- Accounts: keep the two the runbook documents ---------------------
-- demo-admin is kept on purpose, not just for symmetry: verifying the
-- teacher-only guard on POST /exam-sessions needs a real admin login.
DELETE FROM examcollect.cost_budget;
DELETE FROM examcollect.account
WHERE email NOT IN ('demo-teacher@example.com', 'demo-admin@example.com');

COMMIT;

SELECT 'account' AS t, count(*) FROM examcollect.account
UNION ALL SELECT 'semester', count(*) FROM examcollect.semester
UNION ALL SELECT 'course',   count(*) FROM examcollect.course
UNION ALL SELECT 'room',     count(*) FROM examcollect.room
UNION ALL SELECT 'class',    count(*) FROM examcollect.class
UNION ALL SELECT 'enrollment', count(*) FROM examcollect.enrollment
UNION ALL SELECT 'exam_session', count(*) FROM examcollect.exam_session
UNION ALL SELECT 'submission', count(*) FROM examcollect.submission
ORDER BY 1;

-- Resets the DEV database toward a clean slate for catalog re-seed.
-- After this script, run from apps/api:
--
--   pnpm seed:master-data
--
-- Legacy migration INSERTs (CS101/CS201, old room names) are NOT kept as
-- the demo source — they may still exist historically in migrate history
-- but catalog tables are wiped here and refilled by the seed script.
--
-- Kept accounts (bootstrap admins only):
--   bao@hui.edu.vn / phat@hui.edu.vn
-- Teachers and the rest of the catalog come back from seed:master-data.
--
--   docker exec -i cine-postgres-1 psql -U examcollect_admin -d examcollect \
--     < scripts/reset-dev-data.sql
--
-- SAFE TO RE-RUN. Never point this at anything but a dev database.
--
-- Deletion order follows the FK graph (every FK is ON DELETE RESTRICT).
--
-- audit_log is deliberately absent: its append-only trigger refuses DELETE.

BEGIN;

-- ---- Exam + collection data -------------------------------------------
DELETE FROM examcollect.teacher_review;
DELETE FROM examcollect.audit_sample_review;
DELETE FROM examcollect.score_computation;
DELETE FROM examcollect.criterion_waiver;
DELETE FROM examcollect.grading_attempt;
DELETE FROM examcollect.grading_result;
DELETE FROM examcollect.grade_export;
DELETE FROM examcollect.grading_test_case;
DELETE FROM examcollect.grading_test_bundle;
DELETE FROM examcollect.rule_price;
DELETE FROM examcollect.price_table_version;
DELETE FROM examcollect.error_rule_revision;
DELETE FROM examcollect.error_rule;
DELETE FROM examcollect.grading_anchor_snapshot;
DELETE FROM examcollect.grading_reference;
DELETE FROM examcollect.submission;
DELETE FROM examcollect.required_deliverable_entry;
DELETE FROM examcollect.required_deliverable;
DELETE FROM examcollect.exam_material;
DELETE FROM examcollect.session_roster;
DELETE FROM examcollect.agent_connection_event;
DELETE FROM examcollect.exam_session;

-- ---- Teacher-owned academic structure (not catalog) -------------------
DELETE FROM examcollect.enrollment;
DELETE FROM examcollect.class;

DELETE FROM examcollect.rubric_criterion;
DELETE FROM examcollect.rubric;
DELETE FROM examcollect.calibration_run;

-- ---- Catalog master data (re-seed with pnpm seed:master-data) ---------
DELETE FROM examcollect.student;
DELETE FROM examcollect.computer;
DELETE FROM examcollect.nominal_class;
DELETE FROM examcollect.course;
DELETE FROM examcollect.room;
DELETE FROM examcollect.semester;
DELETE FROM examcollect.academic_year;

-- ---- Accounts: keep only the two seed admins --------------------------
DELETE FROM examcollect.cost_budget;
DELETE FROM examcollect.account
WHERE email NOT IN (
  'bao@hui.edu.vn',
  'phat@hui.edu.vn'
);

COMMIT;

SELECT 'account' AS t, count(*) FROM examcollect.account
UNION ALL SELECT 'academic_year', count(*) FROM examcollect.academic_year
UNION ALL SELECT 'semester', count(*) FROM examcollect.semester
UNION ALL SELECT 'course', count(*) FROM examcollect.course
UNION ALL SELECT 'room', count(*) FROM examcollect.room
UNION ALL SELECT 'computer', count(*) FROM examcollect.computer
UNION ALL SELECT 'nominal_class', count(*) FROM examcollect.nominal_class
UNION ALL SELECT 'student', count(*) FROM examcollect.student
UNION ALL SELECT 'class', count(*) FROM examcollect.class
UNION ALL SELECT 'enrollment', count(*) FROM examcollect.enrollment
UNION ALL SELECT 'exam_session', count(*) FROM examcollect.exam_session
UNION ALL SELECT 'submission', count(*) FROM examcollect.submission
ORDER BY 1;

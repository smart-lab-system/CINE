-- Seeds a class roster into `enrollment` for DEV use, until the Excel
-- importer lands in a later phase.
--
-- Since `agent:join` began enforcing Security rule 1, a student ID with no
-- enrollment for the session's course is refused — which is the point, but
-- it also means an unseeded dev database cannot run the demo or the mock
-- agent at all. This script is the stopgap the design doc refers to.
--
--   docker exec -i cine-postgres-1 psql -U examcollect_admin -d examcollect \
--     < scripts/seed-roster.sql
--
-- Idempotent: re-running changes nothing (ON CONFLICT DO NOTHING against
-- uq_enrollment_course_student).
--
-- It seeds, for the demo course CS101:
--   * MSSVTEST01 … MSSVTEST20 — the identities apps/agent/src/mock-agent.ts
--     generates, so `--count 20` works out of the box. Match the count here
--     if you raise it there.
--   * SV20120001 / SV20120002 — two named students for driving the real
--     agent by hand.
--
-- Every row is attached to the demo teacher's class in that course, creating
-- the class if it does not exist yet.

BEGIN;

-- Create the demo class if it is not there yet. uq_class_course_name is a
-- unique INDEX rather than a named table constraint, so the conflict target
-- has to be the column list; ON CONFLICT ON CONSTRAINT fails against it.
INSERT INTO examcollect.class (course_id, name, teacher_id)
SELECT c.id, 'Nhóm 01', a.id
  FROM examcollect.course c,
       examcollect.account a
 WHERE c.code = 'CS101'
   AND a.email = 'demo-teacher@example.com'
ON CONFLICT (course_id, name) DO NOTHING;

WITH target_class AS (
  SELECT cl.id, cl.course_id, cl.teacher_id
    FROM examcollect.class cl
    JOIN examcollect.course c ON c.id = cl.course_id
   WHERE c.code = 'CS101' AND cl.name = 'Nhóm 01'
   LIMIT 1
), roster(mssv, full_name) AS (
  -- mock-agent identities: letters and digits only, matching
  -- ck_submission_mssv and the AgentJoinDto rule.
  SELECT 'MSSVTEST' || lpad(g::text, 2, '0'),
         'Sinh viên test ' || lpad(g::text, 2, '0')
    FROM generate_series(1, 20) AS g
  UNION ALL SELECT 'SV20120001', 'Nguyễn Văn A'
  UNION ALL SELECT 'SV20120002', 'Trần Thị B'
)
INSERT INTO examcollect.enrollment
  (student_mssv, student_name, course_id, home_class_id, home_teacher_id)
SELECT r.mssv, r.full_name, tc.course_id, tc.id, tc.teacher_id
  FROM roster r, target_class tc
ON CONFLICT (course_id, student_mssv) DO NOTHING;

COMMIT;

SELECT c.code AS course,
       cl.name AS class,
       count(e.id) AS enrolled
  FROM examcollect.enrollment e
  JOIN examcollect.course c  ON c.id = e.course_id
  JOIN examcollect.class  cl ON cl.id = e.home_class_id
 WHERE c.code = 'CS101'
 GROUP BY c.code, cl.name;

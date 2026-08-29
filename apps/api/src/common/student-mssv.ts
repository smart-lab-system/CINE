/**
 * The shape of a student id, in exactly one place.
 *
 * This is the application-side copy of the database's own CHECK constraints
 * — `ck_enrollment_mssv`, `ck_submission_mssv`, `ck_agent_connection_mssv`
 * — which all spell the same rule. It lives in `common/` rather than in one
 * module's DTO folder because three modules now need it: `exam-session`
 * validates it at join, `course` validates every row of an imported roster,
 * and a fourth copy of a regex is a fourth chance for one of them to drift
 * from the constraint that actually rejects the row.
 *
 * Enforced early on purpose: a student with a malformed id finds out in the
 * first ten seconds of joining, not when their work fails to save at the
 * end of the exam.
 */
export const STUDENT_MSSV_REGEX = /^[A-Za-z0-9]{4,20}$/;

export const STUDENT_MSSV_MESSAGE = 'studentId must be 4-20 letters or digits';

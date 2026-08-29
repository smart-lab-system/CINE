/**
 * Object-storage key layout. Decided up front and never derived from
 * anything a client sends — the same "decide in advance, don't guess"
 * stance the RequiredDeliverable design takes for submission identity.
 *
 * Every component is a uuid or an already-validated MSSV, so a key can
 * never contain a path separator, "..", or anything else that would let a
 * caller escape its own prefix. `buildSubmissionKey` re-checks that
 * anyway — see its doc comment.
 *
 *   submissions/{examSessionId}/{studentMssv}/{requiredDeliverableId}
 *
 * One object per (session, student, deliverable), overwritten on re-upload
 * — which mirrors uq_submission_identity exactly, so storage and the DB can
 * never disagree about how many files exist for a given triple.
 */
export const SUBMISSION_KEY_PREFIX = 'submissions';

/**
 * Periodic snapshots of a student's working folder, taken while the exam
 * runs:
 *
 *   backups/{examSessionId}/{studentMssv}/latest.zip
 *
 * ONE object per student per session, overwritten every time. No history:
 * this exists to survive a wiped machine, not to reconstruct how the work
 * was written, and keeping every snapshot of forty students for the length
 * of an exam would be a lot of storage for a question nobody asks.
 *
 * A backup is NOT a submission and never becomes one. Nothing here creates
 * a Submission row — restoring hands the work back to the student, who then
 * submits it the ordinary way.
 */
export const BACKUP_KEY_PREFIX = 'backups';
export const BACKUP_OBJECT_NAME = 'latest.zip';

/**
 * Presigned GET lifetime for a restore. Shorter than the upload TTL: a
 * restore happens immediately on reconnect and is one download of a few
 * hundred KB, so a longer grant would only widen the window in which a URL
 * captured off the wire still reads someone's work.
 */
export const DOWNLOAD_URL_TTL_SECONDS = 300;

/**
 * Presigned PUT lifetime. Long enough for a slow lab machine to finish a
 * large upload it has already started, short enough that a URL captured
 * off the wire is not a standing write grant for the rest of the exam.
 */
export const UPLOAD_URL_TTL_SECONDS = 900;

/**
 * Every key component must match this. uuids and MSSVs both do (MSSV is
 * additionally constrained by ck_submission_mssv at the DB level); the
 * check exists so a future caller passing something looser cannot quietly
 * build a key that walks out of its prefix.
 *
 * The negative lookahead is not redundant with the character class: ".."
 * is built entirely from allowed characters, so the class alone would let
 * it through. Same shape as SAFE_FILENAME_REGEX in
 * exam-session/dto/create-exam-session.dto.ts, and for the same reason.
 */
export const SAFE_KEY_SEGMENT_REGEX = /^(?!.*\.\.)[A-Za-z0-9_.-]+$/;

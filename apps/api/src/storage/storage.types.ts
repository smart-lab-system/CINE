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

/**
 * The teacher's exam materials — question paper, dataset, starter code:
 *
 *   materials/{examSessionId}/{examMaterialId}
 *
 * Keyed by the material's own id rather than its filename: two materials
 * may legitimately be called the same thing, and a key built from a
 * teacher-typed name is a key built from user input.
 *
 * Being IN storage is not the same as being RELEASED. Security rule 2 says
 * an agent may only receive these once start_time has passed, even if it
 * connected earlier — separating "allowed into the lobby" from "allowed to
 * see the exam". That gate is on the read path, not on the key.
 */
export const MATERIAL_KEY_PREFIX = 'materials';
export const BACKUP_OBJECT_NAME = 'latest.zip';

/**
 * Catalog VSIX binaries (Teacher Hub sync):
 *
 *   ide-extensions/{extensionPk}/{versionId}.vsix
 *
 * Same relative-key layout on MinIO (local) and Supabase Storage (prod);
 * only STORAGE_* env switches the backend.
 */
export const IDE_EXTENSION_KEY_PREFIX = 'ide-extensions';
export const IDE_EXTENSION_OBJECT_SUFFIX = '.vsix';
/** Folder under a version that holds unpacked VSIX entries + tree.json. */
export const IDE_EXTENSION_EXTRACTED_DIR = 'extracted';
export const IDE_EXTENSION_TREE_OBJECT = 'tree.json';

/**
 * One *logical* path segment inside an unpacked VSIX (tree.json / browse UI).
 * Broader than SAFE_KEY_SEGMENT_REGEX so names like `[Content_Types].xml`
 * survive, but still forbids separators and `..`. Object keys use
 * {@link encodeExtractStorageSegment}.
 */
export const EXTRACT_PATH_SEGMENT_REGEX = /^(?!^\.\.?$)[^/\0\\]+$/;

/**
 * Unescaped alphabet for extracted object-key segments.
 * Must stay inside Supabase Storage `isValidKey` (rejects `[` `]` `%` `#`
 * `~` and non-ASCII). Escape introducer is `!` + 2 hex digits — `!` is
 * allowed by that validator; `%` is not, so percent-encoding cannot be used.
 * @see https://github.com/supabase/storage/blob/master/src/storage/limits.ts
 */
const EXTRACT_STORAGE_SAFE_CHAR = /[A-Za-z0-9_.-]/;

/**
 * Encode one VSIX path segment for the object key (`!HH` per unsafe byte).
 * Logical names stay in tree.json; only the storage key is transformed.
 */
export function encodeExtractStorageSegment(segment: string): string {
  let out = '';
  for (const ch of segment) {
    if (EXTRACT_STORAGE_SAFE_CHAR.test(ch)) {
      out += ch;
      continue;
    }
    for (const byte of Buffer.from(ch, 'utf8')) {
      out += `!${byte.toString(16).toUpperCase().padStart(2, '0')}`;
    }
  }
  return out;
}

/** Encode every segment of a sanitized relative path for storage keys. */
export function encodeExtractStoragePath(relativePath: string): string {
  return relativePath
    .split('/')
    .filter((s) => s.length > 0)
    .map(encodeExtractStorageSegment)
    .join('/');
}

/**
 * Presigned GET lifetime for a restore. Shorter than the upload TTL: a
 * restore happens immediately on reconnect and is one download of a few
 * hundred KB, so a longer grant would only widen the window in which a URL
 * captured off the wire still reads someone's work.
 */
export const DOWNLOAD_URL_TTL_SECONDS = 300;

/**
 * Content-Type ép lên MỌI lượt tải bằng presigned GET. Object trong bucket dùng chung
 * (bài nộp, đề, sổ điểm) có thể mang kiểu do người nộp gửi; nếu trình duyệt đọc được
 * `text/html` hay `image/svg+xml` trên origin của storage thì đó là XSS. Ép về
 * octet-stream thì trình duyệt chỉ tải về, không render. Presigned URL không thể gắn
 * `X-Content-Type-Options: nosniff`, nên đây là cách chặn thay cho nosniff.
 */
export const DOWNLOAD_CONTENT_TYPE = 'application/octet-stream';

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

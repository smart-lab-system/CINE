/**
 * Hằng số giải nén bài nộp cho Code Browser (mirror VSIX extract limits).
 * concurrency × MAX_ARCHIVE_BYTES phải vừa RAM container.
 */

export const SUBMISSION_EXTRACT_MAX_ARCHIVE_BYTES = 100 * 1024 * 1024;
export const SUBMISSION_EXTRACT_MAX_ENTRIES = 10_000;
export const SUBMISSION_EXTRACT_MAX_UNCOMPRESSED_BYTES = 500 * 1024 * 1024;
export const SUBMISSION_EXTRACT_MAX_FILE_BYTES = 20 * 1024 * 1024;
export const SUBMISSION_EXTRACT_CONCURRENCY = 1;

export const SUBMISSION_EXTRACT_QUEUE = 'submission-extract';

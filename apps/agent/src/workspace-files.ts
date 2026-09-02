/**
 * Path-traversal defense and required-file creation for a student's
 * workspace folder. Extracted from cli.ts (ported verbatim, no behavior
 * change) so session-controller.ts could reuse it without pulling in
 * cli.ts's own `main()` module-level side effect (cli.ts itself is now
 * retired — design spec §8.4 — but the extraction it prompted stands on
 * its own merit regardless), and so this — the core security property
 * this whole area exists to prove — has direct unit test coverage of its
 * own, which it did not have before this extraction.
 *
 * Layered, independently-redundant checks — a regex-only check can miss
 * encoding tricks that only surface once the path is actually resolved,
 * so the resolved-path prefix check is the real defense; the checks
 * before it exist to fail fast with a specific, readable reason before
 * ever touching the filesystem.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ReadDeliverableContent, RequiredDeliverable } from './submission-uploader';

export const WORKSPACE_DIRNAME = 'exam-workspace';

// Mirrors SAFE_FILENAME_CHARSET_REGEX's character class from
// apps/api/src/exam-session/dto/create-exam-session.dto.ts. That regex
// protects a DIFFERENT trust boundary — it validates what a *teacher* may
// declare when creating a session. This one re-validates what the *server*
// echoes back to THIS process over the wire in `agent:join:ack`. The
// backend having already validated the filename at write time is not a
// reason to skip re-checking it here: never trust a filename received over
// the network for constructing a filesystem path without re-checking it
// yourself.
export const SAFE_FILENAME_CHARSET_REGEX = /^[A-Za-z0-9_.-]+$/;

// Windows treats these as reserved device names REGARDLESS of extension or
// case ("NUL.txt" still resolves to the NUL device, not a file called
// "NUL.txt") — none of them are caught by the checks above (no separator,
// no "..", pure letters/digits), so a required filename equal to one would
// silently write to a device instead of a real file. Checked defensively
// on every platform — this app's real deployment target is Windows lab
// machines.
const WINDOWS_RESERVED_DEVICE_NAMES = new Set([
  'con', 'prn', 'aux', 'nul',
  'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9',
  'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9',
]);

export interface FilenameValidationResult {
  ok: boolean;
  reason?: string;
  resolvedPath?: string;
}

export function validateFilename(workspaceDir: string, filename: unknown): FilenameValidationResult {
  if (typeof filename !== 'string' || filename.length === 0) {
    return { ok: false, reason: `không phải chuỗi hợp lệ (${JSON.stringify(filename)})` };
  }
  if (filename.includes('/') || filename.includes('\\')) {
    return { ok: false, reason: `chứa dấu phân cách đường dẫn ("/" hoặc "\\"): "${filename}"` };
  }
  if (filename.includes('..')) {
    return { ok: false, reason: `chứa chuỗi ".." (path traversal): "${filename}"` };
  }
  if (!SAFE_FILENAME_CHARSET_REGEX.test(filename)) {
    return {
      ok: false,
      reason: `chứa ký tự không cho phép (chỉ cho phép chữ/số/_/-/.): "${filename}"`,
    };
  }
  // "NUL", "NUL.txt", "com1.py", ... — the part before the first "." is
  // what Windows matches against the reserved device name, case-insensitive.
  if (WINDOWS_RESERVED_DEVICE_NAMES.has(filename.split('.')[0].toLowerCase())) {
    return {
      ok: false,
      reason: `trùng tên thiết bị dành riêng của Windows (CON/PRN/AUX/NUL/COM1-9/LPT1-9): "${filename}"`,
    };
  }

  // THE actual defense: resolve the joined path to an absolute path and
  // confirm it is still strictly inside the resolved workspace directory.
  const resolvedWorkspace = path.resolve(workspaceDir);
  const resolvedTarget = path.resolve(path.join(workspaceDir, filename));
  const requiredPrefix = resolvedWorkspace + path.sep;
  if (!resolvedTarget.startsWith(requiredPrefix)) {
    return {
      ok: false,
      reason: `đường dẫn sau khi resolve nằm ngoài thư mục workspace: "${filename}" -> "${resolvedTarget}"`,
    };
  }

  return { ok: true, resolvedPath: resolvedTarget };
}

/**
 * studentId is LOCAL input (typed into the join form) rather than
 * server-supplied — but it still becomes a directory name
 * (`./exam-workspace/<studentId>/`), so it gets the same allow-list
 * treatment before this process ever touches the filesystem with it.
 */
export function isSafeForPathSegment(value: string): boolean {
  return SAFE_FILENAME_CHARSET_REGEX.test(value) && !value.includes('..');
}

export function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

export interface CreateSubmissionFilesResult {
  createdCount: number;
  /** Per-file outcome, in `requiredFiles` order — this is the checklist
   *  the detail window renders. `created: true` covers both "wrote a new
   *  empty file" and "already existed" (EEXIST) — both mean the file is
   *  there and the student can find it, which is the property this
   *  function is responsible for. */
  files: { filename: string; created: boolean }[];
}

/**
 * Creates `workspaceDir` and, for each entry in `requiredFiles`, an empty
 * file inside it — after independently re-validating the filename. Invalid
 * entries are skipped (reported via `files[].created === false`), never
 * written, and never throw.
 *
 * Uses the `wx` flag (`O_CREAT | O_EXCL`) rather than the default `w`:
 * socket.io reconnects (a network blip, not a fresh exam attempt) re-emit
 * `agent:join` and get a fresh `agent:join:ack` — this function then runs
 * again for the SAME files. A plain write would silently truncate whatever
 * the student had already written into them. `wx` refuses to write if the
 * path already exists (`EEXIST`), so an existing file — the student's own
 * in-progress work, or a symlink someone planted at that path — is left
 * completely untouched and still counted as "created".
 */
export function createSubmissionFiles(
  workspaceDir: string,
  requiredFiles: unknown,
): CreateSubmissionFilesResult {
  fs.mkdirSync(workspaceDir, { recursive: true });

  if (!Array.isArray(requiredFiles)) {
    return { createdCount: 0, files: [] };
  }

  const files: { filename: string; created: boolean }[] = [];
  let createdCount = 0;
  for (const filename of requiredFiles) {
    const result = validateFilename(workspaceDir, filename);
    if (!result.ok) {
      // filename is not necessarily a string here — String() covers that.
      files.push({ filename: String(filename), created: false });
      continue;
    }
    try {
      fs.writeFileSync(result.resolvedPath!, '', { flag: 'wx' });
      createdCount++;
      files.push({ filename, created: true });
    } catch (error) {
      if (isErrnoException(error) && error.code === 'EEXIST') {
        createdCount++;
        files.push({ filename, created: true });
        continue;
      }
      files.push({ filename, created: false });
    }
  }
  return { createdCount, files };
}

/**
 * Reads one deliverable's bytes out of the workspace for upload.
 *
 * Returns null when the file is not there — the student deleted it, or
 * never created it. That is a reportable outcome, not an error: the other
 * deliverables must still be collected (see uploadAllDeliverables).
 *
 * The filename is re-validated here even though createSubmissionFiles
 * already validated it on the way in. The server is not a trusted source
 * for a path at upload time any more than it was at join time, and the ack
 * that produced this list arrived over the same untrusted socket.
 */
export function makeWorkspaceReader(workspaceDir: string): ReadDeliverableContent {
  return async (deliverable: RequiredDeliverable): Promise<Buffer | null> => {
    const validation = validateFilename(workspaceDir, deliverable.requiredFilename);
    if (!validation.ok) {
      throw new Error(`filename không an toàn — ${validation.reason}`);
    }
    try {
      return await fs.promises.readFile(validation.resolvedPath!);
    } catch (error) {
      if (isErrnoException(error) && error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  };
}

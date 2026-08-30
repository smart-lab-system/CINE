/**
 * Periodic snapshot of the student's working folder, and the rules for
 * putting one back.
 *
 * Reconnect splits into two cases that look alike and are not. A network
 * blip with the machine intact is ALREADY handled — `cli.ts` creates its
 * files with the `wx` flag, so an agent that comes back never truncates
 * work that is already there. The case this file exists for is the other
 * one: a machine wiped or swapped mid-exam, where the work is simply gone
 * and no amount of careful file handling brings it back.
 *
 * Everything here is deliberately free of sockets and of the archive
 * format, so the rules can be tested against a real filesystem without
 * either.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Folders that are produced rather than written.
 *
 * The design names the first four. The rest are the same thing in other
 * ecosystems, and the point of the list is not to be exhaustive but to stop
 * a dependency tree being uploaded from forty machines every four minutes —
 * the difference between a snapshot that finishes and one that does not.
 */
export const IGNORED_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '__pycache__',
  '.venv',
  'venv',
  'target',
  'obj',
  '.next',
  '.idea',
  '.vscode',
]);

/**
 * Extensions a submission could plausibly be — documents, code, data and
 * photographed answers.
 *
 * A whitelist rather than a blocklist, following the same stance the rest of
 * the project takes: a file nobody thought about is excluded rather than
 * uploaded. A student whose work is in an unusual format still submits it
 * normally at finalize; only the safety net skips it.
 */
export const SNAPSHOT_EXTENSIONS = new Set([
  '.txt', '.md', '.rtf', '.csv', '.json', '.xml', '.yml', '.yaml',
  '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.pdf', '.odt',
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.heic',
  '.py', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.java', '.kt',
  '.c', '.h', '.cpp', '.hpp', '.cc', '.cs', '.go', '.rs', '.rb', '.php',
  '.swift', '.m', '.r', '.scala', '.pl', '.lua', '.dart',
  '.html', '.htm', '.css', '.scss', '.sql', '.sh', '.bat', '.ps1',
  '.ipynb', '.env.example',
]);

/** One file is never someone's answer past this. */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

/** And a whole snapshot is never worth more than this over a lab network. */
export const MAX_TOTAL_BYTES = 50 * 1024 * 1024;

/** Four minutes. One value, not a range — two agents must not disagree. */
export const SNAPSHOT_INTERVAL_MS = 4 * 60_000;

export interface SnapshotFile {
  /** Always forward-slashed, so an archive written on Windows restores anywhere. */
  relativePath: string;
  absolutePath: string;
  size: number;
}

/**
 * Everything in the workspace worth keeping, deepest paths included.
 *
 * A missing workspace is an empty snapshot, not an error: the agent may
 * take its first snapshot before the student has saved anything, and a
 * throw there would kill the timer for the rest of the exam.
 */
export function collectSnapshotFiles(workspaceDir: string): SnapshotFile[] {
  const files: SnapshotFile[] = [];
  let total = 0;

  const walk = (dir: string, prefix: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.isSymbolicLink()) {
        // A link can point anywhere, including outside the workspace. The
        // snapshot follows nothing it was not handed directly.
        continue;
      }

      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolute = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name)) {
          walk(absolute, relative);
        }
        continue;
      }

      if (!entry.isFile() || !SNAPSHOT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        continue;
      }

      let size: number;
      try {
        size = fs.statSync(absolute).size;
      } catch {
        continue;
      }

      if (size > MAX_FILE_BYTES || total + size > MAX_TOTAL_BYTES) {
        continue;
      }

      total += size;
      files.push({ relativePath: relative, absolutePath: absolute, size });
    }
  };

  walk(workspaceDir, '');
  return files;
}

/**
 * Where a zip entry is allowed to land, or null.
 *
 * The archive was written by this agent, but it comes back through storage,
 * and an entry that climbs out of its own directory is the oldest trick
 * there is. Resolving and then checking containment catches every spelling
 * of it — `../`, an absolute path, or a `..` buried mid-path — rather than
 * trying to enumerate them.
 */
export function resolveWithinWorkspace(
  workspaceDir: string,
  entryPath: string,
): string | null {
  if (!entryPath || entryPath.endsWith('/') || entryPath.endsWith('\\')) {
    return null;
  }
  // A Windows-style absolute path is not absolute to posix `path` on Linux,
  // so it would resolve INSIDE the workspace and pass the containment check.
  // Rejected explicitly rather than relied upon to fail.
  if (path.isAbsolute(entryPath) || /^[A-Za-z]:[\\/]/.test(entryPath)) {
    return null;
  }

  const root = path.resolve(workspaceDir);
  const resolved = path.resolve(root, entryPath);
  return resolved === root || resolved.startsWith(root + path.sep) ? resolved : null;
}

/**
 * Whether a restore may write over what is at this path.
 *
 * The rule is content-based, and that is the whole point. "Restore what is
 * missing" reads as the obvious rule and never fires: the agent creates
 * every required file as part of joining, so by the time a restore is
 * considered the files always exist — on a wiped machine they exist and are
 * EMPTY. The one case the backup was built for would have been the one case
 * it skipped.
 *
 * Empty or absent is replaced; anything with content is left alone. The
 * trade is deliberate: handing a student back their own earlier content is
 * recoverable, losing their work is not.
 */
export function shouldRestoreOver(absolutePath: string): boolean {
  try {
    return fs.statSync(absolutePath).size === 0;
  } catch {
    // Not there at all.
    return true;
  }
}

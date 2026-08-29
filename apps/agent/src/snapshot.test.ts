import { describe, expect, it } from 'vitest';
import {
  collectSnapshotFiles,
  resolveWithinWorkspace,
  shouldRestoreOver,
} from './snapshot';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

/**
 * The rules that decide what goes into a snapshot and what comes back out.
 *
 * The restore rule is the one an earlier draft of the design got wrong, and
 * the mistake was invisible: gating a restore on "the file is missing"
 * never fires, because the agent creates the required files as part of
 * joining. On a wiped machine they exist and are empty, so the student's
 * work would have been silently lost in exactly the case the backup was
 * built for.
 */

function tmpWorkspace(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'examcollect-snapshot-'));
}

function write(root: string, relative: string, content: string): void {
  const full = path.join(root, relative);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

describe('collectSnapshotFiles', () => {
  it("takes the student's work, in nested folders too", () => {
    const root = tmpWorkspace();
    write(root, 'Cau1.docx', 'bai lam');
    write(root, 'src/main.py', 'print(1)');

    const files = collectSnapshotFiles(root);

    expect(files.map((f) => f.relativePath).sort()).toEqual(['Cau1.docx', 'src/main.py']);
  });

  it('leaves out the folders that are rebuilt, not written', () => {
    const root = tmpWorkspace();
    write(root, 'Cau1.docx', 'bai lam');
    write(root, 'node_modules/left-pad/index.js', 'x');
    write(root, 'dist/bundle.js', 'x');
    write(root, 'build/out.js', 'x');
    write(root, '.git/HEAD', 'ref');

    const files = collectSnapshotFiles(root);

    // A student's dependency tree is not their work, and uploading it every
    // four minutes from forty machines is the difference between a snapshot
    // that finishes and one that does not.
    expect(files.map((f) => f.relativePath)).toEqual(['Cau1.docx']);
  });

  it('takes only extensions a submission could plausibly be', () => {
    const root = tmpWorkspace();
    write(root, 'Cau1.docx', 'ok');
    write(root, 'notes.txt', 'ok');
    write(root, 'a.exe', 'no');
    write(root, 'core.dmp', 'no');
    write(root, 'noextension', 'no');

    const files = collectSnapshotFiles(root);

    expect(files.map((f) => f.relativePath).sort()).toEqual(['Cau1.docx', 'notes.txt']);
  });

  it('skips a single file too large to be someone\'s answer', () => {
    const root = tmpWorkspace();
    write(root, 'Cau1.docx', 'ok');
    write(root, 'huge.csv', 'x'.repeat(11 * 1024 * 1024));

    const files = collectSnapshotFiles(root);

    expect(files.map((f) => f.relativePath)).toEqual(['Cau1.docx']);
  });

  it('returns nothing for a workspace that does not exist yet', () => {
    expect(collectSnapshotFiles(path.join(os.tmpdir(), 'examcollect-nope-' + Date.now()))).toEqual(
      [],
    );
  });
});

describe('resolveWithinWorkspace', () => {
  const root = path.resolve('/tmp/ws');

  it('accepts a nested relative path', () => {
    expect(resolveWithinWorkspace(root, 'src/main.py')).toBe(
      path.join(root, 'src', 'main.py'),
    );
  });

  it('refuses a path that climbs out of the workspace', () => {
    // The archive is written by this agent, but it comes back through
    // storage — and a zip entry that escapes its own directory is the
    // oldest trick there is.
    expect(resolveWithinWorkspace(root, '../evil.txt')).toBeNull();
    expect(resolveWithinWorkspace(root, 'a/../../evil.txt')).toBeNull();
  });

  it('refuses an absolute path', () => {
    expect(resolveWithinWorkspace(root, '/etc/passwd')).toBeNull();
    expect(resolveWithinWorkspace(root, 'C:\\Windows\\System32\\x.dll')).toBeNull();
  });

  it('refuses an empty or directory entry', () => {
    expect(resolveWithinWorkspace(root, '')).toBeNull();
    expect(resolveWithinWorkspace(root, 'src/')).toBeNull();
  });
});

describe('shouldRestoreOver', () => {
  it('restores when nothing is there', () => {
    const root = tmpWorkspace();

    expect(shouldRestoreOver(path.join(root, 'Cau1.docx'))).toBe(true);
  });

  it('restores over an empty file', () => {
    const root = tmpWorkspace();
    write(root, 'Cau1.docx', '');

    // THE case this exists for. A wiped machine reruns the agent, which
    // creates every required file empty as part of joining — so by the time
    // a restore is considered, the files are always there. A rule of
    // "restore what is missing" would never fire, and the work would be
    // lost silently.
    expect(shouldRestoreOver(path.join(root, 'Cau1.docx'))).toBe(true);
  });

  it('never overwrites a file with something in it', () => {
    const root = tmpWorkspace();
    write(root, 'Cau1.docx', 'bai lam cua sinh vien');

    // An intact machine after a network blip. Handing back a four-minute-old
    // snapshot over live work would be the backup destroying what it exists
    // to protect.
    expect(shouldRestoreOver(path.join(root, 'Cau1.docx'))).toBe(false);
  });
});

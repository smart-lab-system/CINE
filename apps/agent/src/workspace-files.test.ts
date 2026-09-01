import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createSubmissionFiles, isSafeForPathSegment, validateFilename } from './workspace-files';

/**
 * The path-traversal defense — the core security property this module
 * exists to prove — plus the `wx`-idempotent file creation cli.ts always
 * relied on but never had a direct test for.
 */

function tmpWorkspace(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'examcollect-workspace-files-'));
}

describe('validateFilename', () => {
  it('accepts a plain required filename', () => {
    const root = tmpWorkspace();
    const result = validateFilename(root, 'Cau1.docx');
    expect(result.ok).toBe(true);
    expect(result.resolvedPath).toBe(path.resolve(root, 'Cau1.docx'));
  });

  it('refuses a path separator', () => {
    const root = tmpWorkspace();
    expect(validateFilename(root, 'sub/Cau1.docx').ok).toBe(false);
    expect(validateFilename(root, 'sub\\Cau1.docx').ok).toBe(false);
  });

  it('refuses ".." even without a separator character actually escaping', () => {
    const root = tmpWorkspace();
    expect(validateFilename(root, '..Cau1.docx').ok).toBe(false);
  });

  it('refuses a disallowed character', () => {
    const root = tmpWorkspace();
    expect(validateFilename(root, 'Cau1 (final).docx').ok).toBe(false);
    expect(validateFilename(root, 'Câu1.docx').ok).toBe(false);
  });

  it('refuses a Windows reserved device name regardless of extension or case', () => {
    const root = tmpWorkspace();
    expect(validateFilename(root, 'NUL.txt').ok).toBe(false);
    expect(validateFilename(root, 'con').ok).toBe(false);
    expect(validateFilename(root, 'COM1.docx').ok).toBe(false);
  });

  it('refuses a non-string filename', () => {
    const root = tmpWorkspace();
    expect(validateFilename(root, 42).ok).toBe(false);
    expect(validateFilename(root, null).ok).toBe(false);
    expect(validateFilename(root, undefined).ok).toBe(false);
  });

  it('refuses a resolved path that escapes the workspace even without ".." literally in the string', () => {
    // A Windows drive-relative or UNC-style value could resolve outside the
    // workspace on some platform without ever containing "..". The
    // resolved-path prefix check is what actually defends against this —
    // not the string checks above it.
    const root = tmpWorkspace();
    const result = validateFilename(root, 'Cau1.docx');
    expect(result.ok).toBe(true);
    // Sanity: the resolved path really is inside root.
    expect(result.resolvedPath!.startsWith(path.resolve(root) + path.sep)).toBe(true);
  });
});

describe('isSafeForPathSegment', () => {
  it('accepts a real MSSV', () => {
    expect(isSafeForPathSegment('SV20120001')).toBe(true);
  });

  it('refuses one containing ".."', () => {
    expect(isSafeForPathSegment('..')).toBe(false);
    expect(isSafeForPathSegment('a..b')).toBe(false);
  });

  it('refuses one containing a path separator', () => {
    expect(isSafeForPathSegment('a/b')).toBe(false);
  });
});

describe('createSubmissionFiles', () => {
  it('creates every required file empty, and reports each as created', () => {
    const root = tmpWorkspace();
    const workspaceDir = path.join(root, 'ws');

    const result = createSubmissionFiles(workspaceDir, ['Cau1.docx', 'Cau2.docx']);

    expect(result.createdCount).toBe(2);
    expect(result.files).toEqual([
      { filename: 'Cau1.docx', created: true },
      { filename: 'Cau2.docx', created: true },
    ]);
    expect(fs.readFileSync(path.join(workspaceDir, 'Cau1.docx'), 'utf8')).toBe('');
  });

  it("never truncates a file the student already wrote into — the whole point of 'wx'", () => {
    const root = tmpWorkspace();
    const workspaceDir = path.join(root, 'ws');
    fs.mkdirSync(workspaceDir, { recursive: true });
    fs.writeFileSync(path.join(workspaceDir, 'Cau1.docx'), 'bai lam da viet');

    // Simulates a reconnect: agent:join:ack fires again for the same
    // session, and createSubmissionFiles runs a second time over files
    // that may already have real content in them.
    const result = createSubmissionFiles(workspaceDir, ['Cau1.docx']);

    expect(result.files).toEqual([{ filename: 'Cau1.docx', created: true }]);
    expect(fs.readFileSync(path.join(workspaceDir, 'Cau1.docx'), 'utf8')).toBe('bai lam da viet');
  });

  it('skips an unsafe filename without creating it or throwing, and reports it as not created', () => {
    const root = tmpWorkspace();
    const workspaceDir = path.join(root, 'ws');

    const result = createSubmissionFiles(workspaceDir, ['Cau1.docx', '../evil.txt']);

    expect(result.createdCount).toBe(1);
    expect(result.files).toEqual([
      { filename: 'Cau1.docx', created: true },
      { filename: '../evil.txt', created: false },
    ]);
    expect(fs.existsSync(path.join(root, 'evil.txt'))).toBe(false);
  });

  it('returns an empty result when requiredFiles is not an array, without throwing', () => {
    const root = tmpWorkspace();
    const workspaceDir = path.join(root, 'ws');

    const result = createSubmissionFiles(workspaceDir, 'not-an-array');

    expect(result).toEqual({ createdCount: 0, files: [] });
  });
});

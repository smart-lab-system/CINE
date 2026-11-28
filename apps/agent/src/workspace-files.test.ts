import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  archiveStemOf,
  createSubmissionFiles,
  isSafeForPathSegment,
  makeWorkspaceReader,
  validateFilename,
} from './workspace-files';

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

describe('archiveStemOf', () => {
  it('bỏ đuôi .zip/.rar', () => {
    expect(archiveStemOf('BaiThi.zip')).toBe('BaiThi');
    expect(archiveStemOf('BaiThi.RAR')).toBe('BaiThi');
    expect(archiveStemOf('P01_SV_Nguyen.zip')).toBe('P01_SV_Nguyen');
  });

  it('null khi không phải archive', () => {
    expect(archiveStemOf('Cau1.docx')).toBeNull();
  });
});

describe('createSubmissionFiles', () => {
  it('tạo mọi file KHÔNG PHẢI file nén dưới dạng rỗng', () => {
    const root = tmpWorkspace();
    const workspaceDir = path.join(root, 'ws');

    const result = createSubmissionFiles(workspaceDir, ['Cau1.docx', 'Cau2.docx']);

    expect(result.createdCount).toBe(2);
    expect(result.files.map((f) => f.filename)).toEqual(['Cau1.docx', 'Cau2.docx']);
    expect(fs.readFileSync(path.join(workspaceDir, 'Cau1.docx'), 'utf8')).toBe('');
  });

  it('.zip tạo thư mục stem, KHÔNG tạo file .zip ở root', () => {
    const root = tmpWorkspace();
    const workspaceDir = path.join(root, 'ws');

    const result = createSubmissionFiles(workspaceDir, [
      { requiredFilename: 'BaiThi.zip', entries: ['Main.java'] },
    ]);

    expect(result.createdCount).toBe(1);
    expect(result.files[0]!.created).toBe(true);
    expect(fs.existsSync(path.join(workspaceDir, 'BaiThi.zip'))).toBe(false);
    expect(fs.statSync(path.join(workspaceDir, 'BaiThi')).isDirectory()).toBe(true);
    expect(fs.readFileSync(path.join(workspaceDir, 'BaiThi', 'Main.java'), 'utf8')).toBe('');
  });

  it('.rar cũng tạo thư mục stem + entries', () => {
    const root = tmpWorkspace();
    const workspaceDir = path.join(root, 'ws');

    const result = createSubmissionFiles(workspaceDir, [
      { requiredFilename: 'BaiThi.rar', entries: ['Main.java'] },
    ]);

    expect(result.files[0]!.created).toBe(true);
    expect(fs.existsSync(path.join(workspaceDir, 'BaiThi.rar'))).toBe(false);
    expect(fs.existsSync(path.join(workspaceDir, 'BaiThi', 'Main.java'))).toBe(true);
  });

  it('không đè entry sinh viên đã viết (wx)', () => {
    const root = tmpWorkspace();
    const workspaceDir = path.join(root, 'ws');
    fs.mkdirSync(path.join(workspaceDir, 'BaiThi'), { recursive: true });
    fs.writeFileSync(path.join(workspaceDir, 'BaiThi', 'Main.java'), 'class Main {}');

    createSubmissionFiles(workspaceDir, [
      { requiredFilename: 'BaiThi.zip', entries: ['Main.java'] },
    ]);

    expect(fs.readFileSync(path.join(workspaceDir, 'BaiThi', 'Main.java'), 'utf8')).toBe(
      'class Main {}',
    );
  });

  it('chuỗi tên file vẫn được (không entries)', () => {
    const root = tmpWorkspace();
    const workspaceDir = path.join(root, 'ws');

    const result = createSubmissionFiles(workspaceDir, ['BaiThi.zip']);

    expect(result.files[0]!.created).toBe(true);
    expect(fs.statSync(path.join(workspaceDir, 'BaiThi')).isDirectory()).toBe(true);
  });

  it("never truncates a file the student already wrote into - the whole point of 'wx'", () => {
    const root = tmpWorkspace();
    const workspaceDir = path.join(root, 'ws');
    fs.mkdirSync(workspaceDir, { recursive: true });
    fs.writeFileSync(path.join(workspaceDir, 'Cau1.docx'), 'bai lam da viet');

    const result = createSubmissionFiles(workspaceDir, ['Cau1.docx']);

    expect(result.files).toEqual([{ filename: 'Cau1.docx', created: true }]);
    expect(fs.readFileSync(path.join(workspaceDir, 'Cau1.docx'), 'utf8')).toBe('bai lam da viet');
  });

  it('skips an unsafe filename without creating it or throwing', () => {
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

describe('makeWorkspaceReader', () => {
  const deliverable = (requiredFilename: string) => ({
    id: 'd1',
    requiredFilename,
    deliverableType: 'document',
  });

  it("reads a required file's bytes", async () => {
    const root = tmpWorkspace();
    fs.writeFileSync(path.join(root, 'Cau1.docx'), 'bai lam');
    const read = makeWorkspaceReader(root);

    const content = await read(deliverable('Cau1.docx'));

    expect(content?.toString('utf8')).toBe('bai lam');
  });

  it('returns null for a required file the student never created', async () => {
    const root = tmpWorkspace();
    const read = makeWorkspaceReader(root);

    expect(await read(deliverable('Cau1.docx'))).toBeNull();
  });

  it('throws rather than reading an unsafe filename', async () => {
    const root = tmpWorkspace();
    const read = makeWorkspaceReader(root);

    await expect(read(deliverable('../evil.txt'))).rejects.toThrow(/không an toàn/);
  });
});

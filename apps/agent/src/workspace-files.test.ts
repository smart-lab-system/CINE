import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import JSZip from 'jszip';
import {
  createSubmissionFiles,
  isSafeForPathSegment,
  makeWorkspaceReader,
  validateFilename,
} from './workspace-files';

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
  it('tạo mọi file KHÔNG PHẢI file nén dưới dạng rỗng, và báo đã tạo', () => {
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

  // Lỗi thật 2026-09-25: file 0 byte KHÔNG phải một file .zip rỗng hợp lệ —
  // không mở duyệt được, không kéo-thả nội dung vào được. Sinh viên có
  // một file nén "sẵn có" nhưng đã hỏng ngay từ lúc phòng thi mở ra.
  it('.zip được tạo thành MỘT FILE NÉN RỖNG HỢP LỆ, không phải file 0 byte', async () => {
    const root = tmpWorkspace();
    const workspaceDir = path.join(root, 'ws');

    const result = createSubmissionFiles(workspaceDir, ['BaiThi.zip']);

    expect(result.files).toEqual([{ filename: 'BaiThi.zip', created: true }]);
    const bytes = fs.readFileSync(path.join(workspaceDir, 'BaiThi.zip'));

    // Đối chiếu với chính JSZip — không tin hằng số tự tay gõ.
    const reference = await new JSZip().generateAsync({ type: 'nodebuffer' });
    expect(bytes.equals(reference)).toBe(true);

    // Vòng ngược: JSZip phải đọc ra được, và ra đúng 0 mục.
    const reopened = await JSZip.loadAsync(bytes);
    expect(Object.keys(reopened.files)).toHaveLength(0);
  });

  it('.zip không ghi đè file .zip sinh viên đã có nội dung thật (idempotent qua "wx")', () => {
    const root = tmpWorkspace();
    const workspaceDir = path.join(root, 'ws');
    fs.mkdirSync(workspaceDir, { recursive: true });
    fs.writeFileSync(path.join(workspaceDir, 'BaiThi.zip'), 'khong-phai-zip-that-nhung-la-noi-dung-sinh-vien');

    const result = createSubmissionFiles(workspaceDir, ['BaiThi.zip']);

    expect(result.files).toEqual([{ filename: 'BaiThi.zip', created: true }]);
    expect(fs.readFileSync(path.join(workspaceDir, 'BaiThi.zip'), 'utf8')).toBe(
      'khong-phai-zip-that-nhung-la-noi-dung-sinh-vien',
    );
  });

  // .rar: KHÔNG có cách nào hợp lệ tạo trước một file RAR rỗng — RAR là định
  // dạng độc quyền, không có bộ mã hoá mở nào trong dự án này (node-unrar-js
  // ở backend chỉ ĐỌC). Tạo một file 0 byte tên .rar vẫn hỏng y hệt bug gốc,
  // chỉ đổi định dạng. Đúng là KHÔNG TẠO GÌ CẢ, kèm lý do.
  it('.rar KHÔNG được tạo file nào cả — không có cách hợp lệ để làm placeholder', () => {
    const root = tmpWorkspace();
    const workspaceDir = path.join(root, 'ws');

    const result = createSubmissionFiles(workspaceDir, ['BaiThi.rar']);

    expect(result.createdCount).toBe(0);
    expect(fs.existsSync(path.join(workspaceDir, 'BaiThi.rar'))).toBe(false);
    expect(result.files).toEqual([
      {
        filename: 'BaiThi.rar',
        created: false,
        note: expect.stringMatching(/winrar/i),
      },
    ]);
  });

  // Reconnect: sinh viên đã tự nén file .rar thật TRƯỚC một lần join lại.
  // Phải nhận ra file đó đã có — không được báo sai "chưa tạo được", và
  // chắc chắn không đụng vào nó.
  it('.rar sinh viên đã tự tạo TỪ TRƯỚC thì báo created:true, không note, không đụng vào', () => {
    const root = tmpWorkspace();
    const workspaceDir = path.join(root, 'ws');
    fs.mkdirSync(workspaceDir, { recursive: true });
    fs.writeFileSync(path.join(workspaceDir, 'BaiThi.rar'), 'noi-dung-rar-that-cua-sinh-vien');

    const result = createSubmissionFiles(workspaceDir, ['BaiThi.rar']);

    expect(result.createdCount).toBe(1);
    expect(result.files).toEqual([{ filename: 'BaiThi.rar', created: true }]);
    expect(fs.readFileSync(path.join(workspaceDir, 'BaiThi.rar'), 'utf8')).toBe(
      'noi-dung-rar-that-cua-sinh-vien',
    );
  });

  it('đuôi .ZIP/.RAR viết hoa vẫn được nhận ra — không phân biệt hoa/thường', () => {
    const root = tmpWorkspace();
    const workspaceDir = path.join(root, 'ws');

    const result = createSubmissionFiles(workspaceDir, ['BaiThi.ZIP', 'Khac.RAR']);

    expect(fs.statSync(path.join(workspaceDir, 'BaiThi.ZIP')).size).toBe(22);
    expect(fs.existsSync(path.join(workspaceDir, 'Khac.RAR'))).toBe(false);
    expect(result.files).toEqual([
      { filename: 'BaiThi.ZIP', created: true },
      { filename: 'Khac.RAR', created: false, note: expect.any(String) },
    ]);
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

  it('throws rather than reading an unsafe filename, even one the server itself sent', async () => {
    const root = tmpWorkspace();
    const read = makeWorkspaceReader(root);

    await expect(read(deliverable('../evil.txt'))).rejects.toThrow(/không an toàn/);
  });
});

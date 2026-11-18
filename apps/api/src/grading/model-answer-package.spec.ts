import JSZip from 'jszip';
import {
  extractModelAnswerZip,
  isPdfFilename,
  packageKindFromFilename,
  sanitizeZipEntryPath,
} from './model-answer-package';

describe('model-answer-package', () => {
  it('suy kind từ tên file', () => {
    expect(packageKindFromFilename('dap-an.zip')).toBe('zip');
    expect(packageKindFromFilename('DAP-AN.ZIP')).toBe('zip');
    expect(packageKindFromFilename('dap-an.pdf')).toBe('file');
    expect(packageKindFromFilename(null)).toBe('file');
  });

  it('nhận diện PDF', () => {
    expect(isPdfFilename('a.pdf')).toBe(true);
    expect(isPdfFilename('a.PDF')).toBe(true);
    expect(isPdfFilename('a.docx')).toBe(false);
  });

  it('chặn zip-slip và entry thư mục', () => {
    expect(sanitizeZipEntryPath('../etc/passwd')).toBeNull();
    expect(sanitizeZipEntryPath('foo/../bar.txt')).toBeNull();
    expect(sanitizeZipEntryPath('dir/')).toBeNull();
    expect(sanitizeZipEntryPath('src/Main.java')).toBe('src/Main.java');
  });

  it('giải nén zip lấy text', async () => {
    const zip = new JSZip();
    zip.file('a.txt', 'Đáp án câu 1');
    zip.file('nested/b.txt', 'Đáp án câu 2');
    const buf = Buffer.from(await zip.generateAsync({ type: 'uint8array' }));
    const files = await extractModelAnswerZip(buf);
    expect(files).toEqual(
      expect.arrayContaining([
        { path: 'a.txt', text: 'Đáp án câu 1' },
        { path: 'nested/b.txt', text: 'Đáp án câu 2' },
      ]),
    );
  });
});

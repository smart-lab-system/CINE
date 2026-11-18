import { describe, expect, it } from 'vitest';
import { normalizeModelAnswerPackage } from './model-answer-package';

describe('normalizeModelAnswerPackage', () => {
  it('giữ nguyên một file', async () => {
    const file = new File(['hello'], 'dap-an.pdf', { type: 'application/pdf' });
    const out = await normalizeModelAnswerPackage([file], 'file');
    expect(out.name).toBe('dap-an.pdf');
  });

  it('từ chối zip không đúng đuôi', async () => {
    const file = new File(['x'], 'a.pdf', { type: 'application/pdf' });
    await expect(normalizeModelAnswerPackage([file], 'zip')).rejects.toThrow(/\.zip/);
  });

  it('nén thư mục thành zip', async () => {
    const a = new File(['1'], 'a.txt');
    Object.defineProperty(a, 'webkitRelativePath', { value: 'BaiMau/a.txt' });
    const b = new File(['2'], 'b.txt');
    Object.defineProperty(b, 'webkitRelativePath', { value: 'BaiMau/b.txt' });
    const out = await normalizeModelAnswerPackage([a, b], 'folder');
    expect(out.name).toBe('BaiMau.zip');
    expect(out.type).toBe('application/zip');
  });
});

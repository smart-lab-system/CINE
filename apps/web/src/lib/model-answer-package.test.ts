import { describe, expect, it } from 'vitest';
import {
  detectModelAnswerPickMode,
  normalizeModelAnswerPackage,
} from './model-answer-package';

describe('detectModelAnswerPickMode', () => {
  it('một file thường → file', () => {
    expect(detectModelAnswerPickMode([new File(['x'], 'a.pdf')])).toBe('file');
  });

  it('.zip / .rar → archive', () => {
    expect(detectModelAnswerPickMode([new File(['x'], 'a.zip')])).toBe('archive');
    expect(detectModelAnswerPickMode([new File(['x'], 'a.RAR')])).toBe('archive');
  });

  it('nhiều file hoặc webkitRelativePath → folder', () => {
    expect(
      detectModelAnswerPickMode([
        new File(['1'], 'a.txt'),
        new File(['2'], 'b.txt'),
      ]),
    ).toBe('folder');

    const nested = new File(['1'], 'a.txt');
    Object.defineProperty(nested, 'webkitRelativePath', { value: 'Bai/a.txt' });
    expect(detectModelAnswerPickMode([nested])).toBe('folder');
  });
});

describe('normalizeModelAnswerPackage', () => {
  it('giữ nguyên một file', async () => {
    const file = new File(['hello'], 'dap-an.pdf', { type: 'application/pdf' });
    const out = await normalizeModelAnswerPackage([file]);
    expect(out.name).toBe('dap-an.pdf');
  });

  it('giữ nguyên .zip và .rar', async () => {
    const zip = new File(['x'], 'goi.zip', { type: 'application/zip' });
    expect((await normalizeModelAnswerPackage([zip])).name).toBe('goi.zip');

    const rar = new File(['x'], 'goi.rar');
    expect((await normalizeModelAnswerPackage([rar])).name).toBe('goi.rar');
  });

  it('từ chối archive giả khi ép mode archive', async () => {
    const file = new File(['x'], 'a.pdf', { type: 'application/pdf' });
    await expect(normalizeModelAnswerPackage([file], 'archive')).rejects.toThrow(
      /\.zip hoặc \.rar/,
    );
  });

  it('nén thư mục thành zip', async () => {
    const a = new File(['1'], 'a.txt');
    Object.defineProperty(a, 'webkitRelativePath', { value: 'BaiMau/a.txt' });
    const b = new File(['2'], 'b.txt');
    Object.defineProperty(b, 'webkitRelativePath', { value: 'BaiMau/b.txt' });
    const out = await normalizeModelAnswerPackage([a, b]);
    expect(out.name).toBe('BaiMau.zip');
    expect(out.type).toBe('application/zip');
  });
});

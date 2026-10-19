import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ GET: vi.fn(), POST: vi.fn() }));
vi.mock('@/lib/api-client', () => ({ apiClient: h }));

import { ApiStatusError } from './error';
import { confirmAnswerSource, requestAnswerSourceUpload, uploadAnswerSource } from './grading';
import { generateTestBundle, runTestBundle } from './test-bundle';

const ok = (data: unknown, status = 201) => ({ data, error: undefined, response: { ok: true, status } });
const bad = (status: number, body: unknown) => ({ data: undefined, error: body, response: { ok: false, status } });

beforeEach(() => {
  h.GET.mockReset();
  h.POST.mockReset();
  vi.unstubAllGlobals();
});

describe('lib/api/test-bundle — chạy thử và sinh gói (G2b-R)', () => {
  it('chạy thử cả gói: POST .../{bundleId}/runs với body rỗng; một ca thì kèm caseKey', async () => {
    const result = { runId: 'r1', status: 'pass', cases: [{ name: 'ca1', status: 'pass', ms: 3, diff: null }] };
    h.POST.mockResolvedValue(ok(result));

    await expect(runTestBundle('s1', 'b1')).resolves.toEqual(result);
    expect(h.POST).toHaveBeenLastCalledWith('/exam-sessions/{id}/test-bundles/{bundleId}/runs', {
      params: { path: { id: 's1', bundleId: 'b1' } },
      body: {},
    });

    await runTestBundle('s1', 'b1', 'ca1');
    expect(h.POST).toHaveBeenLastCalledWith('/exam-sessions/{id}/test-bundles/{bundleId}/runs', {
      params: { path: { id: 's1', bundleId: 'b1' } },
      body: { caseKey: 'ca1' },
    });
  });

  it('sinh từ đề và sinh từ đáp án gọi đúng hai route', async () => {
    const result = { testBundle: { id: 'b2', version: 2, caseCount: 5, droppedCount: 1 }, run: { runId: 'r', status: 'pass' }, warnings: [] };
    h.POST.mockResolvedValue(ok(result));

    await expect(generateTestBundle('s1', 'statement')).resolves.toEqual(result);
    expect(h.POST).toHaveBeenLastCalledWith('/exam-sessions/{id}/test-bundles/generate-from-statement', { params: { path: { id: 's1' } } });

    await generateTestBundle('s1', 'answer');
    expect(h.POST).toHaveBeenLastCalledWith('/exam-sessions/{id}/test-bundles/generate-from-answer', { params: { path: { id: 's1' } } });
  });

  it('lỗi máy chủ giữ nguyên thông điệp, mã trạng thái và thân lỗi (409 chưa có mã, 422 kèm chi tiết)', async () => {
    h.POST.mockResolvedValue(bad(409, { message: 'Chưa có mã đáp án để sinh gói test — hãy tải mã đáp án lên trước.' }));
    const conflict = await generateTestBundle('s1', 'answer').catch((e: unknown) => e);
    expect(conflict).toBeInstanceOf(ApiStatusError);
    expect(conflict).toMatchObject({ status: 409, message: expect.stringContaining('mã đáp án') });

    const body = { message: 'Đáp án chạy thật không tái tạo đúng ví dụ.', mismatches: [{ input: '2', expected: '6 5', actual: '5 6' }] };
    h.POST.mockResolvedValue(bad(422, body));
    const mismatch = await generateTestBundle('s1', 'statement').catch((e: unknown) => e);
    expect(mismatch).toMatchObject({ status: 422, body });
  });

  it('thông điệp dạng mảng (ValidationPipe) được nối bằng "; "; không có thông điệp thì nêu mã HTTP', async () => {
    h.POST.mockResolvedValue(bad(400, { message: ['a sai', 'b sai'] }));
    await expect(runTestBundle('s1', 'b1', 'x y')).rejects.toThrow('a sai; b sai');
    h.POST.mockResolvedValue(bad(503, undefined));
    await expect(runTestBundle('s1', 'b1')).rejects.toThrow('HTTP 503');
  });
});

describe('lib/api/grading — tải mã đáp án (G2b-R Task 2, phía FE)', () => {
  it('xin URL tải: POST .../answer-source/upload-url kèm đuôi file', async () => {
    h.POST.mockResolvedValue(ok({ storageKey: 'grading-reference/s1/pending-x.cpp', uploadUrl: 'https://kho/put', expiresIn: 300 }));

    await expect(requestAnswerSourceUpload('s1', 'cpp')).resolves.toMatchObject({ storageKey: 'grading-reference/s1/pending-x.cpp' });
    expect(h.POST).toHaveBeenCalledWith('/exam-sessions/{id}/grading-reference/answer-source/upload-url', {
      params: { path: { id: 's1' } },
      body: { extension: 'cpp' },
    });
  });

  it('xác nhận: POST .../answer-source/confirm kèm khoá tạm', async () => {
    h.POST.mockResolvedValue(ok({ sourceKey: 'grading-reference/s1/source-abc.cpp', sha256: 'abc' }));

    await expect(confirmAnswerSource('s1', 'grading-reference/s1/pending-x.cpp')).resolves.toEqual({
      sourceKey: 'grading-reference/s1/source-abc.cpp',
      sha256: 'abc',
    });
    expect(h.POST).toHaveBeenCalledWith('/exam-sessions/{id}/grading-reference/answer-source/confirm', {
      params: { path: { id: 's1' } },
      body: { storageKey: 'grading-reference/s1/pending-x.cpp' },
    });
  });

  it('tải cả luồng: xin URL, PUT file thẳng lên kho (không qua API), rồi xác nhận', async () => {
    const put = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', put);
    h.POST
      .mockResolvedValueOnce(ok({ storageKey: 'k-tmp', uploadUrl: 'https://kho/put', expiresIn: 300 }))
      .mockResolvedValueOnce(ok({ sourceKey: 'k-final', sha256: 'h' }));
    const file = new File(['int main() {}'], 'dap-an.cpp');

    await expect(uploadAnswerSource('s1', file)).resolves.toEqual({ sourceKey: 'k-final', sha256: 'h' });

    expect(put).toHaveBeenCalledWith('https://kho/put', { method: 'PUT', body: file });
    expect(h.POST.mock.calls[0][1].body).toEqual({ extension: 'cpp' });
    expect(h.POST.mock.calls[1][1].body).toEqual({ storageKey: 'k-tmp' });
  });

  it('đuôi .py được nhận; đuôi khác bị từ chối TRƯỚC khi gọi API', async () => {
    h.POST
      .mockResolvedValueOnce(ok({ storageKey: 'k', uploadUrl: 'https://kho/put', expiresIn: 300 }))
      .mockResolvedValueOnce(ok({ sourceKey: 'k2', sha256: 'h' }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    await uploadAnswerSource('s1', new File(['print(1)'], 'a.py'));
    expect(h.POST.mock.calls[0][1].body).toEqual({ extension: 'py' });

    h.POST.mockClear();
    await expect(uploadAnswerSource('s1', new File(['x'], 'dap-an.java'))).rejects.toThrow(/\.cpp hoặc \.py/);
    expect(h.POST).not.toHaveBeenCalled();
  });

  it('PUT lên kho hỏng → ném lỗi và KHÔNG xác nhận (không lưu tham chiếu tới object không có)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }));
    h.POST.mockResolvedValueOnce(ok({ storageKey: 'k', uploadUrl: 'https://kho/put', expiresIn: 300 }));

    await expect(uploadAnswerSource('s1', new File(['x'], 'a.cpp'))).rejects.toThrow(/tải được/);
    expect(h.POST).toHaveBeenCalledTimes(1);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ImportRejectedError, type ImportResult } from '@/lib/import/import-types';

const post = vi.fn();
vi.mock('@/lib/api-client', () => ({ apiClient: { POST: (...args: unknown[]) => post(...args) } }));

import {
  IMPORT_RUNNERS,
  importAdministrativeClasses,
  importClasses,
  importRooms,
  importSemesters,
} from './master-data-import';

const RESULT: ImportResult = {
  dryRun: true,
  applied: false,
  counts: { added: 1, updated: 0, unchanged: 0, errors: 0 },
  rows: [{ line: 2, status: 'new', label: 'H3.03', changes: [], errors: [], similar: [] }],
  needsSimilarConfirmation: false,
};
const ok = (data: unknown) => ({ data, error: undefined, response: { ok: true, status: 200 } });
const failed = (status: number, error: unknown) => ({ data: undefined, error, response: { ok: false, status } });

describe('master-data-import', () => {
  beforeEach(() => post.mockReset());

  it.each([
    ['semester', importSemesters, '/semesters/import'],
    ['room', importRooms, '/rooms/import'],
    ['administrative-class', importAdministrativeClasses, '/administrative-classes/import'],
    ['class', importClasses, '/classes/import'],
  ] as const)('%s gọi đúng route và gửi nguyên yêu cầu', async (id, run, path) => {
    post.mockResolvedValue(ok(RESULT));
    const request = { rows: [{ line: 2, name: 'x' }], dryRun: true };

    await expect(run(request)).resolves.toEqual(RESULT);

    expect(post).toHaveBeenCalledWith(path, { body: request });
    expect(IMPORT_RUNNERS[id]).toBe(run);
  });

  it('400 IMPORT_HAS_ERRORS và 409 NEAR_DUPLICATE ném ImportRejectedError kèm bản xem trước mới nhất', async () => {
    post.mockResolvedValueOnce(failed(400, { error: 'IMPORT_HAS_ERRORS', message: 'File có 1 dòng lỗi', preview: RESULT }));
    const first = await importRooms({ rows: [], dryRun: false }).catch((e: unknown) => e);
    expect(first).toBeInstanceOf(ImportRejectedError);
    expect(first).toMatchObject({ code: 'IMPORT_HAS_ERRORS', preview: RESULT, message: 'File có 1 dòng lỗi' });

    post.mockResolvedValueOnce(failed(409, { error: 'NEAR_DUPLICATE', message: 'Có mục gần giống', preview: RESULT }));
    const second = await importRooms({ rows: [], dryRun: false }).catch((e: unknown) => e);
    expect(second).toMatchObject({ code: 'NEAR_DUPLICATE' });
  });

  it('lỗi khác (403, 500, mảng message của ValidationPipe) ném Error thường mang chữ của server', async () => {
    post.mockResolvedValueOnce(failed(400, { message: ['rows must contain at least 1 elements', 'dryRun must be a boolean value'] }));
    await expect(importRooms({ rows: [], dryRun: true })).rejects.toThrow(
      'rows must contain at least 1 elements; dryRun must be a boolean value',
    );

    post.mockResolvedValueOnce(failed(500, undefined));
    await expect(importRooms({ rows: [], dryRun: true })).rejects.toThrow('Yêu cầu thất bại (HTTP 500)');
  });

  it('409 KHÔNG phải NEAR_DUPLICATE (vd va chạm DB) là Error thường, không phải ImportRejectedError', async () => {
    post.mockResolvedValueOnce(failed(409, { message: 'This request conflicts with an existing record.' }));
    const error = await importRooms({ rows: [], dryRun: false }).catch((e: unknown) => e);
    expect(error).not.toBeInstanceOf(ImportRejectedError);
    expect((error as Error).message).toBe('This request conflicts with an existing record.');
  });
});

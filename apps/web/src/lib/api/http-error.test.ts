import { describe, expect, it } from 'vitest';
import { NearDuplicateError, throwIfFailed } from './http-error';

const ok = { ok: true, status: 200 };
const failed = (status: number) => ({ ok: false, status });

describe('throwIfFailed', () => {
  it('không ném khi thành công', async () => {
    await expect(throwIfFailed(undefined, ok)).resolves.toBeUndefined();
  });

  it('ném Error mang chữ của SERVER (Review Focus 5)', async () => {
    await expect(
      throwIfFailed({ message: 'Phòng "H3.03" đã có 4 phiên thi nên không xoá được.' }, failed(409)),
    ).rejects.toThrow('Phòng "H3.03" đã có 4 phiên thi nên không xoá được.');
  });

  it('message dạng mảng của ValidationPipe được nối', async () => {
    await expect(
      throwIfFailed({ message: ['name must be a string', 'capacity must not be greater than 1000'] }, failed(400)),
    ).rejects.toThrow('name must be a string; capacity must not be greater than 1000');
  });

  it('không có thân: câu mặc định nêu mã HTTP', async () => {
    await expect(throwIfFailed(undefined, failed(502))).rejects.toThrow('Yêu cầu thất bại (HTTP 502)');
  });

  it('409 NEAR_DUPLICATE thành NearDuplicateError mang danh sách mục gần giống', async () => {
    const similar = [{ id: 'r1', name: 'Phòng H3.03' }];
    const error = await throwIfFailed(
      { error: 'NEAR_DUPLICATE', message: 'Phòng "H303" gần giống "Phòng H3.03".', similar },
      failed(409),
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(NearDuplicateError);
    expect(error).toMatchObject({ message: 'Phòng "H303" gần giống "Phòng H3.03".', similar });
  });

  it('Review Focus 6: 409 THƯỜNG (trùng cứng) không phải NearDuplicateError', async () => {
    const error = await throwIfFailed({ message: 'Phòng "H3.03" đã tồn tại.' }, failed(409)).catch((e: unknown) => e);
    expect(error).not.toBeInstanceOf(NearDuplicateError);
    expect((error as Error).message).toBe('Phòng "H3.03" đã tồn tại.');
  });

  it('NEAR_DUPLICATE mà không phải 409 cũng không thành NearDuplicateError', async () => {
    const error = await throwIfFailed({ error: 'NEAR_DUPLICATE', message: 'x' }, failed(400)).catch((e: unknown) => e);
    expect(error).not.toBeInstanceOf(NearDuplicateError);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const get = vi.fn();
vi.mock('@/lib/api-client', () => ({ apiClient: { GET: (...a: unknown[]) => get(...a) } }));

import * as teaching from './teaching';

const ok = (data: unknown) => ({ data, error: undefined, response: { ok: true, status: 200 } });

describe('lib/api/teaching', () => {
  beforeEach(() => get.mockReset());

  it('listTeachingClasses không đối số: không gửi tham số lọc nào', async () => {
    get.mockResolvedValue(ok([{ id: 'c1' }]));
    await expect(teaching.listTeachingClasses()).resolves.toEqual([{ id: 'c1' }]);
    expect(get).toHaveBeenCalledWith('/classes/teaching', { params: { query: {} } });
  });

  it('chỉ gửi bộ lọc có giá trị', async () => {
    get.mockResolvedValue(ok([]));
    await teaching.listTeachingClasses({ semesterId: 's1' });
    expect(get).toHaveBeenLastCalledWith('/classes/teaching', { params: { query: { semesterId: 's1' } } });
    await teaching.listTeachingClasses({ academicYear: 2026 });
    expect(get).toHaveBeenLastCalledWith('/classes/teaching', { params: { query: { academicYear: 2026 } } });
  });

  it('lỗi của server tới được người dùng nguyên văn', async () => {
    get.mockResolvedValue({ data: undefined, error: { message: 'Không tải được lớp' }, response: { ok: false, status: 500 } });
    await expect(teaching.listTeachingClasses()).rejects.toThrow('Không tải được lớp');
  });

  it('Review Focus 1: giảng viên KHÔNG còn hàm tạo/sửa/xoá lớp', () => {
    expect(teaching).not.toHaveProperty('createClass');
    expect(teaching).not.toHaveProperty('updateClass');
    expect(teaching).not.toHaveProperty('deleteClass');
  });
});

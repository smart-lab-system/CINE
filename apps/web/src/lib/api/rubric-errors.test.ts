import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ GET: vi.fn(), POST: vi.fn(), PUT: vi.fn(), PATCH: vi.fn(), DELETE: vi.fn() }));
vi.mock('@/lib/api-client', () => ({ apiClient: h }));

import {
  assignError,
  copyErrors,
  getRubricOverview,
  listRubricErrors,
  moveError,
  previewErrorPrice,
  removeError,
  setErrorPrice,
} from './rubric-errors';

const ok = (data: unknown) => ({ data, error: undefined, response: { ok: true, status: 200 } });
const bad = (message: unknown, status = 409) => ({ data: undefined, error: { message }, response: { ok: false, status } });

beforeEach(() => Object.values(h).forEach((fn) => fn.mockReset()));

describe('lib/api/rubric-errors', () => {
  it('đọc tổng quan từ GET /rubric-errors/overview', async () => {
    h.GET.mockResolvedValue(ok([{ rubricName: 'A' }]));
    await expect(getRubricOverview()).resolves.toEqual([{ rubricName: 'A' }]);
    expect(h.GET).toHaveBeenCalledWith('/rubric-errors/overview');
  });

  it('liệt kê lỗi của một rubric bằng query rubricName (tên có ký tự đặc biệt đi nguyên văn)', async () => {
    h.GET.mockResolvedValue(ok([]));
    await listRubricErrors('A&B #1 — Giữa kỳ?');
    expect(h.GET).toHaveBeenCalledWith('/rubric-errors', { params: { query: { rubricName: 'A&B #1 — Giữa kỳ?' } } });
  });

  it('thêm lỗi gửi đúng nguyên thân (điểm trừ là chuỗi)', async () => {
    h.POST.mockResolvedValue(ok({ rubricErrorId: 'e1', ruleId: 'r1', recompute: null }));
    const input = { rubricName: 'A', criterionKey: 'x', deduction: '1.5', ruleId: 'r1' };
    await expect(assignError(input)).resolves.toMatchObject({ rubricErrorId: 'e1' });
    expect(h.POST).toHaveBeenCalledWith('/rubric-errors', { body: input });
  });

  it('chuyển tiêu chí, gỡ, sao chép dùng đúng đường dẫn', async () => {
    h.PATCH.mockResolvedValue(ok({ recompute: { recomputed: 1, promoted: 0, demoted: 0, belowFloor: 0 } }));
    h.DELETE.mockResolvedValue(ok({ recompute: { recomputed: 0, promoted: 0, demoted: 0, belowFloor: 0 } }));
    h.POST.mockResolvedValue(ok({ copied: 2, skippedNoCriterion: 0, skippedExisting: 0, recompute: null }));
    await moveError('e1', 'bo_nho');
    expect(h.PATCH).toHaveBeenCalledWith('/rubric-errors/{id}', { params: { path: { id: 'e1' } }, body: { criterionKey: 'bo_nho' } });
    await removeError('e1');
    expect(h.DELETE).toHaveBeenCalledWith('/rubric-errors/{id}', { params: { path: { id: 'e1' } } });
    await copyErrors('Từ', 'Đến');
    expect(h.POST).toHaveBeenCalledWith('/rubric-errors/copy', { body: { fromRubricName: 'Từ', toRubricName: 'Đến' } });
  });

  it('xem trước và lưu điểm trừ: chuỗi thập phân hoặc null tường minh', async () => {
    h.POST.mockResolvedValue(ok({ openSessions: [], finalizedSessions: [] }));
    h.PUT.mockResolvedValue(ok({ versionId: 'v2', recompute: { recomputed: 0, promoted: 0, demoted: 0, belowFloor: 0 } }));
    await previewErrorPrice('e1', '2.25');
    expect(h.POST).toHaveBeenCalledWith('/rubric-errors/{id}/price/preview', { params: { path: { id: 'e1' } }, body: { deduction: '2.25' } });
    await setErrorPrice('e1', null);
    expect(h.PUT).toHaveBeenCalledWith('/rubric-errors/{id}/price', { params: { path: { id: 'e1' } }, body: { deduction: null } });
  });

  it('lỗi của máy chủ hiện nguyên văn; thông điệp dạng mảng nối bằng "; "; không có thông điệp thì nêu mã HTTP', async () => {
    h.POST.mockResolvedValueOnce(bad('Lỗi này đã có trong rubric'));
    await expect(assignError({ rubricName: 'A', criterionKey: 'x', ruleId: 'r1' })).rejects.toThrow('Lỗi này đã có trong rubric');
    h.POST.mockResolvedValueOnce(bad(['a sai', 'b sai'], 400));
    await expect(assignError({ rubricName: 'A', criterionKey: 'x', ruleId: 'r1' })).rejects.toThrow('a sai; b sai');
    h.GET.mockResolvedValueOnce(bad(undefined, 500));
    await expect(getRubricOverview()).rejects.toThrow('Yêu cầu thất bại (HTTP 500)');
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ GET: vi.fn(), POST: vi.fn(), PUT: vi.fn(), PATCH: vi.fn(), DELETE: vi.fn() }));
vi.mock('@/lib/api-client', () => ({ apiClient: h }));

import { listLibrary, listProposals, reviseRule, revokeWaiver, setRuleState, setWaiver, splitRule } from './rules';

const ok = (data: unknown) => ({ data, error: undefined, response: { ok: true, status: 200 } });
const recompute = { recomputed: 1, promoted: 0, demoted: 0, belowFloor: 0 };

beforeEach(() => Object.values(h).forEach((fn) => fn.mockReset()));

describe('lib/api/rules', () => {
  it('thư viện lỗi: GET /rules', async () => {
    h.GET.mockResolvedValue(ok([{ id: 'r1' }]));
    await expect(listLibrary()).resolves.toEqual([{ id: 'r1' }]);
    expect(h.GET).toHaveBeenCalledWith('/rules');
  });

  it('lỗi AI đề xuất: có rubricName thì lọc, không có thì không gửi query', async () => {
    h.GET.mockResolvedValue(ok([]));
    await listProposals('Giữa kỳ');
    expect(h.GET).toHaveBeenLastCalledWith('/rules/missing', { params: { query: { rubricName: 'Giữa kỳ' } } });
    await listProposals();
    expect(h.GET).toHaveBeenLastCalledWith('/rules/missing', { params: { query: {} } });
  });

  it('sửa cả N rubric: PATCH /rules/{id}; tách bản riêng: POST /rules/{id}/split kèm rubricName', async () => {
    h.PATCH.mockResolvedValue(ok({ revisionId: 'v2', recompute: null }));
    h.POST.mockResolvedValue(ok({ ruleId: 'r2', rubricErrorId: 'e1', recompute }));
    await reviseRule('r1', { name: 'Mới' });
    expect(h.PATCH).toHaveBeenCalledWith('/rules/{id}', { params: { path: { id: 'r1' } }, body: { name: 'Mới' } });
    await splitRule('r1', 'Giữa kỳ', { name: 'Riêng', predicate: null });
    expect(h.POST).toHaveBeenCalledWith('/rules/{id}/split', {
      params: { path: { id: 'r1' } },
      body: { rubricName: 'Giữa kỳ', changes: { name: 'Riêng', predicate: null } },
    });
  });

  it('"không phải lỗi" và đánh dấu không trừ điểm', async () => {
    h.POST.mockResolvedValue(ok({ recompute }));
    await setRuleState('r1', 'dismissed');
    expect(h.POST).toHaveBeenLastCalledWith('/rules/{id}/state', { params: { path: { id: 'r1' } }, body: { state: 'dismissed' } });
    h.POST.mockResolvedValue(ok({ waiverId: 'w1', recompute: null }));
    await setWaiver('ru-1', 'bo_nho');
    expect(h.POST).toHaveBeenLastCalledWith('/rubrics/{id}/criterion-waivers', { params: { path: { id: 'ru-1' } }, body: { criterionKey: 'bo_nho' } });
    h.POST.mockResolvedValue(ok({ recompute }));
    await revokeWaiver('w1');
    expect(h.POST).toHaveBeenLastCalledWith('/criterion-waivers/{id}/revoke', { params: { path: { id: 'w1' } } });
  });
});

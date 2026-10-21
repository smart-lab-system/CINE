import type { EntityManager } from 'typeorm';
import {
  countNoErrorLabelsSinceReset,
  countRuleLabelsSinceReset,
  isNoErrorBreakerOpen,
  isRuleBreakerOpen,
  loadOpenBreakerRuleKeys,
} from './breaker-queries';
import { breakerVerdict } from './breaker-verdict';

function managerReturning(rows: unknown[]): { m: EntityManager; query: jest.Mock } {
  const query = jest.fn().mockResolvedValue(rows);
  return { m: { query } as unknown as EntityManager, query };
}

describe('breaker-queries', () => {
  // node-postgres trả COUNT(*) (bigint) dưới dạng CHUỖI; `breakerVerdict` ném RangeError với chuỗi.
  it('breakerVerdict từ chối số đếm dạng chuỗi — lý do các hàm đếm phải đổi sang số', () => {
    expect(() => breakerVerdict({ n: '2' as unknown as number, disagreements: '2' as unknown as number })).toThrow(RangeError);
  });

  it('countRuleLabelsSinceReset đổi số đếm dạng chuỗi sang số, theo đúng luật', async () => {
    const { m, query } = managerReturning([{ n: '2', disagreements: '2' }]);

    const counts = await countRuleLabelsSinceReset(m, 'luat-1');

    expect(counts).toEqual({ n: 2, disagreements: 2 });
    expect(breakerVerdict(counts).trip).toBe(true);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('examcollect.audit_rule_label'), ['luat-1']);
    // Chỉ đếm nhãn ghi SAU lần bật lại gần nhất của cầu dao luật đó.
    expect(query.mock.calls[0][0]).toContain('reset_at');
  });

  it('countNoErrorLabelsSinceReset đổi số đếm dạng chuỗi sang số, theo đúng giảng viên', async () => {
    const { m, query } = managerReturning([{ n: '5', disagreements: '1' }]);

    const counts = await countNoErrorLabelsSinceReset(m, 'gv-1');

    expect(counts).toEqual({ n: 5, disagreements: 1 });
    expect(breakerVerdict(counts).trip).toBe(false);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('examcollect.audit_no_error_label'), ['gv-1']);
    expect(query.mock.calls[0][0]).toContain('reset_at');
  });

  it('chưa có nhãn nào → n = 0, d = 0 (không tắt)', async () => {
    const { m } = managerReturning([{ n: '0', disagreements: '0' }]);
    const counts = await countRuleLabelsSinceReset(m, 'luat-1');
    expect(counts).toEqual({ n: 0, disagreements: 0 });
    expect(breakerVerdict(counts)).toEqual({ trip: false, pValue: 1 });
  });

  it('loadOpenBreakerRuleKeys trả khoá luật của các cầu dao luật đang mở', async () => {
    const { m, query } = managerReturning([{ rule_key: 'sai_bien' }, { rule_key: 'ten_bien' }]);
    expect(await loadOpenBreakerRuleKeys(m, 'gv-1')).toEqual(['sai_bien', 'ten_bien']);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('reset_at IS NULL'), ['gv-1']);
  });

  it('isNoErrorBreakerOpen và isRuleBreakerOpen trả boolean', async () => {
    expect(await isNoErrorBreakerOpen(managerReturning([{ open: true }]).m, 'gv-1')).toBe(true);
    expect(await isNoErrorBreakerOpen(managerReturning([{ open: false }]).m, 'gv-1')).toBe(false);
    const rule = managerReturning([{ open: true }]);
    expect(await isRuleBreakerOpen(rule.m, 'gv-1', 'luat-1')).toBe(true);
    expect(rule.query).toHaveBeenCalledWith(expect.stringContaining('reset_at IS NULL'), ['gv-1', 'luat-1']);
  });
});

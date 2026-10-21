jest.mock('./breaker-queries');
jest.mock('../scoring/score-inputs', () => ({
  ...jest.requireActual('../scoring/score-inputs'),
  latestComputationRow: jest.fn(),
}));

import type { DataSource, EntityManager } from 'typeorm';
import type { AuditReveal } from '../audit/audit-review.service';
import type { BreakdownError } from '../scoring/score-core';
import { latestComputationRow } from '../scoring/score-inputs';
import type { ScoreService } from '../scoring/score.service';
import { AutoBreakerService } from './auto-breaker.service';
import {
  countNoErrorLabelsSinceReset,
  countRuleLabelsSinceReset,
  isNoErrorBreakerOpen,
  isRuleBreakerOpen,
} from './breaker-queries';
import { BREAKER_ALPHA, BREAKER_P0 } from './breaker-verdict';

const latest = latestComputationRow as jest.MockedFunction<typeof latestComputationRow>;
const ruleOpen = isRuleBreakerOpen as jest.MockedFunction<typeof isRuleBreakerOpen>;
const noErrorOpen = isNoErrorBreakerOpen as jest.MockedFunction<typeof isNoErrorBreakerOpen>;
const countRule = countRuleLabelsSinceReset as jest.MockedFunction<typeof countRuleLabelsSinceReset>;
const countNoError = countNoErrorLabelsSinceReset as jest.MockedFunction<typeof countNoErrorLabelsSinceReset>;

function reveal(over: Partial<AuditReveal> = {}): AuditReveal {
  return {
    status: 'teacher_reviewed',
    currentScore: 8.5,
    currentScoreSource: 'computation',
    systemErrors: [],
    perRule: [],
    extraErrors: [],
    summary: { both: 0, teacherOnly: 0, systemOnly: 0, neither: 0, extra: 0, agreement: 'full' },
    ...over,
  };
}
function withErrors(errors: Partial<BreakdownError>[]) {
  return { id: 'c-1', score: '8.50', priceTableVersionId: null, testBundleId: null, breakdown: { errors } as never };
}

describe('AutoBreakerService.recordLabelsAndEvaluate', () => {
  let query: jest.Mock;
  let m: EntityManager;
  let recompute: jest.Mock;
  let service: AutoBreakerService;

  const sqlCalls = (fragment: string) => query.mock.calls.filter(([sql]) => (sql as string).includes(fragment));

  beforeEach(() => {
    jest.clearAllMocks();
    query = jest.fn(async (sql: string) => (sql.includes('INSERT INTO examcollect.auto_rule_breaker') ? [{ id: 'cau-dao-1' }] : []));
    m = { query } as unknown as EntityManager;
    recompute = jest.fn().mockResolvedValue({ recomputed: 0, promoted: 0, demoted: 0, belowFloor: 0 });
    service = new AutoBreakerService({} as DataSource, { recomputeForTeacher: recompute } as unknown as ScoreService);
    ruleOpen.mockResolvedValue(false);
    noErrorOpen.mockResolvedValue(false);
    countRule.mockResolvedValue({ n: 1, disagreements: 1 });
    countNoError.mockResolvedValue({ n: 1, disagreements: 0 });
    latest.mockResolvedValue(withErrors([{ ruleId: 'r-a', counted: 'counted' }]));
  });

  it('ghi một nhãn cho mỗi luật của perRule; chưa đủ bằng chứng (n=1, d=1) → không tắt, không tính lại', async () => {
    const out = await service.recordLabelsAndEvaluate(
      m,
      'gv-1',
      'bai-1',
      reveal({
        perRule: [
          { ruleId: 'r-a', ruleKey: 'a', ruleName: 'a', verdict: 'system_only' },
          { ruleId: 'r-b', ruleKey: 'b', ruleName: 'b', verdict: 'both' },
        ],
        summary: { both: 1, teacherOnly: 0, systemOnly: 1, neither: 0, extra: 0, agreement: 'partial' },
      }),
    );

    expect(out).toEqual({ tripped: [] });
    const labels = sqlCalls('INSERT INTO examcollect.audit_rule_label');
    expect(labels).toHaveLength(1);
    expect(labels[0][1]).toEqual(['bai-1', ['r-a', 'r-b'], ['system_only', 'both']]);
    expect(countRule.mock.calls.map((c) => c[1])).toEqual(['r-a', 'r-b']);
    expect(sqlCalls('INSERT INTO examcollect.auto_rule_breaker')).toEqual([]);
    expect(recompute).not.toHaveBeenCalled();
    // Bài có lỗi: không thuộc lớp không lỗi.
    expect(sqlCalls('audit_no_error_label')).toEqual([]);
  });

  it('đủ bằng chứng (n=2, d=2) → chèn cầu dao luật kèm evidence, RỒI tính lại phạm vi luật trừ bài vừa kiểm', async () => {
    countRule.mockResolvedValue({ n: 2, disagreements: 2 });

    const out = await service.recordLabelsAndEvaluate(
      m,
      'gv-1',
      'bai-1',
      reveal({ perRule: [{ ruleId: 'r-a', ruleKey: 'a', ruleName: 'a', verdict: 'system_only' }] }),
    );

    expect(out).toEqual({ tripped: ['cau-dao-1'] });
    const [insert] = sqlCalls('INSERT INTO examcollect.auto_rule_breaker');
    expect(insert[1].slice(0, 3)).toEqual(['gv-1', 'rule', 'r-a']);
    const evidence = JSON.parse(insert[1][3] as string);
    expect(evidence).toMatchObject({ n: 2, disagreements: 2, p0: BREAKER_P0, alpha: BREAKER_ALPHA });
    expect(evidence.pValue).toBeCloseTo(0.0025, 12);
    expect(recompute).toHaveBeenCalledWith(m, 'gv-1', 'auto_rule_tripped', null, { ruleId: 'r-a', exceptResultId: 'bai-1' });
    const insertOrder = query.mock.invocationCallOrder[query.mock.calls.indexOf(insert)];
    expect(insertOrder).toBeLessThan(recompute.mock.invocationCallOrder[0]);
  });

  it('cầu dao của luật đang mở → không đếm, không tắt lại', async () => {
    ruleOpen.mockResolvedValue(true);
    countRule.mockResolvedValue({ n: 9, disagreements: 9 });

    const out = await service.recordLabelsAndEvaluate(
      m,
      'gv-1',
      'bai-1',
      reveal({ perRule: [{ ruleId: 'r-a', ruleKey: 'a', ruleName: 'a', verdict: 'system_only' }] }),
    );

    expect(out).toEqual({ tripped: [] });
    expect(sqlCalls('INSERT INTO examcollect.audit_rule_label')).toHaveLength(1);
    expect(countRule).not.toHaveBeenCalled();
    expect(recompute).not.toHaveBeenCalled();
  });

  it('bài không lỗi, giảng viên đồng ý (agreement full) → nhãn lớp agree = true; không tắt', async () => {
    latest.mockResolvedValue(withErrors([]));

    const out = await service.recordLabelsAndEvaluate(m, 'gv-1', 'bai-1', reveal());

    expect(out).toEqual({ tripped: [] });
    expect(sqlCalls('INSERT INTO examcollect.audit_rule_label')).toEqual([]);
    const [label] = sqlCalls('INSERT INTO examcollect.audit_no_error_label');
    expect(label[1]).toEqual(['bai-1', 'gv-1', true]);
    expect(countNoError).toHaveBeenCalledWith(m, 'gv-1');
    expect(recompute).not.toHaveBeenCalled();
  });

  it('bài không lỗi bị chọn luật (n=2, d=2) → agree = false, cầu dao no_error không luật, tính lại bài không lỗi', async () => {
    latest.mockResolvedValue(withErrors([]));
    countNoError.mockResolvedValue({ n: 2, disagreements: 2 });

    const out = await service.recordLabelsAndEvaluate(
      m,
      'gv-1',
      'bai-1',
      reveal({
        perRule: [{ ruleId: 'r-b', ruleKey: 'b', ruleName: 'b', verdict: 'teacher_only' }],
        summary: { both: 0, teacherOnly: 1, systemOnly: 0, neither: 0, extra: 0, agreement: 'none' },
      }),
    );

    expect(sqlCalls('INSERT INTO examcollect.audit_no_error_label')[0][1]).toEqual(['bai-1', 'gv-1', false]);
    const breakerRows = sqlCalls('INSERT INTO examcollect.auto_rule_breaker');
    expect(breakerRows).toHaveLength(1);
    expect(breakerRows[0][1].slice(0, 3)).toEqual(['gv-1', 'no_error', null]);
    expect(JSON.parse(breakerRows[0][1][3] as string)).toMatchObject({ n: 2, disagreements: 2 });
    expect(recompute).toHaveBeenCalledWith(m, 'gv-1', 'auto_rule_tripped', null, { noErrors: true, exceptResultId: 'bai-1' });
    expect(out).toEqual({ tripped: ['cau-dao-1'] });
  });

  it('cầu dao lớp không lỗi đang mở → vẫn ghi nhãn, không đếm', async () => {
    latest.mockResolvedValue(withErrors([]));
    noErrorOpen.mockResolvedValue(true);

    await service.recordLabelsAndEvaluate(m, 'gv-1', 'bai-1', reveal());

    expect(sqlCalls('INSERT INTO examcollect.audit_no_error_label')).toHaveLength(1);
    expect(countNoError).not.toHaveBeenCalled();
    expect(recompute).not.toHaveBeenCalled();
  });

  // Spec §5.3: lớp không lỗi = lượt tính mới nhất có `breakdown.errors` rỗng — cùng lớp mà cổng `no_error_auto_disabled`
  // của `decide()` và phạm vi `noErrors` của lượt tính lại chặn. Bài chỉ có lỗi bị bác vẫn có lỗi, dù tiết lộ không
  // liệt kê lỗi nào.
  it('bài chỉ có lỗi bị phản biện bác → KHÔNG thuộc lớp không lỗi', async () => {
    latest.mockResolvedValue(withErrors([{ ruleId: 'r-a', counted: 'refuted' }]));

    await service.recordLabelsAndEvaluate(m, 'gv-1', 'bai-1', reveal({ systemErrors: [] }));

    expect(sqlCalls('audit_no_error_label')).toEqual([]);
    expect(countNoError).not.toHaveBeenCalled();
  });
});

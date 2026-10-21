jest.mock('./score-inputs', () => ({
  currentPriceVersion: jest.fn(),
  latestComputationRow: jest.fn(),
  loadRuleSnapshots: jest.fn(),
  loadScoreContext: jest.fn(),
  lockTeacherScoring: jest.fn(),
  teacherOfResult: jest.fn(),
}));
jest.mock('./score-core', () => ({ ...jest.requireActual('./score-core'), computeScore: jest.fn() }));
jest.mock('../auto-breaker/breaker-queries', () => ({
  loadOpenBreakerRuleKeys: jest.fn(),
  isNoErrorBreakerOpen: jest.fn(),
}));

import type { DataSource, EntityManager } from 'typeorm';
import type { AuditLogService } from '../../admin/audit-log.service';
import { isNoErrorBreakerOpen, loadOpenBreakerRuleKeys } from '../auto-breaker/breaker-queries';
import { computeScore, type ScoreCoreInput } from './score-core';
import { currentPriceVersion, loadRuleSnapshots, loadScoreContext } from './score-inputs';
import { ScoreService } from './score.service';

/**
 * Chỗ `compute()` dựng hai cờ tự chốt cho `computeScore` (spec 2026-10-21 §5.2): tập chặn = env ∪ cầu dao luật đang mở
 * của giảng viên; tự chốt bài không lỗi = env VÀ không có cầu dao lớp đang mở. Đi qua `preview()` — đường công khai
 * gọi thẳng `compute()` — và bắt đối số của `computeScore`. Xoá hai dòng truyền cờ thì mọi ca dưới đây đỏ.
 */
describe('ScoreService.compute — cờ tự chốt (env ∪ cầu dao DB)', () => {
  const KEYS = ['GRADING_AUTO_BLOCK_RULE_KEYS', 'GRADING_AUTO_NO_ERROR'] as const;
  const original: Record<string, string | undefined> = {};
  const manager = { tag: 'manager' } as unknown as EntityManager;
  const ds = { manager } as unknown as DataSource;

  const loadOpen = loadOpenBreakerRuleKeys as jest.MockedFunction<typeof loadOpenBreakerRuleKeys>;
  const noErrorOpen = isNoErrorBreakerOpen as jest.MockedFunction<typeof isNoErrorBreakerOpen>;
  const compute = computeScore as jest.MockedFunction<typeof computeScore>;

  function build(env: Partial<Record<(typeof KEYS)[number], string>>): ScoreService {
    for (const k of KEYS) {
      if (env[k] === undefined) delete process.env[k];
      else process.env[k] = env[k];
    }
    return new ScoreService(ds, {} as AuditLogService);
  }
  const lastInput = (): ScoreCoreInput => compute.mock.calls[compute.mock.calls.length - 1][0];
  const identity = <T>(rules: T): T => rules;

  beforeAll(() => {
    for (const k of KEYS) original[k] = process.env[k];
  });
  afterAll(() => {
    for (const k of KEYS) {
      if (original[k] === undefined) delete process.env[k];
      else process.env[k] = original[k];
    }
  });
  beforeEach(() => {
    jest.clearAllMocks();
    (loadScoreContext as jest.Mock).mockResolvedValue({
      resultId: 'r-1',
      teacherId: 'gv-1',
      stored: { version: 1 },
      bundleCases: [],
      rubric: [],
      waivedCriteria: [],
      exceptions: new Map(),
      rulerTrust: null,
    });
    (currentPriceVersion as jest.Mock).mockResolvedValue(null);
    (loadRuleSnapshots as jest.Mock).mockResolvedValue([]);
    compute.mockReturnValue({ outcome: 'auto', ungradable: null, scoreHundredths: 1000, breakdown: {} as never });
    loadOpen.mockResolvedValue([]);
    noErrorOpen.mockResolvedValue(false);
  });

  it('env không đặt, không cầu dao mở → tập chặn rỗng và tự chốt bài không lỗi bật (hành vi hôm nay)', async () => {
    await build({}).preview('r-1', identity);

    expect(lastInput().autoBlockedRuleKeys).toEqual(new Set());
    expect(lastInput().autoNoErrorEnabled).toBe(true);
    // Đọc cầu dao bằng CHÍNH manager của lượt tính (thấy dòng vừa chèn trong cùng giao dịch), theo giảng viên của bài.
    expect(loadOpen).toHaveBeenCalledWith(manager, 'gv-1');
    expect(noErrorOpen).toHaveBeenCalledWith(manager, 'gv-1');
  });

  it('tập chặn = env ∪ cầu dao luật đang mở, dựng Set MỚI — tập env không bị sửa', async () => {
    const svc = build({ GRADING_AUTO_BLOCK_RULE_KEYS: 'khoa_env' });

    loadOpen.mockResolvedValueOnce(['khoa_db']);
    await svc.preview('r-1', identity);
    expect(lastInput().autoBlockedRuleKeys).toEqual(new Set(['khoa_env', 'khoa_db']));

    // Lượt sau không còn cầu dao: nếu lượt trước đã nhét `khoa_db` vào tập env thì nó còn sót ở đây.
    loadOpen.mockResolvedValueOnce([]);
    await svc.preview('r-1', identity);
    expect(lastInput().autoBlockedRuleKeys).toEqual(new Set(['khoa_env']));
  });

  it('cầu dao luật mở, env không đặt → tập chặn chỉ có khoá của cầu dao', async () => {
    loadOpen.mockResolvedValueOnce(['sai_bien']);
    await build({}).preview('r-1', identity);
    expect(lastInput().autoBlockedRuleKeys).toEqual(new Set(['sai_bien']));
  });

  it('cầu dao lớp không lỗi mở → tự chốt bài không lỗi tắt dù env bật', async () => {
    noErrorOpen.mockResolvedValueOnce(true);
    await build({ GRADING_AUTO_NO_ERROR: 'true' }).preview('r-1', identity);
    expect(lastInput().autoNoErrorEnabled).toBe(false);
  });

  it('env GRADING_AUTO_NO_ERROR=false, không cầu dao → tắt', async () => {
    await build({ GRADING_AUTO_NO_ERROR: 'false' }).preview('r-1', identity);
    expect(lastInput().autoNoErrorEnabled).toBe(false);
  });
});

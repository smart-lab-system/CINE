import { DEFAULT_BUDGET, readInvestigationBudget } from './budget';

describe('readInvestigationBudget — trần §7', () => {
  it('không đặt env → đúng mặc định của spec: 25 lời gọi, 300 s, 150k token, 12 vòng', () => {
    expect(readInvestigationBudget({})).toEqual({
      budget: { maxToolCalls: 25, maxWallMs: 300_000, maxTokens: 150_000, maxRounds: 12 },
      warnings: [],
    });
    expect(DEFAULT_BUDGET.maxToolCalls).toBe(25);
  });

  it('đọc được từng trần từ env', () => {
    const { budget } = readInvestigationBudget({
      INVESTIGATE_MAX_TOOL_CALLS: '10',
      INVESTIGATE_MAX_WALL_MS: '60000',
      INVESTIGATE_MAX_TOKENS: '50000',
      INVESTIGATE_MAX_ROUNDS: '4',
    });
    expect(budget).toEqual({ maxToolCalls: 10, maxWallMs: 60_000, maxTokens: 50_000, maxRounds: 4 });
  });

  it('giá trị rỗng, 0, âm, lẻ hay chữ → mặc định KÈM cảnh báo, không bao giờ 0 hay NaN', () => {
    const { budget, warnings } = readInvestigationBudget({
      INVESTIGATE_MAX_TOOL_CALLS: '0',
      INVESTIGATE_MAX_WALL_MS: 'abc',
      INVESTIGATE_MAX_TOKENS: '1.5',
      INVESTIGATE_MAX_ROUNDS: '   ',
    });
    expect(budget).toEqual(DEFAULT_BUDGET);
    expect(warnings).toHaveLength(3); // chuỗi toàn khoảng trắng coi như không đặt
    expect(warnings.join(' ')).toMatch(/INVESTIGATE_MAX_TOOL_CALLS/);
  });
});

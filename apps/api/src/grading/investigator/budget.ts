import { InvestigationBudget } from './types';

/** Trần mặc định của spec §7 — đọc từ env, có mặc định. */
export const DEFAULT_BUDGET: InvestigationBudget = {
  maxToolCalls: 25,
  maxWallMs: 300_000,
  maxTokens: 150_000,
  maxRounds: 12,
};

const ENV_KEYS: Record<keyof InvestigationBudget, string> = {
  maxToolCalls: 'INVESTIGATE_MAX_TOOL_CALLS',
  maxWallMs: 'INVESTIGATE_MAX_WALL_MS',
  maxTokens: 'INVESTIGATE_MAX_TOKENS',
  maxRounds: 'INVESTIGATE_MAX_ROUNDS',
};

/**
 * Đọc trần từ env. Giá trị không phải số nguyên dương → mặc định KÈM cảnh báo: `Number('')`
 * là 0, và một trần 0 dừng mọi cuộc điều tra ở vòng đầu mà không ai hiểu vì sao — cùng họ
 * lỗi với `GRADE_CONCURRENCY` rỗng ở Plan 1.
 */
export function readInvestigationBudget(env: NodeJS.ProcessEnv): {
  budget: InvestigationBudget;
  warnings: string[];
} {
  const budget = { ...DEFAULT_BUDGET };
  const warnings: string[] = [];
  for (const key of Object.keys(ENV_KEYS) as (keyof InvestigationBudget)[]) {
    const set = env[ENV_KEYS[key]];
    if (set === undefined) continue;
    // Review M9: `KEY=` trong .env là CÓ đặt — ai đó định đặt mà quên số; im lặng là giấu lỗi đó.
    const raw = set.trim();
    const value = raw === '' ? NaN : Number(raw);
    if (Number.isInteger(value) && value > 0) {
      budget[key] = value;
    } else {
      warnings.push(
        `${ENV_KEYS[key]}=${JSON.stringify(raw)} không phải số nguyên dương — dùng mặc định ${DEFAULT_BUDGET[key]}`,
      );
    }
  }
  return { budget, warnings };
}

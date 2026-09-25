import { AIGradingProvider } from '../grading/ai-provider/ai-grading-provider';
import { KeywordGradingProvider } from '../grading/ai-provider/keyword-grading.provider';
import { ModelTier } from '../grading/investigator/model-pool';

/**
 * Mặt ngược của luật chống tốn tiền (spec 2026-09-20 §12.5 luật 2). Test
 * không được gọi API thật; eval thì không được chấm bằng stub — một bảng xanh
 * do đếm từ khoá chấm là con số đẹp giả.
 */
export function refuseReason(
  env: NodeJS.ProcessEnv,
  provider: AIGradingProvider,
  keyword: KeywordGradingProvider,
): string | null {
  if (env.NODE_ENV === 'test') return 'NODE_ENV=test — eval không chạy trong môi trường test';
  if (provider === keyword) {
    return 'không có bậc model thật (GRADING_TIER*_ / ANTHROPIC_API_KEY) — eval không chấm bằng đếm từ khoá';
  }
  return null;
}

/** Pipeline investigator: cùng luật T-EVAL-1, cộng hàng đợi eval phải hợp lệ (T-EVAL-13). */
export function refuseInvestigator(
  env: NodeJS.ProcessEnv,
  tiers: ModelTier[],
  sandbox: { ok: true } | { ok: false; error: string },
): string | null {
  if (env.NODE_ENV === 'test') return 'NODE_ENV=test — eval không chạy trong môi trường test';
  if (tiers.length === 0) {
    return 'không có bậc model tương thích OpenAI nào (GRADING_TIER*_) — vòng điều tra cần model thật';
  }
  if (!sandbox.ok) return sandbox.error;
  return null;
}

import { decide } from '../grading/decision/decide';
import { ALL_COMPONENTS, investigate, InvestigateComponents, InvestigateDeps } from '../grading/investigator/investigate';
import { InvestigationBudget, InvestigationContext, InvestigationResult } from '../grading/investigator/types';
import { parseHundredths } from '../grading/scoring/hundredths';
import { HostFingerprint } from '../sandbox/contract';
import { contextFor, errorRulesOf } from './context-from-fixture';
import { GateId } from './gates';
import { stripForGroup5 } from './group5';
import { expectedScoreHundredths, LoadedDataset } from './load-dataset';
import { CaseRecord, runCases, RunSummary } from './runner-core';
import { FrozenBundle } from './test-bundle';

function hostOf(result: InvestigationResult): HostFingerprint | null {
  for (const s of Object.values(result.investigation.structuredResults)) if (s.host) return s.host;
  return null;
}

/**
 * Pipeline `investigator` trên bộ dữ liệu eval (§9 bước 2, §12). Điểm do CODE tính từ luật
 * tìm thấy trên bảng đóng băng; kết cục chấm được luôn là `flagged` (Q4 — chưa có công thức tự
 * quyết). Mọi bậc model hỏng là lượt LỖI, không phải một kết cục của agent.
 */
export async function runInvestigator(opts: {
  dataset: LoadedDataset;
  bundles: Map<string, FrozenBundle>;
  tier: 'fast' | 'full';
  concurrency: number;
  budget: InvestigationBudget;
  /** θ của công thức tự quyết (§4.2) — người gọi đọc bằng `readAutoThreshold`. */
  theta: number;
  /** model → trần tin cậy của bậc; chỉ kéo được `llm_only` xuống (§4.2). */
  ceilings: Map<string, number>;
  deps: InvestigateDeps;
  components?: InvestigateComponents;
  /** Chỉ để test thay; mặc định là `investigate` thật. */
  investigateFn?: (ctx: InvestigationContext, deps: InvestigateDeps, components: InvestigateComponents) => Promise<InvestigationResult>;
}): Promise<{ records: CaseRecord[]; summary: RunSummary; sandboxHost: HostFingerprint | null }> {
  const run = opts.investigateFn ?? investigate;
  const components = opts.components ?? ALL_COMPONENTS;
  let sandboxHost: HostFingerprint | null = null;

  const { records, summary } = await runCases({
    dataset: opts.dataset,
    tier: opts.tier,
    concurrency: opts.concurrency,
    attemptOnce: async (de, c, attempt) => {
      const base = {
        de: de.manifest.id, caseId: c.id, group: c.group, attempt, pipeline: 'investigator' as const,
        expectedOutcome: c.expectedOutcome, expectedScoreHundredths: expectedScoreHundredths(de, c),
        expectedRuleIds: c.expectedRuleIds, violation: null as GateId | null,
      };
      const started = Date.now();
      try {
        const bundle = opts.bundles.get(de.manifest.id);
        if (!bundle) throw new Error(`không có gói test cho đề ${de.manifest.id}`);
        const ctx = contextFor(de, c, bundle, opts.budget);
        const result = await run(ctx, opts.deps, components);
        sandboxHost ??= hostOf(result);
        const exhausted = result.kind === 'ungradable' && result.investigation.budget.stopReason === 'models_exhausted';
        const rulesSeen = ctx.rules.map((r) => ({ ruleKey: r.ruleKey, checkedBy: r.checkedBy }));
        // 3a: kết cục và điểm là của decide() — sàn, §4.3, giá, nguồn gốc, MỘT công thức tự quyết.
        const decision = decide({
          pipeline: 'investigator',
          result,
          bundle,
          rubric: de.manifest.rubric.map((r) => ({ key: r.key, maxHundredths: parseHundredths(r.maxPoints) })),
          rules: errorRulesOf(de),
          rulesSeen,
          waivedCriteria: de.manifest.waivedCriteria,
          modelCeiling: Math.min(1, ...result.investigation.modelsUsed.map((m) => opts.ceilings.get(m) ?? 0.5)),
          theta: opts.theta,
        });
        const bySource = { deterministic: 0, llm_with_tools: 0, llm_only: 0 };
        for (const e of decision.errors) bySource[e.source] += e.deductionHundredths ?? 0;
        return stripForGroup5({
          ...base,
          status: exhausted ? 'error' : 'ok',
          // Lý do của vòng lặp đã nói "mọi bậc model đều hỏng" kèm lý do từng bậc (review M2).
          error: exhausted ? (result.ungradable?.reason ?? 'mọi bậc model đều hỏng').slice(0, 500) : null,
          outcome: exhausted ? null : decision.outcome === 'auto' ? 'graded' : decision.outcome,
          scoreHundredths: decision.scoreHundredths,
          foundRuleIds: decision.outcome === 'ungradable' ? null : decision.errors.map((e) => e.ruleKey),
          modelUsed: result.investigation.modelsUsed.join('+') || null,
          tokensIn: result.usage.inputTokens,
          tokensOut: result.usage.outputTokens,
          wallMs: Date.now() - started,
          toolCalls: result.investigation.budget.toolCalls,
          stopReason: result.investigation.budget.stopReason,
          flags: [...result.flags, ...decision.caseFlags.map((f) => f.code), ...decision.errorFlags.map((f) => `${f.code}:${f.ruleKey}`)],
          deductionBySource: decision.outcome === 'ungradable' ? null : bySource,
          // Lỗi bị loại (luật, lý do) đi kèm hồ sơ: evidence_rejected vô hại (luật không có trong bảng)
          // hay làm điểm cao oan (luật thật mất bằng chứng) chỉ đo được khi cases.jsonl mang nó.
          // `rulesSeen` đi kèm để quyết lại trên hồ sơ này (T-TIER) không phải dựng lại nó từ bảng lỗi
          // HIỆN TẠI — dựng lại như vậy là mở lại lỗ review I3.
          investigation: { ...result.investigation, rejected: result.rejected, rulesSeen, decision },
          summaryText: result.summary,
        });
      } catch (error) {
        return stripForGroup5({
          ...base, status: 'error', error: error instanceof Error ? error.message.slice(0, 300) : String(error),
          outcome: null, scoreHundredths: null, foundRuleIds: null, modelUsed: null, tokensIn: 0, tokensOut: 0,
          wallMs: Date.now() - started, toolCalls: null, stopReason: null, flags: [], investigation: null, summaryText: null,
          deductionBySource: null,
        });
      }
    },
  });
  return { records, summary, sandboxHost };
}

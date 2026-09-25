import { AIGradingProvider, GradingRequest } from '../grading/ai-provider/ai-grading-provider';
import { DocumentResolver } from '../grading/content-resolver/document-resolver';
import { gradeOneShot } from '../grading/one-shot-grade';
import { parseHundredths } from '../grading/scoring/hundredths';
import { GateId } from './gates';
import { expectedScoreHundredths, LoadedDataset, LoadedDe } from './load-dataset';
import { ManifestCase } from './manifest.schema';
import { CaseRecord, runCases, RunSummary } from './runner-core';

export type { CaseRecord, RunSummary } from './runner-core';

const resolver = new DocumentResolver();

function requestFor(de: LoadedDe, c: ManifestCase, content: string): GradingRequest {
  return {
    studentMssv: c.id,
    content,
    // Đường hôm nay đọc mã như văn bản qua DocumentResolver (spec §0).
    deliverableType: 'document',
    criteria: de.manifest.rubric.map((r) => ({
      id: r.key,
      description: r.description,
      maxPoints: parseHundredths(r.maxPoints) / 100,
    })),
    // Đề và đáp án mẫu đi dạng VĂN BẢN qua ghi chú (mức 3 hôm nay) — fixture
    // không có PDF. Ghi vào run.json là `reference: 'note-text'`.
    reference: {
      modelAnswerNote: `Đề bài:\n${de.manifest.statement}\n\nĐáp án mẫu:\n${de.modelSource}`,
    },
  };
}

/**
 * Chạy BASELINE — đường chấm một-phát hôm nay, qua đúng `gradeOneShot` mà
 * worker chấm dùng — trên bộ dữ liệu eval (spec 2026-09-20 §9 bước 0, §12.6).
 *
 * Không mở DB, không ghi bảng nào (§12.5, T-EVAL-5): ngữ cảnh đến từ fixture,
 * kết quả trả về cho người gọi ghi ra file. Provider lỗi ở một lượt thì lượt
 * đó là `error`, không phải vi phạm và không phải 0 điểm. Phần điều phối — k
 * lượt, chạy bù, cổng, tổng hợp — nằm ở `runner-core`, dùng chung với pipeline
 * investigator của bước 2.
 */
export async function runBaseline(opts: {
  dataset: LoadedDataset;
  provider: AIGradingProvider;
  tier: 'fast' | 'full';
  concurrency: number;
  /**
   * Những giá trị `modelUsed` có nghĩa là KHÔNG model nào chấm — sàn đếm từ khoá của chuỗi
   * (TierChain rơi xuống đó khi các bậc trên `tier_dead` / `bad_output`).
   * Lượt như thế là `error`: điểm đếm từ khoá không được vào MAE hay cổng.
   */
  stubModels?: string[];
}): Promise<{ records: CaseRecord[]; summary: RunSummary }> {
  const stubModels = new Set(opts.stubModels ?? []);

  const attemptOnce = async (de: LoadedDe, c: ManifestCase, attempt: number): Promise<CaseRecord> => {
    const base = {
      de: de.manifest.id,
      caseId: c.id,
      group: c.group,
      attempt,
      pipeline: 'baseline' as const,
      expectedOutcome: c.expectedOutcome,
      expectedScoreHundredths: expectedScoreHundredths(de, c),
      expectedRuleIds: c.expectedRuleIds,
      // Baseline không có khái niệm ruleId (§12.6), không gọi công cụ nào.
      foundRuleIds: null,
      violation: null as GateId | null,
      toolCalls: null,
      stopReason: null,
      flags: [],
      investigation: null,
      summaryText: null,
    };
    const started = Date.now();
    try {
      const content = (await resolver.resolve(Buffer.from(de.sources.get(c.id)!, 'utf8'), c.file)).text;
      const run = await gradeOneShot(opts.provider, requestFor(de, c, content));
      if (stubModels.has(run.outcome.modelUsed)) {
        return {
          ...base,
          status: 'error',
          error: `rơi về sàn ${run.outcome.modelUsed} — không có model thật nào chấm lượt này`,
          outcome: null,
          scoreHundredths: null,
          modelUsed: run.outcome.modelUsed,
          tokensIn: run.outcome.usage.inputTokens,
          tokensOut: run.outcome.usage.outputTokens,
          wallMs: Date.now() - started,
        };
      }
      return {
        ...base,
        status: 'ok',
        error: null,
        outcome: run.confident ? 'graded' : 'flagged',
        // Ranh giới duy nhất từ số thực sang số nguyên: pointsFor() làm tròn
        // tới hai chữ số lẻ, nên ×100 rồi làm tròn là chính xác.
        scoreHundredths: Math.round(run.scored.totalScore * 100),
        modelUsed: run.outcome.modelUsed,
        tokensIn: run.outcome.usage.inputTokens,
        tokensOut: run.outcome.usage.outputTokens,
        wallMs: Date.now() - started,
      };
    } catch (error) {
      return {
        ...base,
        status: 'error',
        error: error instanceof Error ? error.message.slice(0, 300) : String(error),
        outcome: null,
        scoreHundredths: null,
        modelUsed: null,
        tokensIn: 0,
        tokensOut: 0,
        wallMs: Date.now() - started,
      };
    }
  };

  return runCases({ dataset: opts.dataset, tier: opts.tier, concurrency: opts.concurrency, attemptOnce });
}

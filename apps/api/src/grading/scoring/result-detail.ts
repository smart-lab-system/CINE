import { DataSource } from 'typeorm';
import { GradingResultEntity } from '../entities/grading-result.entity';
import { GradingPipeline } from '../grading-model.types';
import { CurrentScore, currentScore } from './current-score';
import { latestComputationRow } from './score-inputs';
import type { ScoreBreakdown } from './score-core';
import type { StoredInvestigation } from './stored-investigation';

export interface ResultDetailError {
  ruleId: string;
  ruleKey: string;
  ruleName: string;
  criterionKey: string;
  source: ScoreBreakdown['errors'][number]['source'];
  toolCallIds: string[];
  deductionHundredths: number | null;
  counted: ScoreBreakdown['errors'][number]['counted'];
}

export interface ResultDetail {
  pipeline: GradingPipeline;
  currentScore: number | null;
  currentScoreSource: CurrentScore['source'];
  status: string;
  ungradableClass: string | null;
  ungradableReason: string | null;
  breakdown: (Omit<ScoreBreakdown, 'errors'> & { errors: ResultDetailError[] }) | null;
  investigation: StoredInvestigation['result'] | null;
}

interface ScoreSourceRow {
  latestComputationScore: string | null;
  finalizedComputationScore: string | null;
  latestManualScore: string | null;
}

interface LatestReviewRow {
  finalScore: string;
}

/**
 * Chi tiết MỘT lượt tính điểm + đường điều tra của nó (Hồ sơ một bài, §5). Không route nào trả
 * cái này trước plan `2026-09-27-grading-knowledge-and-result-ui.md` — `listForSession` (danh
 * sách) chỉ trả `currentScore`, không trả `breakdown`/`investigation`. Chỉ đọc, không tính lại gì:
 * `computeScore`/`ScoreService` đã tính và lưu từ trước.
 */
export async function loadResultDetail(ds: DataSource, result: GradingResultEntity): Promise<ResultDetail> {
  const computation = await latestComputationRow(ds.manager, result.id);
  const [attempt] = result.currentAttemptId
    ? await ds.query(`SELECT investigation FROM examcollect.grading_attempt WHERE id = $1`, [result.currentAttemptId])
    : [null];
  const stored = attempt?.investigation as StoredInvestigation | undefined;

  let breakdown: ResultDetail['breakdown'] = null;
  if (computation) {
    const ruleIds = computation.breakdown.errors.map((e) => e.ruleId);
    const names = new Map<string, string>();
    if (ruleIds.length > 0) {
      const rows: { id: string; name: string }[] = await ds.query(
        `SELECT r.id, v.name FROM examcollect.error_rule r
           JOIN examcollect.error_rule_revision v ON v.id = r.current_revision_id
          WHERE r.id = ANY($1::uuid[])`,
        [ruleIds],
      );
      for (const row of rows) names.set(row.id, row.name);
    }
    breakdown = {
      ...computation.breakdown,
      errors: computation.breakdown.errors.map((e) => ({ ...e, ruleName: names.get(e.ruleId) ?? e.ruleKey })),
    };
  }

  const [scoreSource]: ScoreSourceRow[] = await ds.query(
    `SELECT
        (SELECT c.score FROM examcollect.score_computation c
          WHERE c.grading_result_id = g.id ORDER BY c.created_at DESC, c.id DESC LIMIT 1) AS "latestComputationScore",
        fc.score AS "finalizedComputationScore",
        (SELECT t.final_score FROM examcollect.teacher_review t
          WHERE t.grading_result_id = g.id AND t.kind = 'manual_score'
          ORDER BY t.reviewed_at DESC, t.id DESC LIMIT 1) AS "latestManualScore"
       FROM examcollect.grading_result g
       LEFT JOIN examcollect.score_computation fc ON fc.id = g.finalized_computation_id
      WHERE g.id = $1`,
    [result.id],
  );
  const [latestReview]: (LatestReviewRow & { kind: string })[] = await ds.query(
    `SELECT tr.final_score AS "finalScore", tr.kind AS "kind"
       FROM examcollect.teacher_review tr
      WHERE tr.grading_result_id = $1 AND tr.final_score IS NOT NULL
      ORDER BY tr.reviewed_at DESC, tr.id DESC LIMIT 1`,
    [result.id],
  );

  const current = currentScore({
    pipeline: result.pipeline,
    aiTotalScore: result.aiTotalScore,
    latestScoredReview: latestReview
      ? { kind: latestReview.kind as never, finalScore: latestReview.finalScore }
      : null,
    latestManualScore: scoreSource?.latestManualScore ?? null,
    finalized: result.status === 'finalized' || result.status === 'exported',
    finalizedComputationScore: scoreSource?.finalizedComputationScore ?? null,
    latestComputationScore: scoreSource?.latestComputationScore ?? null,
  });

  return {
    pipeline: result.pipeline,
    currentScore: current.value,
    currentScoreSource: current.source,
    status: result.status,
    ungradableClass: result.ungradableClass,
    ungradableReason: result.ungradableReason,
    breakdown,
    investigation: stored?.result ?? null,
  };
}

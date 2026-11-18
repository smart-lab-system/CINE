import { assertApproachKey, selectWinningApproach } from './select-approach';
import { scoreQs } from './score-qs';
import type { QsApproach, QsScoreOutput, StepVerdict } from './qs.types';

export type QsSelectionSource = 'ai' | 'fallback_max_earned';

export interface QsCriterionRef {
  id: string;
  /** criterion.key = stepKey QS. */
  key: string;
  approachKey: string;
}

export interface QsAiCriterionVerdict {
  criterionId: string;
  verdict: StepVerdict;
  evidence: string;
}

export interface ResolveAndScoreQsInput {
  approaches: QsApproach[];
  criteria: QsCriterionRef[];
  criterionResults: QsAiCriterionVerdict[];
  /** Key AI trả về; null/invalid → fallback max earned. */
  aiSelectedApproachKey: string | null | undefined;
  problemPointsHundredths?: number;
}

export interface ResolveAndScoreQsResult {
  selectedApproachKey: string;
  selectionSource: QsSelectionSource;
  scored: QsScoreOutput;
  /**
   * Điểm từng tiêu chí: bước thuộc cách giải thắng lấy earned từ scoreQs;
   * bước hướng khác = 0 (giữ verdict/evidence để audit).
   */
  criterionResults: {
    criterionId: string;
    verdict: StepVerdict;
    points: number;
    evidence: string;
  }[];
  totalScore: number;
  unknownCriterionIds: string[];
}

function buildStepResultsByApproach(
  approaches: QsApproach[],
  criteria: QsCriterionRef[],
  verdicts: QsAiCriterionVerdict[],
): Map<string, { stepKey: string; verdict: StepVerdict }[]> {
  const byId = new Map(verdicts.map((v) => [v.criterionId, v]));
  const out = new Map<string, { stepKey: string; verdict: StepVerdict }[]>();
  for (const a of approaches) out.set(a.key, []);

  for (const c of criteria) {
    const v = byId.get(c.id);
    const list = out.get(c.approachKey);
    if (!list) continue;
    list.push({
      stepKey: c.key,
      verdict: v?.verdict ?? 'not_met',
    });
  }
  return out;
}

/**
 * UC33: chọn cách giải (AI nếu hợp lệ, không thì max earned) rồi scoreQs.
 */
export function resolveAndScoreQs(input: ResolveAndScoreQsInput): ResolveAndScoreQsResult {
  const { approaches, criteria, criterionResults } = input;
  if (approaches.length === 0) {
    throw new Error('QS rubric không có cách giải nào');
  }

  const byApproach = buildStepResultsByApproach(approaches, criteria, criterionResults);

  let selectedApproachKey: string;
  let selectionSource: QsSelectionSource;
  const aiKey = input.aiSelectedApproachKey?.trim();
  if (aiKey) {
    try {
      selectedApproachKey = assertApproachKey(approaches, aiKey);
      selectionSource = 'ai';
    } catch {
      const win = selectWinningApproach(approaches, byApproach);
      selectedApproachKey = win.selectedApproachKey;
      selectionSource = 'fallback_max_earned';
    }
  } else {
    const win = selectWinningApproach(approaches, byApproach);
    selectedApproachKey = win.selectedApproachKey;
    selectionSource = 'fallback_max_earned';
  }

  const stepResults = byApproach.get(selectedApproachKey) ?? [];
  const scored = scoreQs({
    approaches,
    selectedApproachKey,
    stepResults,
    problemPointsHundredths: input.problemPointsHundredths,
  });

  const earnedByStep = new Map(
    scored.perStep.map((p) => [p.stepKey, p.earnedHundredths / 100]),
  );
  const knownIds = new Set(criteria.map((c) => c.id));
  const unknownCriterionIds = criterionResults
    .map((r) => r.criterionId)
    .filter((id) => !knownIds.has(id));

  const byVerdict = new Map(criterionResults.map((r) => [r.criterionId, r]));
  const enforced = criteria.map((c) => {
    const row = byVerdict.get(c.id);
    const onWinning = c.approachKey === selectedApproachKey;
    return {
      criterionId: c.id,
      verdict: (row?.verdict ?? 'not_met') as StepVerdict,
      evidence: row?.evidence ?? '',
      points: onWinning ? (earnedByStep.get(c.key) ?? 0) : 0,
    };
  });

  return {
    selectedApproachKey,
    selectionSource,
    scored,
    criterionResults: enforced,
    totalScore: scored.scoreHundredths / 100,
    unknownCriterionIds,
  };
}

/** Map criterion.id → approachKey từ cấu trúc QS + danh sách bước. */
export function approachKeyByCriterionId(
  criteria: { id: string; key: string }[],
  approaches: QsApproach[],
): Map<string, string> {
  const stepToApproach = new Map<string, string>();
  for (const a of approaches) {
    for (const s of a.steps) stepToApproach.set(s.key, a.key);
  }
  const out = new Map<string, string>();
  for (const c of criteria) {
    const ak = stepToApproach.get(c.key);
    if (ak) out.set(c.id, ak);
  }
  return out;
}

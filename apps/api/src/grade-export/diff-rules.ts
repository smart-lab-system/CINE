import type { BreakdownError, ScoreBreakdown } from '../grading/scoring/score-core';
import { roundHalfUp } from './rounding';

export interface RuleDelta {
  ruleId: string;
  ruleKey: string;
  revisionId: string;
  /** Dương: luật này nay trừ NHIỀU hơn (điểm giảm). Âm: trừ ít hơn (điểm tăng). Phần trăm điểm. */
  delta: number;
}

export type Cause =
  | { kind: 'rule'; ruleKey: string; ruleName: string | null; delta: number }
  | { kind: 'manual_score' }
  | { kind: 'review' }
  | { kind: 'rounding' }
  | { kind: 'unknown' };

/** Mức trừ HIỆU LỰC: chỉ lỗi `counted` mới trừ điểm (`excluded`, `refuted`, `unpriced` thì không). */
const effective = (e: BreakdownError): number => (e.counted === 'counted' ? (e.deductionHundredths ?? 0) : 0);

/** Luật nào đổi mức trừ giữa hai lượt tính — khuôn `changedRules` ở `score.service.ts` (private nên viết riêng). */
export function diffRules(before: ScoreBreakdown | null, after: ScoreBreakdown | null): RuleDelta[] {
  const b = new Map((before?.errors ?? []).map((e) => [e.ruleId, e] as const));
  const a = new Map((after?.errors ?? []).map((e) => [e.ruleId, e] as const));
  const out: RuleDelta[] = [];
  for (const id of new Set([...b.keys(), ...a.keys()])) {
    const nextError = a.get(id);
    const prevError = b.get(id);
    const delta = (nextError ? effective(nextError) : 0) - (prevError ? effective(prevError) : 0);
    if (delta === 0) continue;
    const any = (nextError ?? prevError)!;
    out.push({ ruleId: id, ruleKey: any.ruleKey, revisionId: any.revisionId, delta });
  }
  return out;
}

export interface AttributeInput {
  direction: 'up' | 'down';
  currentSource: string;
  /** Giá trị ĐÃ GHI lần trước và bước làm tròn của lượt đó (phần trăm điểm). */
  previousWritten: number;
  previousStep: number;
  /** Điểm THÔ hiện tại (phần trăm), CHƯA làm tròn. */
  currentRaw: number;
  previousBreakdown: ScoreBreakdown | null;
  currentBreakdown: ScoreBreakdown | null;
  /** revisionId → tên luật. */
  ruleNames: ReadonlyMap<string, string>;
}

/**
 * Vì sao điểm ĐÃ LÀM TRÒN của sinh viên này đổi so với lần ghi trước (D15). Không đoán: không so được thì
 * `unknown`, không gán bừa cho một luật.
 */
export function attribute(i: AttributeInput): Cause[] {
  // Điểm thô hiện tại, làm tròn theo bước CỦA LƯỢT TRƯỚC, vẫn ra đúng giá trị đã ghi → điều duy nhất đổi là bước làm tròn.
  // Không cần id lượt tính, nên bài chấm tay hay tự luận (không có lượt tính) cũng nhận ra được.
  if (roundHalfUp(i.currentRaw, i.previousStep) === i.previousWritten) return [{ kind: 'rounding' }];
  if (i.currentSource === 'manual') return [{ kind: 'manual_score' }];
  if (i.currentSource === 'review') return [{ kind: 'review' }];
  if (i.previousBreakdown === null || i.currentBreakdown === null) return [{ kind: 'unknown' }];
  const causes = diffRules(i.previousBreakdown, i.currentBreakdown)
    .filter((d) => (i.direction === 'down' ? d.delta > 0 : d.delta < 0))
    .map((d): Cause => ({ kind: 'rule', ruleKey: d.ruleKey, ruleName: i.ruleNames.get(d.revisionId) ?? null, delta: d.delta }));
  return causes.length > 0 ? causes : [{ kind: 'unknown' }];
}

export interface CauseTally {
  kind: Cause['kind'];
  ruleKey: string | null;
  ruleName: string | null;
  students: number;
}
export interface ChangesSummary {
  previousExports: number;
  up: number;
  down: number;
  same: number;
  new: number;
  downByCause: CauseTally[];
  upByCause: CauseTally[];
}

function tally(rows: { causes: Cause[] }[]): CauseTally[] {
  const byKey = new Map<string, CauseTally>();
  for (const row of rows) {
    for (const cause of row.causes) {
      const key = cause.kind === 'rule' ? `rule:${cause.ruleKey}` : cause.kind;
      const entry = byKey.get(key) ?? {
        kind: cause.kind,
        ruleKey: cause.kind === 'rule' ? cause.ruleKey : null,
        ruleName: cause.kind === 'rule' ? cause.ruleName : null,
        students: 0,
      };
      entry.students += 1;
      byKey.set(key, entry);
    }
  }
  return [...byKey.values()].sort((x, y) => y.students - x.students || (x.ruleKey ?? x.kind).localeCompare(y.ruleKey ?? y.kind));
}

/** Dải "↓ N giảm · ↑ M tăng" của màn xuất lại; `null` ở lượt xuất đầu tiên. */
export function summarizeChanges(
  rows: { direction: 'up' | 'down' | 'same' | 'new' | null; causes: Cause[] }[],
  previousExports: number,
): ChangesSummary | null {
  if (previousExports === 0) return null;
  const count = (d: 'up' | 'down' | 'same' | 'new') => rows.filter((r) => r.direction === d).length;
  return {
    previousExports,
    up: count('up'),
    down: count('down'),
    same: count('same'),
    new: count('new'),
    downByCause: tally(rows.filter((r) => r.direction === 'down')),
    upByCause: tally(rows.filter((r) => r.direction === 'up')),
  };
}

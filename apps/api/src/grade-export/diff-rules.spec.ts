import type { BreakdownError, ScoreBreakdown } from '../grading/scoring/score-core';
import { attribute, diffRules, summarizeChanges } from './diff-rules';

const err = (ruleKey: string, deductionHundredths: number | null, counted: BreakdownError['counted'] = 'counted'): BreakdownError => ({
  ruleId: `id-${ruleKey}`, revisionId: `rev-${ruleKey}`, ruleKey, criterionKey: 'tinh_dung', source: 'deterministic', toolCallIds: [], deductionHundredths, counted,
});
const bd = (...errors: BreakdownError[]): ScoreBreakdown => ({
  errors, perCriterion: [], caseFlags: [], errorFlags: [], confidence: null, mismatchedRules: [], notConsidered: [], ungradable: null,
});

describe('diffRules — effective deduction = counted ? deduction : 0', () => {
  it('a rule that appeared costs more (+), a rule that disappeared costs less (−)', () => {
    expect(diffRules(bd(err('a', 150)), bd(err('a', 150), err('b', 50)))).toEqual([{ ruleId: 'id-b', ruleKey: 'b', revisionId: 'rev-b', delta: 50 }]);
    expect(diffRules(bd(err('a', 150), err('b', 50)), bd(err('a', 150)))).toEqual([{ ruleId: 'id-b', ruleKey: 'b', revisionId: 'rev-b', delta: -50 }]);
  });
  it('a price change is the difference in deduction', () => {
    expect(diffRules(bd(err('a', 150)), bd(err('a', 200)))).toMatchObject([{ ruleKey: 'a', delta: 50 }]);
  });
  it('counted → excluded/refuted stops costing anything; unpriced → counted starts', () => {
    expect(diffRules(bd(err('a', 150)), bd(err('a', 150, 'excluded')))).toMatchObject([{ delta: -150 }]);
    expect(diffRules(bd(err('a', 150)), bd(err('a', 150, 'refuted')))).toMatchObject([{ delta: -150 }]);
    expect(diffRules(bd(err('a', null, 'unpriced')), bd(err('a', 150)))).toMatchObject([{ delta: 150 }]);
  });
  it('identical breakdowns differ in nothing; a missing "before" makes everything +', () => {
    expect(diffRules(bd(err('a', 150)), bd(err('a', 150)))).toEqual([]);
    expect(diffRules(null, bd(err('a', 150)))).toMatchObject([{ delta: 150 }]);
    expect(diffRules(bd(err('a', 150)), null)).toMatchObject([{ delta: -150 }]);
  });
});

describe('attribute — why did this student’s rounded score change?', () => {
  const names = new Map([['rev-a', 'Sai biên']]);
  const base = { currentSource: 'finalized', previousWritten: 850, previousStep: 1, currentRaw: 800, previousBreakdown: bd(err('a', 150)), currentBreakdown: bd(err('a', 200)), ruleNames: names };

  it('a rule that now costs more explains a decrease', () => {
    expect(attribute({ ...base, direction: 'down' })).toEqual([{ kind: 'rule', ruleKey: 'a', ruleName: 'Sai biên', delta: 50 }]);
  });
  it('a rule that now costs less explains an increase — and a decrease is never blamed on it', () => {
    const flip = { ...base, previousWritten: 800, currentRaw: 850, previousBreakdown: bd(err('a', 200)), currentBreakdown: bd(err('a', 150)) };
    expect(attribute({ ...flip, direction: 'up' })).toMatchObject([{ kind: 'rule', delta: -50 }]);
    expect(attribute({ ...flip, direction: 'down' })).toEqual([{ kind: 'unknown' }]);
  });
  it('a score that rounds to what was written under the OLD step means only the step changed', () => {
    // 7,25 was written as 7,5 at step 0,5; at step 0,01 it is 7,25 — lower, but only because of the step.
    expect(attribute({ ...base, previousWritten: 750, previousStep: 50, currentRaw: 725, direction: 'down' })).toEqual([{ kind: 'rounding' }]);
  });
  it('the same holds for a hand-graded score, which has no computation to compare', () => {
    expect(attribute({ ...base, currentSource: 'manual', previousWritten: 550, previousStep: 50, currentRaw: 525, direction: 'down' })).toEqual([{ kind: 'rounding' }]);
  });
  it('a finer step can also expose a small real change; it is still called rounding, because that is what the teacher can see', () => {
    expect(attribute({ ...base, previousWritten: 700, previousStep: 50, currentRaw: 720, direction: 'up' })).toEqual([{ kind: 'rounding' }]);
  });
  it('a hand-graded or reviewed score is named as such', () => {
    expect(attribute({ ...base, currentSource: 'manual', direction: 'down' })).toEqual([{ kind: 'manual_score' }]);
    expect(attribute({ ...base, currentSource: 'review', direction: 'down' })).toEqual([{ kind: 'review' }]);
  });
  it('no earlier computation to compare with is "unknown", not a guess', () => {
    expect(attribute({ ...base, previousBreakdown: null, direction: 'down' })).toEqual([{ kind: 'unknown' }]);
    expect(attribute({ ...base, currentBreakdown: null, direction: 'down' })).toEqual([{ kind: 'unknown' }]);
  });
  it('a rule with no name on file still gets a cause, with a null name', () => {
    expect(attribute({ ...base, ruleNames: new Map(), direction: 'down' })).toEqual([{ kind: 'rule', ruleKey: 'a', ruleName: null, delta: 50 }]);
  });
});

describe('summarizeChanges', () => {
  const rule = (ruleKey: string, ruleName: string) => ({ kind: 'rule' as const, ruleKey, ruleName, delta: 50 });
  it('is null on a first export', () => {
    expect(summarizeChanges([{ direction: null, causes: [] }], 0)).toBeNull();
  });
  it('counts directions and tallies causes per direction, one count per student', () => {
    const out = summarizeChanges(
      [
        { direction: 'down', causes: [rule('a', 'Sai biên')] },
        { direction: 'down', causes: [rule('a', 'Sai biên'), { kind: 'rounding' }] },
        { direction: 'up', causes: [{ kind: 'manual_score' }] },
        { direction: 'same', causes: [] },
        { direction: 'new', causes: [] },
        { direction: null, causes: [] },
      ],
      2,
    );
    expect(out).toMatchObject({ previousExports: 2, up: 1, down: 2, same: 1, new: 1 });
    expect(out!.downByCause).toEqual([
      { kind: 'rule', ruleKey: 'a', ruleName: 'Sai biên', students: 2 },
      { kind: 'rounding', ruleKey: null, ruleName: null, students: 1 },
    ]);
    expect(out!.upByCause).toEqual([{ kind: 'manual_score', ruleKey: null, ruleName: null, students: 1 }]);
  });
});

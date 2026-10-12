import { currentScore, type CurrentScoreInput } from '../grading/scoring/current-score';
import { pickScore } from './score-string';

const base: CurrentScoreInput = {
  pipeline: 'investigator', aiTotalScore: null, latestScoredReview: null, latestManualScore: null,
  finalized: false, finalizedComputationScore: null, latestComputationScore: null,
};

const CASES: [string, CurrentScoreInput, string | null, string][] = [
  ['one_shot: the teacher review wins over the AI score', { ...base, pipeline: 'one_shot', aiTotalScore: '7.00', latestScoredReview: { kind: 'review', finalScore: '6.50' } }, '6.50', 'review'],
  ['one_shot: the AI score when nobody reviewed', { ...base, pipeline: 'one_shot', aiTotalScore: '7.00' }, '7.00', 'ai'],
  ['one_shot: nothing', { ...base, pipeline: 'one_shot' }, null, 'none'],
  ['investigator: a manual score beats everything', { ...base, latestManualScore: '5.25', finalized: true, finalizedComputationScore: '9.00', latestComputationScore: '9.50' }, '5.25', 'manual'],
  ['investigator: finalized uses the FINALIZED computation, not the latest', { ...base, finalized: true, finalizedComputationScore: '9.00', latestComputationScore: '8.00' }, '9.00', 'finalized'],
  ['investigator: not finalized uses the latest computation', { ...base, finalizedComputationScore: '9.00', latestComputationScore: '8.00' }, '8.00', 'computation'],
  ['investigator: ai_total_score is never the current score', { ...base, aiTotalScore: '9.99' }, null, 'none'],
  ['investigator: nothing', base, null, 'none'],
];

describe('pickScore — same source and same number as currentScore(), but as a string', () => {
  it.each(CASES)('%s', (_name, input, raw, source) => {
    const picked = pickScore(input);
    const current = currentScore(input);
    expect(picked?.raw ?? null).toBe(raw);
    expect(picked?.source ?? 'none').toBe(source);
    expect(picked === null).toBe(current.value === null);
    if (picked) expect(Number(picked.raw)).toBe(current.value); // parity check only — production code never does this
  });

  it('turns the string into integer hundredths without a float', () => {
    const at = (score: string) => pickScore({ ...base, latestComputationScore: score })!.hundredths;
    expect(at('9.70')).toBe(970);
    expect(at('10.00')).toBe(1000);
    expect(at('0.10')).toBe(10);
    expect(at('7.5')).toBe(750);
    expect(at('0')).toBe(0);
  });

  it('a malformed score is an error, not a guess', () => {
    expect(() => pickScore({ ...base, latestComputationScore: 'abc' })).toThrow();
    expect(() => pickScore({ ...base, latestComputationScore: '-1.00' })).toThrow();
  });
});

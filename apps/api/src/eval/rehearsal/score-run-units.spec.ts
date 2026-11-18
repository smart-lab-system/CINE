import { ActualSubmission, evaluateRun, RehearsalScenario, ScenarioSubmission, unitKey } from './score-run';

/** Phiên nhiều câu: mỗi (sinh viên, câu) là một bài riêng; câu thiếu file không có kết quả. */
const scenario: RehearsalScenario = {
  id: 'unit-test',
  rubric: { name: 'r', criteria: [{ key: 'dung_dan', description: '', maxPoints: 10 }] },
  rules: [],
  question: '',
  tests: [],
  submissions: [
    sub('HS1', 1, {}),
    sub('HS1', 2, {}),
    sub('HS1', 3, { missing: true }),
    sub('HS2', 1, {}),
  ],
};

function sub(mssv: string, ordinal: number, extra: Partial<ScenarioSubmission>): ScenarioSubmission {
  return { mssv, name: mssv, label: `${mssv} câu ${ordinal}`, code: '', ordinal, expect: { errors: [], decision: 'auto', suspectedLenses: [] }, ...extra };
}

function actual(mssv: string, ordinal: number | undefined, score: number): ActualSubmission {
  return {
    mssv,
    ordinal,
    status: 'auto_approved',
    score,
    confidence: 1,
    model: null,
    errors: [],
    verdicts: [],
    caseNotes: [],
    caseFlags: [],
    finishedAtSec: 10,
  };
}

describe('evaluateRun — khoá theo (sinh viên, câu)', () => {
  it('mỗi câu của cùng một sinh viên được chấm với kết quả của chính câu đó', () => {
    const { checks } = evaluateRun(scenario, [actual('HS1', 1, 10), actual('HS1', 2, 7)]);
    expect(checks.map((c) => [c.mssv, c.ordinal, c.actualScore])).toEqual([
      ['HS1', 1, 10],
      ['HS1', 2, 7],
    ]);
  });

  it('câu thiếu file không có kết quả là đúng: không được tính là bài sai, và được đếm riêng', () => {
    const { checks, summary } = evaluateRun(scenario, [actual('HS1', 1, 10), actual('HS1', 2, 7), actual('HS2', 1, 10)]);
    expect(checks).toHaveLength(3);
    expect(summary.missingTotal).toBe(1);
    expect(summary.missingOk).toBe(1);
    expect(summary.unitsWithoutResult).toBe(0);
  });

  it('bài đã nộp mà không có kết quả chấm là lỗi, và được đếm', () => {
    const { summary } = evaluateRun(scenario, [actual('HS1', 1, 10), actual('HS2', 1, 10)]);
    expect(summary.unitsWithoutResult).toBe(1);
  });

  it('câu thiếu file mà vẫn có kết quả thì KHÔNG đạt missingOk', () => {
    const { summary } = evaluateRun(scenario, [actual('HS1', 1, 10), actual('HS1', 2, 7), actual('HS1', 3, 0), actual('HS2', 1, 10)]);
    expect(summary.missingOk).toBe(0);
  });

  it('lượt cũ không có ordinal khớp với câu 1 (phiên một câu)', () => {
    expect(unitKey('HS2', 1)).toBe('HS2#1');
    const single: RehearsalScenario = { ...scenario, submissions: [sub('HS9', 1, {})] };
    const { checks } = evaluateRun(single, [actual('HS9', undefined, 10)]);
    expect(checks).toHaveLength(1);
    expect(checks[0].actualScore).toBe(10);
  });
});

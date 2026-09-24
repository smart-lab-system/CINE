import { gradeOneShot } from './one-shot-grade';
import { AIGradingProvider, GradingOutcome, GradingRequest } from './ai-provider/ai-grading-provider';

// Dẫn chứng phải dài ≥ MIN_EVIDENCE_CHARS (10) sau chuẩn hoá, không thì
// guard coi là "không định vị được" và bài không bao giờ tự duyệt.
const content = 'int main() {\n  return 0; }\n';
const request: GradingRequest = {
  studentMssv: 'SV1',
  content,
  deliverableType: 'document',
  criteria: [
    { id: 'c1', description: 'Tính đúng', maxPoints: 6 },
    { id: 'c2', description: 'Trình bày', maxPoints: 4 },
  ],
};

function outcome(
  rows: GradingOutcome['criterionResults'],
  confidenceCeiling = 1,
): GradingOutcome {
  return {
    modelUsed: 'test-model',
    criterionResults: rows,
    totalScore: 0,
    confidenceCeiling,
    usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheCreationTokens: 0 },
    contextUsed: { question: false, modelAnswer: false },
  };
}
const trusted = outcome([
  { criterionId: 'c1', verdict: 'met', points: 0, evidence: 'int main() {' },
  { criterionId: 'c2', verdict: 'met', points: 0, evidence: 'return 0; }' },
]);

function providerReturning(...outs: GradingOutcome[]): AIGradingProvider & { calls: number } {
  let i = 0;
  return {
    name: 'fake',
    calls: 0,
    async grade() {
      this.calls++;
      return outs[Math.min(i++, outs.length - 1)];
    },
  };
}

describe('gradeOneShot', () => {
  it('lượt tin được, mọi tiêu chí đạt → tự duyệt, điểm do server tính', async () => {
    const provider = providerReturning(trusted);
    const r = await gradeOneShot(provider, request);
    expect(provider.calls).toBe(1);
    expect(r.retried).toBe(false);
    expect(r.scored.totalScore).toBe(10);
    expect(r.finalConfidence).toBe(0.95);
    expect(r.confident).toBe(true);
  });

  it('lượt đầu thiếu tiêu chí → chấm lại ĐÚNG MỘT lần, và dùng lượt thứ hai', async () => {
    const broken = outcome([{ criterionId: 'c1', verdict: 'met', points: 0, evidence: 'int main() {' }]);
    const provider = providerReturning(broken, trusted);
    const r = await gradeOneShot(provider, request);
    expect(provider.calls).toBe(2);
    expect(r.retried).toBe(true);
    expect(r.firstGuardsReason).toMatch(/bộ tiêu chí/);
    expect(r.confident).toBe(true);
  });

  it('chấm lại vẫn hỏng → không chấm lần ba, không tự duyệt', async () => {
    const broken = outcome([{ criterionId: 'c1', verdict: 'met', points: 0, evidence: 'int main() {' }]);
    const provider = providerReturning(broken, broken, trusted);
    const r = await gradeOneShot(provider, request);
    expect(provider.calls).toBe(2);
    expect(r.guards.runUntrustworthy).toBe(true);
    expect(r.confident).toBe(false);
  });

  it('trần của bậc model thấp hơn ngưỡng → không tự duyệt dù guard đồng ý', async () => {
    const low = outcome(trusted.criterionResults, 0.5);
    const r = await gradeOneShot(providerReturning(low), request);
    expect(r.finalConfidence).toBe(0.5);
    expect(r.confident).toBe(false);
  });

  it('một tiêu chí not_met → điểm chỉ còn phần đạt, và gắn cờ', async () => {
    const partly = outcome([
      { criterionId: 'c1', verdict: 'met', points: 99, evidence: 'int main() {' },
      { criterionId: 'c2', verdict: 'not_met', points: 99, evidence: 'return 0; }' },
    ]);
    const r = await gradeOneShot(providerReturning(partly), request);
    expect(r.scored.totalScore).toBe(6);
    expect(r.confident).toBe(false);
  });
});

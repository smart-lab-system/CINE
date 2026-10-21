import { blindAuditRow, blindResultDetail } from './audit-blind';

const row = (over: Record<string, unknown> = {}) => ({
  id: 'r1', studentMssv: '20120001', status: 'audit_pending', pipeline: 'investigator',
  aiTotalScore: 8.63, confidence: 0.91, criterionResults: [{ criterionId: 'x', evidence: 'BÍ MẬT' }],
  advocateOpinion: { note: 'BÍ MẬT' }, finalScore: 8.63, currentScore: 8.63, currentScoreSource: 'computation',
  triage: { caseFlags: [], errorFlags: [], counts: { counted: 1, unpriced: 0, refuted: 0, excluded: 0 } },
  ...over,
});

describe('blindAuditRow (T-SAMP-1, list side)', () => {
  it('an audit_pending row loses the score, the confidence, the evidence and the triage', () => {
    const out = blindAuditRow(row());
    expect(out).toMatchObject({
      aiTotalScore: null, confidence: null, criterionResults: [], advocateOpinion: null,
      finalScore: null, currentScore: null, currentScoreSource: 'none', triage: null,
    });
  });

  it('nothing of the secret survives serialisation', () => {
    const json = JSON.stringify(blindAuditRow(row()));
    expect(json).not.toContain('8.63');
    expect(json).not.toContain('BÍ MẬT');
  });

  it('keeps everything that is not the system\'s judgement', () => {
    expect(blindAuditRow(row())).toMatchObject({ id: 'r1', studentMssv: '20120001', status: 'audit_pending', pipeline: 'investigator' });
  });

  it('does not mutate its input', () => {
    const input = row();
    blindAuditRow(input);
    expect(input.aiTotalScore).toBe(8.63);
    expect(input.triage).not.toBeNull();
  });

  it.each(['ai_grading', 'ai_graded', 'auto_approved', 'flagged_for_review', 'teacher_reviewed', 'finalized', 'exported'])(
    'a %s row is returned untouched',
    (status) => {
      const input = row({ status });
      expect(blindAuditRow(input)).toBe(input);
    },
  );
});

describe('blindResultDetail (T-SAMP-1, dossier side)', () => {
  it('is a complete ResultDetail with no score, no breakdown and no investigation', () => {
    expect(blindResultDetail({ pipeline: 'investigator', status: 'audit_pending' })).toEqual({
      pipeline: 'investigator',
      currentScore: null,
      currentScoreSource: 'none',
      status: 'audit_pending',
      ungradableClass: null,
      ungradableReason: null,
      breakdown: null,
      investigation: null,
      challengeNotes: [],
      challengeVerdicts: [],
      confidenceTerms: [],
      noErrorAgreement: { n: 0, disagreements: 0, paused: false },
      testBundle: null,
    });
  });

  it('Task 13 — bản mù không lộ bảng đóng góp, độ khớp hay gói test', () => {
    const detail = blindResultDetail({ pipeline: 'investigator', status: 'audit_pending' });
    expect(detail.breakdown).toBeNull();
    expect(detail.confidenceTerms).toEqual([]);
    expect(detail.noErrorAgreement).toEqual({ n: 0, disagreements: 0, paused: false });
    expect(detail.testBundle).toBeNull();
  });
});

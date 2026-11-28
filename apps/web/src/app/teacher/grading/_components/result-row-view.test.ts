import { describe, expect, it } from 'vitest';
import type { GradingResult } from '@/lib/api/grading';
import { resultRowView } from './result-row-view';

const result = (over: Partial<GradingResult> = {}): GradingResult => ({
  id: 'r1', submissionId: 's1', studentMssv: '20120001', studentName: 'Nguyễn Văn A', homeClassId: 'c1', homeClassName: 'N01',
  status: 'auto_approved', modelUsed: null, aiTotalScore: null, confidence: null, flagForReview: false, ungradableReason: null,
  criterionResults: [], advocateOpinion: null, contextUsedQuestion: null, contextUsedModelAnswer: null, finalScore: null,
  reviewedAt: null, reviewedByName: null, editedCriteria: null, pipeline: 'investigator', currentScore: 8.5, currentScoreSource: 'computation',
  ...over,
});

const ctx = { sessionId: 's1', sessionClassId: 'c1' };
const emptyTriage = { caseFlags: [], errorFlags: [], counts: { counted: 0, unpriced: 0, refuted: 0, excluded: 0 } };

describe('resultRowView', () => {
  it('builds href, mssv, name and the score cell', () => {
    const view = resultRowView(result({ id: 'a', studentMssv: '20120010', studentName: 'An', status: 'auto_approved', currentScore: 10 }), ctx);
    expect(view.id).toBe('a');
    expect(view.href).toBe('/teacher/grading/a?sessionId=s1');
    expect(view.mssv).toBe('20120010');
    expect(view.name).toBe('An');
    expect(view.score).toEqual({ text: '10,0', tag: 'tạm tính' });
    expect(view.auditHidden).toBe(false);
  });

  it('errors: "-" without triage, "Không lỗi nào" with an empty one, counts with a real one', () => {
    expect(resultRowView(result({ triage: null }), ctx).errors).toBe('-');
    expect(resultRowView(result({ triage: emptyTriage }), ctx).errors).toBe('Không lỗi nào');
    const counted = { ...emptyTriage, counts: { counted: 1, unpriced: 1, refuted: 0, excluded: 0 } };
    expect(resultRowView(result({ triage: counted }), ctx).errors).toBe('1 đã trừ · 1 chờ giá');
  });

  it('reason: ungradable keeps the system reason verbatim, a needs-you result without triage points at the dossier, others are "-"', () => {
    const ungradable = result({ status: 'flagged_for_review', ungradableReason: 'Môi trường chạy bài hết giờ', currentScore: null });
    expect(resultRowView(ungradable, ctx).reason).toBe('Môi trường chạy bài hết giờ');
    expect(resultRowView(result({ status: 'flagged_for_review' }), ctx).reason).toBe('Mở hồ sơ để xem lý do.');
    expect(resultRowView(result({ status: 'auto_approved' }), ctx).reason).toBe('-');
  });

  it('method: a code project graded by reading is "reading-code", another one-shot is "essay", investigator is null', () => {
    expect(resultRowView(result({ pipeline: 'one_shot', deliverableType: 'code_project' }), ctx).method).toBe('reading-code');
    expect(resultRowView(result({ pipeline: 'one_shot' }), ctx).method).toBe('essay');
    expect(resultRowView(result(), ctx).method).toBeNull();
  });

  it('makeup label uses the home class name, falling back to its id', () => {
    expect(resultRowView(result({ homeClassId: 'other', homeClassName: 'N09' }), ctx).makeup).toBe('Thi bù - N09');
    expect(resultRowView(result({ homeClassId: 'other', homeClassName: null }), ctx).makeup).toBe('Thi bù - other');
    expect(resultRowView(result({ homeClassId: 'c1' }), ctx).makeup).toBeNull();
  });

  it('an audit-pending result hides the score and says why (never leaks the system score)', () => {
    const view = resultRowView(result({ status: 'audit_pending', currentScore: 8.63, triage: null }), ctx);
    expect(view.auditHidden).toBe(true);
    expect(view.score).toEqual({ text: 'ẩn', tag: 'chờ nhận xét của bạn' });
    const dump = JSON.stringify(view);
    expect(dump).not.toContain('8,6');
    expect(dump).not.toContain('8.63');
  });

  it('carries what the status pill needs', () => {
    const view = resultRowView(result({ status: 'flagged_for_review', ungradableReason: 'x', pipeline: 'one_shot' }), ctx);
    expect(view.status).toBe('flagged_for_review');
    expect(view.ungradableReason).toBe('x');
    expect(view.pipeline).toBe('one_shot');
  });
});

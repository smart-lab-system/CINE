import { BLANK_LABELS, blankReasonOf, isOwnLabel } from './blank-reason';

describe('blankReasonOf (parent §13.1 rule 5 — four meanings of an empty cell)', () => {
  const at = (status: string | null, ungradableClass: string | null = null, hasSubmission = true) =>
    blankReasonOf({ hasSubmission, status, ungradableClass });

  it('no submission is "absent" — whatever else is known', () => {
    expect(at(null, null, false)).toBe('absent');
    expect(at('finalized', null, false)).toBe('absent');
  });
  it('a submission with no grading result is "not finished"', () => {
    expect(at(null)).toBe('not_finished');
  });
  it('a published result has no blank reason at all', () => {
    expect(at('finalized')).toBeNull();
    expect(at('exported')).toBeNull();
  });
  it('a result that could not be graded is "ungradable" — either class', () => {
    expect(at('flagged_for_review', 'system')).toBe('ungradable');
    expect(at('flagged_for_review', 'submission')).toBe('ungradable');
  });
  it('a result waiting for the teacher is "flagged"', () => {
    expect(at('flagged_for_review')).toBe('flagged');
    expect(at('audit_pending')).toBe('flagged');
  });
  it.each(['ai_grading', 'ai_graded', 'auto_approved', 'teacher_reviewed'])('%s is "not finished" — even if a score already exists (never provisional)', (status) => {
    expect(at(status)).toBe('not_finished');
  });
});

describe('labels', () => {
  it('has four distinct Vietnamese labels', () => {
    expect(Object.keys(BLANK_LABELS).sort()).toEqual(['absent', 'flagged', 'not_finished', 'ungradable']);
    expect(new Set(Object.values(BLANK_LABELS)).size).toBe(4);
    expect(BLANK_LABELS.absent).toBe('Vắng — không có bài nộp');
  });
  it('isOwnLabel recognises exactly the labels the system writes (trimmed, case-sensitive)', () => {
    for (const label of Object.values(BLANK_LABELS)) {
      expect(isOwnLabel(label)).toBe(true);
      expect(isOwnLabel(`  ${label} `)).toBe(true);
    }
    expect(isOwnLabel('')).toBe(false);
    expect(isOwnLabel('Vắng')).toBe(false);
    expect(isOwnLabel(BLANK_LABELS.absent.toUpperCase())).toBe(false);
    expect(isOwnLabel('Ghi chú của thầy')).toBe(false);
  });
});

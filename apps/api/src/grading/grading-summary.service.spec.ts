import { foldSummaryRows, type SummaryRawRow } from './grading-summary.service';

const row = (over: Partial<SummaryRawRow> = {}): SummaryRawRow => ({
  exam_session_id: 's1',
  status: null,
  n: null,
  ungradable: null,
  has_question: false,
  ...over,
});

describe('foldSummaryRows', () => {
  it('gives an empty entry to a session with no results at all', () => {
    expect(foldSummaryRows([row()])).toEqual([
      { examSessionId: 's1', byStatus: {}, ungradable: 0, hasQuestion: false },
    ]);
  });

  it('folds one row per (session, status) into one entry per session', () => {
    const out = foldSummaryRows([
      row({ status: 'auto_approved', n: 3 }),
      row({ status: 'flagged_for_review', n: 2, ungradable: 1 }),
      row({ status: 'ai_grading', n: 1 }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].byStatus).toEqual({ auto_approved: 3, flagged_for_review: 2, ai_grading: 1 });
    expect(out[0].ungradable).toBe(1);
  });

  it('reads Postgres numeric strings as numbers', () => {
    const out = foldSummaryRows([row({ status: 'finalized', n: '12', ungradable: '0' })]);
    expect(out[0].byStatus).toEqual({ finalized: 12 });
  });

  it('keeps hasQuestion from the session, not from a status row', () => {
    const out = foldSummaryRows([
      row({ status: 'auto_approved', n: 1, has_question: true }),
      row({ status: 'finalized', n: 1, has_question: true }),
    ]);
    expect(out[0].hasQuestion).toBe(true);
  });

  it('drops a zero-count row instead of listing the status', () => {
    const out = foldSummaryRows([row({ status: 'auto_approved', n: 0 })]);
    expect(out[0].byStatus).toEqual({});
  });

  it('keeps two sessions apart', () => {
    const out = foldSummaryRows([
      row({ exam_session_id: 'a', status: 'finalized', n: 1 }),
      row({ exam_session_id: 'b', status: 'ai_grading', n: 4 }),
    ]);
    expect(out.map((s) => s.examSessionId).sort()).toEqual(['a', 'b']);
    expect(out.find((s) => s.examSessionId === 'b')!.byStatus).toEqual({ ai_grading: 4 });
  });
});

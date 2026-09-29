import { describe, expect, it } from 'vitest';
import {
  STATE_LABEL,
  STATE_ORDER,
  blockers,
  countStates,
  errorCounts,
  finalizeCounts,
  leverageOf,
  reasonOf,
  scoreCell,
  sortByState,
  stateOf,
  type SessionState,
} from './session-triage';
import type { GradingResult, ResultDetail } from './api/grading';

const result = (over: Partial<GradingResult> = {}): GradingResult => ({
  id: 'r1',
  submissionId: 's1',
  studentMssv: '20120001',
  studentName: 'Nguyễn Văn A',
  homeClassId: 'c1',
  homeClassName: 'N01',
  status: 'auto_approved',
  modelUsed: null,
  aiTotalScore: null,
  confidence: null,
  flagForReview: false,
  ungradableReason: null,
  criterionResults: [],
  advocateOpinion: null,
  contextUsedQuestion: null,
  contextUsedModelAnswer: null,
  finalScore: null,
  reviewedAt: null,
  reviewedByName: null,
  editedCriteria: null,
  pipeline: 'investigator',
  currentScore: 8.5,
  currentScoreSource: 'computation',
  ...over,
});

const detail = (breakdown: Partial<NonNullable<ResultDetail['breakdown']>> | null): ResultDetail => ({
  pipeline: 'investigator',
  currentScore: 8.5,
  currentScoreSource: 'computation',
  status: 'flagged_for_review',
  ungradableClass: null,
  ungradableReason: null,
  breakdown:
    breakdown === null
      ? null
      : { errors: [], perCriterion: [], caseFlags: [], errorFlags: [], confidence: 1, mismatchedRules: [], notConsidered: [], ungradable: null, ...breakdown },
  investigation: null,
  challengeNotes: [],
  challengeVerdicts: [],
});

describe('stateOf', () => {
  it.each<[string, SessionState]>([
    ['ai_grading', 'grading'],
    ['ai_graded', 'grading'],
    ['auto_approved', 'auto'],
    ['audit_pending', 'audit'],
    ['flagged_for_review', 'needsYou'],
    ['teacher_reviewed', 'reviewed'],
    ['finalized', 'finalised'],
    ['exported', 'finalised'],
  ])('%s → %s', (status, expected) => {
    expect(stateOf(result({ status }))).toBe(expected);
  });

  it('flagged_for_review WITH an ungradable reason is "không chấm được", not "cần bạn xem" (§4.4)', () => {
    expect(stateOf(result({ status: 'flagged_for_review', ungradableReason: 'chưa cấu hình môi trường chạy bài' }))).toBe('ungradable');
  });

  it('an unknown status stays visible and blocking (as "đang chấm") instead of vanishing', () => {
    expect(stateOf(result({ status: 'something_new' }))).toBe('grading');
  });
});

describe('order and labels', () => {
  it('puts what needs the teacher first and what is settled last', () => {
    expect(STATE_ORDER).toEqual(['needsYou', 'audit', 'ungradable', 'grading', 'auto', 'reviewed', 'finalised']);
  });
  it('every state has a label in words', () => {
    expect(STATE_LABEL.needsYou).toBe('Cần bạn xem');
    expect(STATE_LABEL.audit).toBe('Kiểm mẫu');
    expect(STATE_LABEL.ungradable).toBe('Không chấm được');
    expect(STATE_LABEL.auto).toBe('Tự quyết');
    for (const s of STATE_ORDER) expect(STATE_LABEL[s]).toBeTruthy();
  });
});

describe('countStates / sortByState', () => {
  const list = [
    result({ id: 'a', studentMssv: '20120010', status: 'auto_approved' }),
    result({ id: 'b', studentMssv: '20120002', status: 'flagged_for_review' }),
    result({ id: 'c', studentMssv: '20120001', status: 'flagged_for_review', ungradableReason: 'x' }),
    result({ id: 'd', studentMssv: '20120009', status: 'flagged_for_review' }),
  ];
  it('counts every state, zero included', () => {
    expect(countStates(list)).toEqual({ needsYou: 2, audit: 0, ungradable: 1, grading: 0, auto: 1, reviewed: 0, finalised: 0 });
  });
  it('sorts by state, then by MSSV as numbers, without mutating the input', () => {
    const before = list.map((r) => r.id);
    expect(sortByState(list).map((r) => r.id)).toEqual(['b', 'd', 'c', 'a']);
    expect(list.map((r) => r.id)).toEqual(before);
  });
});

describe('scoreCell (every score is currentScore; null is "—", never 0)', () => {
  it('null score → "—" and "chưa có điểm"', () => {
    expect(scoreCell(result({ currentScore: null }), 'ungradable')).toEqual({ text: '—', tag: 'chưa có điểm' });
  });
  it('a computed score is provisional until finalised', () => {
    expect(scoreCell(result({ currentScore: 8.5 }), 'needsYou')).toEqual({ text: '8,5', tag: 'tạm tính' });
    expect(scoreCell(result({ currentScore: 8.5 }), 'auto')).toEqual({ text: '8,5', tag: 'tạm tính' });
  });
  it('a hand-graded score says so', () => {
    expect(scoreCell(result({ currentScore: 7, currentScoreSource: 'manual' }), 'reviewed')).toEqual({ text: '7,0', tag: 'chấm tay' });
  });
  it('a finalised score is final', () => {
    expect(scoreCell(result({ currentScore: 6, currentScoreSource: 'finalized' }), 'finalised')).toEqual({ text: '6,0', tag: 'đã chốt' });
  });
  it('a real zero is shown as 0, not confused with no score', () => {
    expect(scoreCell(result({ currentScore: 0 }), 'auto')).toEqual({ text: '0,0', tag: 'tạm tính' });
  });
  it('never reads aiTotalScore or finalScore', () => {
    expect(scoreCell(result({ currentScore: null, aiTotalScore: 9, finalScore: 9 }), 'needsYou').text).toBe('—');
  });
});

describe('blockers (exactly what BLOCKS_FINALIZE blocks)', () => {
  it('counts the four blocking groups and their sum', () => {
    const list = [
      result({ status: 'flagged_for_review' }),
      result({ status: 'flagged_for_review', ungradableReason: 'x' }),
      result({ status: 'audit_pending' }),
      result({ status: 'ai_grading' }),
      result({ status: 'ai_graded' }),
      result({ status: 'auto_approved' }),
      result({ status: 'teacher_reviewed' }),
      result({ status: 'finalized' }),
    ];
    expect(blockers(list)).toEqual({ needsYou: 1, audit: 1, ungradable: 1, grading: 2, remaining: 5 });
  });
  it('nothing blocking → remaining 0', () => {
    expect(blockers([result({ status: 'auto_approved' }), result({ status: 'teacher_reviewed' })]).remaining).toBe(0);
  });
});

describe('finalizeCounts (T-UI-16: the two numbers add up to the session)', () => {
  it('splits auto-decided-unopened from reviewed', () => {
    const list = [
      result({ status: 'auto_approved' }),
      result({ status: 'auto_approved' }),
      result({ status: 'auto_approved' }),
      result({ status: 'teacher_reviewed' }),
    ];
    const c = finalizeCounts(list);
    expect(c).toEqual({ acceptedUnopened: 3, reviewed: 1, alreadyFinal: 0 });
    expect(c.acceptedUnopened + c.reviewed).toBe(list.length);
  });
  it('counts what is already final separately', () => {
    expect(finalizeCounts([result({ status: 'finalized' }), result({ status: 'exported' })]).alreadyFinal).toBe(2);
  });
});

describe('errorCounts', () => {
  it('counts deducted, unpriced, refuted errors and distinct unverified flags', () => {
    const d = detail({
      errors: [
        { ruleId: 'a', ruleKey: 'a', ruleName: 'A', criterionKey: 'k', source: 'deterministic', toolCallIds: [], deductionHundredths: 100, counted: 'counted' },
        { ruleId: 'b', ruleKey: 'b', ruleName: 'B', criterionKey: 'k', source: 'deterministic', toolCallIds: [], deductionHundredths: null, counted: 'unpriced' },
        { ruleId: 'c', ruleKey: 'c', ruleName: 'C', criterionKey: 'k', source: 'llm_only', toolCallIds: [], deductionHundredths: 50, counted: 'refuted' },
        { ruleId: 'd', ruleKey: 'd', ruleName: 'D', criterionKey: 'k', source: 'deterministic', toolCallIds: [], deductionHundredths: 50, counted: 'excluded' },
      ],
      errorFlags: [
        { ruleKey: 'b', code: 'unpriced' },
        { ruleKey: 'e', code: 'unverified' },
        { ruleKey: 'e', code: 'unverified' },
      ],
    });
    expect(errorCounts(d)).toEqual({ counted: 1, unpriced: 1, refuted: 1, unverified: 1 });
  });
  it('a dossier without a breakdown has no counts (null, not zeros)', () => {
    expect(errorCounts(detail(null))).toBeNull();
    expect(errorCounts(undefined)).toBeNull();
  });
});

describe('reasonOf', () => {
  it('an ungradable result shows the system reason verbatim', () => {
    expect(reasonOf(result({ status: 'flagged_for_review', ungradableReason: 'Hết giờ chạy bài' }), undefined)).toBe('Hết giờ chạy bài');
  });
  it('an essay always needs the teacher, and says so without needing a dossier', () => {
    expect(reasonOf(result({ status: 'flagged_for_review', pipeline: 'one_shot' }), undefined)).toBe('Bài tự luận — luôn do bạn duyệt');
  });
  it('a flagged code result with no dossier yet has no reason (the UI says it is loading)', () => {
    expect(reasonOf(result({ status: 'flagged_for_review' }), undefined)).toBeNull();
  });
  it('builds the sentence from case flags and error flags', () => {
    const d = detail({
      caseFlags: [{ code: 'criterion_without_rules', detail: 'x' }],
      errorFlags: [
        { ruleKey: 'a', code: 'unpriced' },
        { ruleKey: 'b', code: 'unpriced' },
        { ruleKey: 'c', code: 'unverified' },
        { ruleKey: 'd', code: 'refuted' },
      ],
    });
    expect(reasonOf(result({ status: 'flagged_for_review' }), d)).toBe(
      'Tiêu chí chưa có luật nào · 2 luật chưa có giá · 1 lỗi chưa kiểm được · 1 lỗi bị bác bỏ',
    );
  });
  it('singular and plural stay natural for unpriced rules', () => {
    const d = detail({ errorFlags: [{ ruleKey: 'a', code: 'unpriced' }] });
    expect(reasonOf(result({ status: 'flagged_for_review' }), d)).toBe('1 luật chưa có giá');
  });
  it('a dossier that names no blocker says so instead of inventing one', () => {
    expect(reasonOf(result({ status: 'flagged_for_review' }), detail({}))).toBe('Hồ sơ không nêu lý do cụ thể — mở hồ sơ để xem.');
  });
  it('is null for a result nobody needs to look at', () => {
    expect(reasonOf(result({ status: 'auto_approved' }), detail({}))).toBeNull();
  });
});

describe('leverageOf (Review Focus 4: no claim from partial data)', () => {
  const flagged = (id: string, over: Partial<GradingResult> = {}) => result({ id, status: 'flagged_for_review', ...over });
  const waitingOnPrice = (...keys: string[]) => detail({ errorFlags: keys.map((ruleKey) => ({ ruleKey, code: 'unpriced' })) });

  it('says nothing while any dossier is still missing', () => {
    const needs = [flagged('a'), flagged('b')];
    expect(leverageOf(needs, new Map([['a', waitingOnPrice('x')]]))).toBeNull();
  });

  it('counts the results whose ONLY blocker is unpriced rules, and the distinct rules', () => {
    const needs = [flagged('a'), flagged('b'), flagged('c')];
    const details = new Map([
      ['a', waitingOnPrice('x', 'y')],
      ['b', waitingOnPrice('x')],
      ['c', detail({ caseFlags: [{ code: 'low_confidence', detail: 'θ' }], errorFlags: [{ ruleKey: 'z', code: 'unpriced' }] })],
    ]);
    expect(leverageOf(needs, details)).toEqual({ waiting: 2, total: 3, ruleKeys: ['x', 'y'] });
  });

  it('an unverified or refuted flag means prices alone would not clear the result', () => {
    const needs = [flagged('a')];
    const details = new Map([['a', detail({ errorFlags: [{ ruleKey: 'x', code: 'unpriced' }, { ruleKey: 'y', code: 'unverified' }] })]]);
    expect(leverageOf(needs, details)).toBeNull();
  });

  it('an essay is counted in the total but can never be "waiting for prices" (and needs no dossier)', () => {
    const needs = [flagged('a'), flagged('e', { pipeline: 'one_shot' })];
    expect(leverageOf(needs, new Map([['a', waitingOnPrice('x')]]))).toEqual({ waiting: 1, total: 2, ruleKeys: ['x'] });
  });

  it('is null when nothing is waiting on a price', () => {
    expect(leverageOf([flagged('a')], new Map([['a', detail({})]]))).toBeNull();
    expect(leverageOf([], new Map())).toBeNull();
  });

  it('a loaded dossier with no breakdown is loaded but cannot be "waiting"', () => {
    const needs = [flagged('a'), flagged('b')];
    const details = new Map([['a', detail(null)], ['b', waitingOnPrice('x')]]);
    expect(leverageOf(needs, details)).toEqual({ waiting: 1, total: 2, ruleKeys: ['x'] });
  });
});

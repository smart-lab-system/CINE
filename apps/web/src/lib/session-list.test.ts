import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VIEW,
  EMPTY_LIST_FILTERS,
  bulkPlan,
  buildRows,
  facetOptions,
  foldText,
  formatSessionDate,
  groupRows,
  hasActiveFilters,
  listStatusOf,
  matchesFilters,
  progressCaption,
  rowActionOf,
  rowNote,
  sessionHref,
  sortRows,
  statusCounts,
  type ListFilters,
} from './session-list';
import { NOW, rowsOf, session, summary } from './session-list.fixtures';

const zero = { needsYou: 0, audit: 0, ungradable: 0, grading: 0, auto: 0, reviewed: 0, finalised: 0 };
const f = (over: Partial<ListFilters> = {}): ListFilters => ({ ...EMPTY_LIST_FILTERS, ...over });

describe('listStatusOf', () => {
  it('no results at all → todo', () => expect(listStatusOf(zero)).toBe('todo'));
  it('anything needing the teacher → attention, even while grading continues', () => {
    expect(listStatusOf({ ...zero, needsYou: 1, grading: 4, auto: 3 })).toBe('attention');
    expect(listStatusOf({ ...zero, audit: 1 })).toBe('attention');
    expect(listStatusOf({ ...zero, ungradable: 1 })).toBe('attention');
  });
  it('still grading and nothing waiting → running', () => expect(listStatusOf({ ...zero, grading: 2, auto: 5 })).toBe('running'));
  it('every result finalised → done', () => expect(listStatusOf({ ...zero, finalised: 7 })).toBe('done'));
  it('decided but not all finalised → ready', () => {
    expect(listStatusOf({ ...zero, auto: 3, reviewed: 2 })).toBe('ready');
    expect(listStatusOf({ ...zero, auto: 3, finalised: 2 })).toBe('ready');
  });
});

describe('buildRows', () => {
  it('leaves out sessions with nothing collected (same rule the picker had)', () => {
    const rows = rowsOf([session({ id: 'a' }), session({ id: 'b', fullySubmittedCount: 0, partialCount: 0 })], []);
    expect(rows.map((r) => r.session.id)).toEqual(['a']);
  });

  it('status is null for every row while the summary is unknown', () => {
    const rows = rowsOf([session()], undefined);
    expect(rows[0].status).toBeNull();
    expect(rows[0].blocker).toBeNull();
  });

  it('a session missing from the summary counts as not graded yet', () => {
    expect(rowsOf([session({ id: 'a' })], [])[0].status).toBe('todo');
  });

  it('reads counts and status from the summary', () => {
    const [row] = rowsOf([session({ id: 'a' })], [summary('a', { flagged_for_review: 3, auto_approved: 5 })]);
    expect(row.status).toBe('attention');
    expect(row.counts.needsYou).toBe(3);
    expect(row.graded).toBe(8);
  });

  it('todo carries the blocker the list can know: no rubric first, then no question', () => {
    const rows = rowsOf(
      [session({ id: 'a', rubricId: null }), session({ id: 'b' }), session({ id: 'c' })],
      [summary('a', {}, { hasQuestion: true }), summary('b', {}, { hasQuestion: false }), summary('c', {}, { hasQuestion: true })],
    );
    expect(rows.map((r) => r.blocker)).toEqual(['no-rubric', 'no-question', null]);
  });

  it('only todo rows have a blocker', () => {
    const [row] = rowsOf([session({ id: 'a', rubricId: null })], [summary('a', { finalized: 4 })]);
    expect(row.status).toBe('done');
    expect(row.blocker).toBeNull();
  });
});

describe('foldText', () => {
  it('drops diacritics and case, and maps đ', () => {
    expect(foldText('Giữa Kỳ')).toBe('giua ky');
    expect(foldText('Đề thi')).toBe('de thi');
    expect(foldText('ĐỒ THỊ')).toBe('do thi');
  });
});

describe('matchesFilters', () => {
  const rows = rowsOf(
    [
      session({ id: 'a', name: 'Kiểm tra giữa kỳ', className: 'DHKTPM18ATT', classId: 'c1', roomName: 'Phòng máy A1', examType: 'GK' }),
      session({ id: 'b', name: 'Thực hành đồ thị', className: 'DHKTPM19BTT', classId: 'c2', roomName: 'H3.03', examType: 'TK', semesterName: 'HK2 2025-2026', startTime: new Date(2026, 5, 12).toISOString(), rubricId: null }),
    ],
    [summary('a', { flagged_for_review: 1 }), summary('b')],
  );
  const ids = (filters: ListFilters) => rows.filter((r) => matchesFilters(r, filters, NOW)).map((r) => r.session.id);

  it('empty filters match everything', () => expect(ids(f())).toEqual(['a', 'b']));
  it('search ignores diacritics: "giua ky" finds "giữa kỳ"', () => expect(ids(f({ q: 'giua ky' }))).toEqual(['a']));
  it('search reaches class, room and the exam-type label', () => {
    expect(ids(f({ q: 'dhktpm19' }))).toEqual(['b']);
    expect(ids(f({ q: 'h3.03' }))).toEqual(['b']);
    expect(ids(f({ q: 'thuong ky' }))).toEqual(['b']);
  });
  it('several words must all match', () => expect(ids(f({ q: 'giua do' }))).toEqual([]));
  it('inside a facet it is OR, between facets AND', () => {
    expect(ids(f({ classIds: ['c1', 'c2'] }))).toEqual(['a', 'b']);
    expect(ids(f({ classIds: ['c1', 'c2'], examTypes: ['TK'] }))).toEqual(['b']);
  });
  it('status filter', () => expect(ids(f({ status: 'attention' }))).toEqual(['a']));
  it('time window counts back from now', () => {
    expect(ids(f({ time: '7' }))).toEqual(['a']);
    expect(ids(f({ time: '30' }))).toEqual(['a']);
  });
  it('"Thiếu rubric" keeps only sessions without one', () => expect(ids(f({ noRubric: true }))).toEqual(['b']));
  it('an unparseable start time never crashes the filter', () => {
    const [bad] = rowsOf([session({ startTime: 'không phải ngày' })], []);
    expect(() => matchesFilters(bad, f({ time: '7' }), NOW)).not.toThrow();
  });
});

describe('hasActiveFilters', () => {
  it('false for the empty state, true for any single filter', () => {
    expect(hasActiveFilters(EMPTY_LIST_FILTERS)).toBe(false);
    expect(hasActiveFilters(f({ q: 'x' }))).toBe(true);
    expect(hasActiveFilters(f({ status: 'done' }))).toBe(true);
    expect(hasActiveFilters(f({ rooms: ['A'] }))).toBe(true);
    expect(hasActiveFilters(f({ time: '7' }))).toBe(true);
    expect(hasActiveFilters(f({ noRubric: true }))).toBe(true);
  });
});

describe('facetOptions and statusCounts', () => {
  const rows = rowsOf(
    [
      session({ id: 'a', classId: 'c1', className: 'DHKTPM18ATT', semesterName: 'HK1 2026-2027', examType: 'GK' }),
      session({ id: 'b', classId: 'c2', className: 'DHKTPM19BTT', semesterName: 'HK1 2026-2027', examType: 'TK' }),
      session({ id: 'c', classId: 'c2', className: 'DHKTPM19BTT', semesterName: 'HK2 2025-2026', examType: 'CK', startTime: new Date(2026, 5, 12).toISOString() }),
    ],
    [summary('a', { finalized: 1 }), summary('b', { finalized: 1 }), summary('c', { auto_approved: 1 })],
  );

  it("a facet's own filter does not narrow its own counts (so you can add a second choice)", () => {
    const opts = facetOptions(rows, f({ classIds: ['c1'] }), NOW);
    expect(opts.classIds.map((o) => [o.value, o.count])).toEqual([['c1', 1], ['c2', 2]]);
  });

  it("other filters DO narrow a facet's counts", () => {
    const opts = facetOptions(rows, f({ classIds: ['c1'] }), NOW);
    expect(opts.semesters.find((o) => o.value === 'HK1 2026-2027')!.count).toBe(1);
    expect(opts.semesters.find((o) => o.value === 'HK2 2025-2026')!.count).toBe(0);
  });

  it('semesters newest first, exam types in TK/GK/CK order, classes by name', () => {
    const opts = facetOptions(rows, EMPTY_LIST_FILTERS, NOW);
    expect(opts.semesters.map((o) => o.value)).toEqual(['HK1 2026-2027', 'HK2 2025-2026']);
    expect(opts.examTypes.map((o) => o.value)).toEqual(['TK', 'GK', 'CK']);
    expect(opts.classIds.map((o) => o.label)).toEqual(['DHKTPM18ATT', 'DHKTPM19BTT']);
  });

  it('a class with no name is labelled, not blank', () => {
    const [r] = rowsOf([session({ className: null })], []);
    expect(facetOptions([r], EMPTY_LIST_FILTERS, NOW).classIds[0].label).toBe('Không rõ lớp');
  });

  it('status counts follow every other filter but not the status filter itself', () => {
    const counts = statusCounts(rows, f({ status: 'done', classIds: ['c2'] }), NOW);
    expect(counts).toEqual({ all: 2, attention: 0, ready: 1, todo: 0, running: 0, done: 1 });
  });
});

describe('sortRows', () => {
  const at = (day: number) => new Date(2026, 8, day, 8).toISOString();
  const rows = rowsOf(
    [
      session({ id: 'done-old', startTime: at(3) }),
      session({ id: 'attn-old', startTime: at(10) }),
      session({ id: 'attn-new', startTime: at(20) }),
      session({ id: 'todo', startTime: at(15) }),
    ],
    [summary('done-old', { finalized: 1 }), summary('attn-old', { flagged_for_review: 1 }), summary('attn-new', { flagged_for_review: 1 }), summary('todo')],
  );
  const order = (view: Partial<typeof DEFAULT_VIEW>) => sortRows(rows, { ...DEFAULT_VIEW, ...view }).map((r) => r.session.id);

  it('default: needs-you first, newest first within a status, done last', () => {
    expect(order({})).toEqual(['attn-new', 'attn-old', 'todo', 'done-old']);
  });
  it('by date, both directions', () => {
    expect(order({ sortKey: 'date', sortDir: 'desc' })).toEqual(['attn-new', 'todo', 'attn-old', 'done-old']);
    expect(order({ sortKey: 'date', sortDir: 'asc' })).toEqual(['done-old', 'attn-old', 'todo', 'attn-new']);
  });
  it('a row whose status is unknown sorts after every known status', () => {
    const [known] = rowsOf([session({ id: 'k' })], [summary('k', { finalized: 1 })]);
    const [unknown] = rowsOf([session({ id: 'u' })], undefined);
    expect(sortRows([unknown, known], DEFAULT_VIEW).map((r) => r.session.id)).toEqual(['k', 'u']);
  });
  it('by name uses Vietnamese collation with numbers as numbers', () => {
    const named = rowsOf([session({ id: 'b', name: 'Lần 10' }), session({ id: 'a', name: 'Lần 2' })], []);
    expect(sortRows(named, { ...DEFAULT_VIEW, sortKey: 'name', sortDir: 'asc' }).map((r) => r.session.id)).toEqual(['a', 'b']);
  });
  it('does not mutate its input', () => {
    const copy = [...rows];
    sortRows(rows, DEFAULT_VIEW);
    expect(rows).toEqual(copy);
  });
});

describe('groupRows', () => {
  const rows = rowsOf(
    [
      session({ id: 'a', classId: 'c2', className: 'B', semesterName: 'HK2 2025-2026', startTime: new Date(2026, 5, 1).toISOString() }),
      session({ id: 'b', classId: 'c1', className: 'A', semesterName: 'HK1 2026-2027' }),
      session({ id: 'c', classId: 'c2', className: 'B', semesterName: 'HK1 2026-2027' }),
    ],
    [],
  );
  it('none → one unnamed group holding everything, order kept', () => {
    const g = groupRows(rows, 'none');
    expect(g).toHaveLength(1);
    expect(g[0].label).toBeNull();
    expect(g[0].rows.map((r) => r.session.id)).toEqual(['a', 'b', 'c']);
  });
  it('class → groups ordered by class name, rows keep their order inside', () => {
    const g = groupRows(rows, 'class');
    expect(g.map((x) => x.label)).toEqual(['A', 'B']);
    expect(g[1].rows.map((r) => r.session.id)).toEqual(['a', 'c']);
  });
  it('semester → newest semester first', () => {
    expect(groupRows(rows, 'semester').map((x) => x.label)).toEqual(['HK1 2026-2027', 'HK2 2025-2026']);
  });
});

describe('bulkPlan', () => {
  const rows = rowsOf(
    [
      session({ id: 'ready-to-start' }),
      session({ id: 'no-rubric', rubricId: null }),
      session({ id: 'no-question' }),
      session({ id: 'graded' }),
    ],
    [
      summary('ready-to-start'),
      summary('no-rubric'),
      summary('no-question', {}, { hasQuestion: false }),
      summary('graded', { auto_approved: 2 }),
    ],
  );
  it('start = sessions not graded yet with a rubric and a question; rubric = not graded and without rubric', () => {
    const plan = bulkPlan(rows);
    expect(plan.start.map((r) => r.session.id)).toEqual(['ready-to-start']);
    expect(plan.assignRubric.map((r) => r.session.id)).toEqual(['no-rubric']);
    expect(plan.mix).toEqual({ todo: 3, ready: 1 });
  });
  it('offers nothing while statuses are unknown', () => {
    const plan = bulkPlan(rowsOf([session()], undefined));
    expect(plan.start).toEqual([]);
    expect(plan.assignRubric).toEqual([]);
  });
});

describe('row action, note and caption', () => {
  const one = (byStatus: Record<string, number>, over = {}, sOver = {}) => rowsOf([session({ id: 'a', ...over })], [summary('a', byStatus, sOver)])[0];

  it('links carry the session id; attention opens the first non-empty state', () => {
    expect(rowActionOf(one({ flagged_for_review: 2 }))).toMatchObject({ kind: 'link', label: 'Xem xét', href: '/teacher/grading?sessionId=a&state=needsYou' });
    expect(rowActionOf(one({ audit_pending: 1 }))).toMatchObject({ href: '/teacher/grading?sessionId=a&state=audit' });
  });
  it('ready → finalize page; running → session; done → session', () => {
    expect(rowActionOf(one({ auto_approved: 3 }))).toMatchObject({ label: 'Chốt điểm', href: '/teacher/grading/finalize?sessionId=a' });
    expect(rowActionOf(one({ ai_grading: 3 }))).toMatchObject({ label: 'Xem tiến độ', href: '/teacher/grading?sessionId=a' });
    expect(rowActionOf(one({ finalized: 3 }))).toMatchObject({ label: 'Mở kết quả' });
  });
  it('todo: blocked → Chuẩn bị (a link); clear → Bắt đầu chấm (opens the confirm dialog)', () => {
    expect(rowActionOf(one({}, { rubricId: null }))).toMatchObject({ kind: 'link', label: 'Chuẩn bị' });
    expect(rowActionOf(one({}))).toMatchObject({ kind: 'start', label: 'Bắt đầu chấm' });
  });
  it('unknown status → a plain open link', () => {
    expect(rowActionOf(rowsOf([session({ id: 'a' })], undefined)[0])).toMatchObject({ kind: 'link', label: 'Mở' });
  });
  it('sessionHref', () => expect(sessionHref('x', 'audit')).toBe('/teacher/grading?sessionId=x&state=audit'));

  it('notes: blockers, readiness, and staleness', () => {
    expect(rowNote(one({}, { rubricId: null }), NOW)).toEqual({ text: 'Thiếu rubric', tone: 'warn' });
    expect(rowNote(one({}, {}, { hasQuestion: false }), NOW)).toEqual({ text: 'Thiếu đề bài', tone: 'warn' });
    expect(rowNote(one({}), NOW)).toEqual({ text: 'Sẵn sàng chấm', tone: 'ok' });
    const old = { startTime: new Date(2026, 5, 13, 7, 30).toISOString() };
    expect(rowNote(one({ auto_approved: 1 }, old), NOW)).toEqual({ text: 'Thi cách đây 108 ngày', tone: 'warn' });
    expect(rowNote(one({ auto_approved: 1 }), NOW)).toBeNull();
    expect(rowNote(one({ finalized: 1 }, old), NOW)).toBeNull();
  });

  it('captions', () => {
    expect(progressCaption(one({ flagged_for_review: 11, ai_grading: 4, auto_approved: 23 }))).toBe('11 cần xem · 4 đang chấm');
    expect(progressCaption(one({ flagged_for_review: 2, auto_approved: 5 }))).toBe('2 cần xem');
    expect(progressCaption(one({ ai_grading: 22, auto_approved: 14 }))).toBe('14/36 đã chấm');
    expect(progressCaption(one({ auto_approved: 27 }))).toBe('27 chờ chốt');
    expect(progressCaption(one({}))).toBe('0/38 đã chấm');
    expect(progressCaption(one({ finalized: 39 }))).toBe('39/39 đã chốt');
    expect(progressCaption(rowsOf([session()], undefined)[0])).toBe('');
  });
});

describe('formatSessionDate', () => {
  it('local date and time, zero-padded', () => {
    expect(formatSessionDate(new Date(2026, 8, 5, 7, 5).toISOString())).toEqual({ date: '05/09/2026', time: '07:05' });
  });
  it('an unparseable value gives dashes, not "NaN"', () => {
    expect(formatSessionDate('???')).toEqual({ date: '—', time: '' });
  });
});

describe('review fixes — I1: a status filter never hides a row whose status is still unknown', () => {
  it('unknown status is not "a different status"', () => {
    const [unknown] = rowsOf([session()], undefined);
    expect(unknown.status).toBeNull();
    expect(matchesFilters(unknown, f({ status: 'attention' }), NOW)).toBe(true);
  });

  it('a known status is still filtered as before', () => {
    const [done] = rowsOf([session({ id: 'a' })], [summary('a', { finalized: 1 })]);
    expect(matchesFilters(done, f({ status: 'attention' }), NOW)).toBe(false);
    expect(matchesFilters(done, f({ status: 'done' }), NOW)).toBe(true);
  });
});

describe('review fixes — I6: an exam that has not ended is not "ready to grade"', () => {
  const ends = (msFromNow: number) => new Date(NOW + msFromNow).toISOString();

  it('end time in the future -> todo with the in-progress blocker, even with rubric and question', () => {
    const [row] = buildRows([session({ id: 'live', endTime: ends(3_600_000) })], [summary('live')], NOW);
    expect(row.status).toBe('todo');
    expect(row.blocker).toBe('in-progress');
  });

  it('ended, or an end time nobody can read, is not blocked', () => {
    const [ended] = buildRows([session({ id: 'a', endTime: ends(-60_000) })], [summary('a')], NOW);
    const [garbled] = buildRows([session({ id: 'b', endTime: 'không phải ngày' })], [summary('b')], NOW);
    expect(ended.blocker).toBeNull();
    expect(garbled.blocker).toBeNull();
  });

  it('rubric and question problems are reported before it (they are what the teacher can fix now)', () => {
    const [noRubric] = buildRows([session({ id: 'a', rubricId: null, endTime: ends(3_600_000) })], [summary('a')], NOW);
    expect(noRubric.blocker).toBe('no-rubric');
  });

  it('it does not enter the bulk start list, but a session without rubric can still be given one', () => {
    const rows = buildRows(
      [session({ id: 'live', endTime: ends(3_600_000) }), session({ id: 'live-no-rubric', rubricId: null, endTime: ends(3_600_000) })],
      [summary('live'), summary('live-no-rubric')],
      NOW,
    );
    const plan = bulkPlan(rows);
    expect(plan.start).toEqual([]);
    expect(plan.assignRubric.map((r) => r.session.id)).toEqual(['live-no-rubric']);
  });

  it('the row says so, and its action is "Chuẩn bị", not a start button', () => {
    const [row] = buildRows([session({ id: 'live', endTime: ends(3_600_000) })], [summary('live')], NOW);
    expect(rowNote(row, NOW)).toEqual({ text: 'Phiên chưa kết thúc', tone: 'warn' });
    expect(rowActionOf(row)).toMatchObject({ kind: 'link', label: 'Chuẩn bị' });
  });
});

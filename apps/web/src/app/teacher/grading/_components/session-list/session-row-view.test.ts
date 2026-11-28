import { describe, expect, it } from 'vitest';
import { groupRows } from '@/lib/session-list';
import { NOW, rowsOf, session, summary } from '@/lib/session-list.fixtures';
import { groupSummary, selectionOf, sessionRowView } from './session-row-view';

const attention = () =>
  rowsOf(
    [session({ id: 'a', name: 'Kiểm tra giữa kỳ', className: 'DHKTPM18ATT', roomName: 'Phòng máy A1' })],
    [summary('a', { flagged_for_review: 11, ai_grading: 4, auto_approved: 23 })],
  )[0];

describe('sessionRowView', () => {
  it('builds the strings the table and the cards both show', () => {
    const view = sessionRowView(attention(), NOW);
    expect(view.id).toBe('a');
    expect(view.name).toBe('Kiểm tra giữa kỳ');
    expect(view.href).toBe('/teacher/grading?sessionId=a');
    expect(view.meta).toBe('DHKTPM18ATT · Phòng máy A1');
    expect(view.date).toBe('28/09/2026');
    expect(view.time).toBe('07:30');
    expect(view.typeLabel).toBe('Giữa kỳ');
    expect(view.submitted).toBe('38');
    expect(view.expected).toBe('/40');
    expect(view.action).toMatchObject({ kind: 'link', label: 'Xem xét', href: '/teacher/grading?sessionId=a&state=needsYou' });
    expect(view.actionLabel).toBe('Xem xét: Kiểm tra giữa kỳ, DHKTPM18ATT');
    expect(view.selectLabel).toBe('Chọn phiên Kiểm tra giữa kỳ, DHKTPM18ATT');
  });

  it('drops "/M" when the roster is unknown or empty', () => {
    expect(sessionRowView(rowsOf([session({ rosterKnown: false })], undefined)[0], NOW).expected).toBe('');
    expect(sessionRowView(rowsOf([session({ expectedCount: 0 })], undefined)[0], NOW).expected).toBe('');
  });

  it('labels carry no class when there is none', () => {
    const [row] = rowsOf([session({ className: null })], [summary('s1', { flagged_for_review: 1 })]);
    const view = sessionRowView(row, NOW);
    expect(view.meta).toBe('Phòng máy A1');
    expect(view.actionLabel).toBe('Xem xét: Kiểm tra giữa kỳ');
    expect(view.selectLabel).toBe('Chọn phiên Kiểm tra giữa kỳ');
  });

  it('a row with unknown status still has a plain open action and no note', () => {
    const [row] = rowsOf([session()], undefined);
    const view = sessionRowView(row, NOW);
    expect(view.action.kind).toBe('link');
    expect(view.action.label).toMatch(/^Mở/);
    expect(view.note).toBeNull();
  });

  it('shows the todo note that says why a session cannot start', () => {
    const [row] = rowsOf([session({ id: 'b', rubricId: null })], [summary('b')]);
    expect(sessionRowView(row, NOW).note).toEqual({ text: 'Thiếu rubric', tone: 'warn' });
  });
});

describe('selectionOf', () => {
  const rows = rowsOf(
    [session({ id: 'a', className: 'X' }), session({ id: 'b', className: 'Y', classId: 'c2' }), session({ id: 'c', className: 'X' })],
    undefined,
  );
  const groups = groupRows(rows, 'class');

  it('lists every session id across all groups', () => {
    expect(selectionOf(groups, new Set()).ids.slice().sort()).toEqual(['a', 'b', 'c']);
  });

  it('reports none, some and all picked', () => {
    expect(selectionOf(groups, new Set())).toMatchObject({ all: false, some: false });
    expect(selectionOf(groups, new Set(['a']))).toMatchObject({ all: false, some: true });
    expect(selectionOf(groups, new Set(['a', 'b', 'c']))).toMatchObject({ all: true, some: true });
  });

  it('nothing to pick is never "all"', () => {
    expect(selectionOf([], new Set())).toEqual({ ids: [], all: false, some: false });
  });
});

describe('groupSummary', () => {
  it('counts rows and the two highlighted statuses', () => {
    const rows = rowsOf(
      [
        session({ id: 'a', className: 'DHKTPM18ATT' }),
        session({ id: 'b', rubricId: null, className: 'DHKTPM19BTT', classId: 'c2' }),
        session({ id: 'c', examType: 'CK', className: 'DHKTPM18ATT' }),
      ],
      [summary('a', { flagged_for_review: 11, ai_grading: 4, auto_approved: 23 }), summary('b'), summary('c', { finalized: 38 })],
    );
    const groups = groupRows(rows, 'class');
    const first = groups.find((g) => g.label === 'DHKTPM18ATT');
    expect(first).toBeDefined();
    expect(groupSummary(first!)).toEqual({ total: 2, attention: 1, ready: 0 });
  });
});

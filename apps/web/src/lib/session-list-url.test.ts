import { describe, expect, it } from 'vitest';
import { DEFAULT_VIEW, EMPTY_LIST_FILTERS } from './session-list';
import { parseListState, serializeListState, type ListState } from './session-list-url';

const parse = (qs: string) => parseListState(new URLSearchParams(qs));

describe('parseListState', () => {
  it('no params → the defaults', () => {
    expect(parse('')).toEqual({ filters: EMPTY_LIST_FILTERS, view: DEFAULT_VIEW });
  });

  it('reads every parameter', () => {
    const s = parse('q=giua+ky&status=attention&sem=HK1&sem=HK2&cls=c1&type=GK&room=A1&time=7&norubric=1&sort=date%3Aasc&group=class');
    expect(s.filters).toEqual({
      q: 'giua ky', status: 'attention', semesters: ['HK1', 'HK2'], classIds: ['c1'], examTypes: ['GK'], rooms: ['A1'], time: '7', noRubric: true,
    });
    expect(s.view).toEqual({ sortKey: 'date', sortDir: 'asc', group: 'class' });
  });

  it('garbage falls back to defaults instead of throwing', () => {
    const s = parse('status=zzz&time=999&sort=foo%3Abar&group=nope&norubric=yes&sem=');
    expect(s.filters.status).toBe('all');
    expect(s.filters.time).toBe('all');
    expect(s.filters.noRubric).toBe(false);
    expect(s.view).toEqual(DEFAULT_VIEW);
    expect(s.filters.semesters).toEqual([]);
  });

  it('a valid sort key with a missing or wrong direction takes that key\'s natural direction', () => {
    expect(parse('sort=date').view).toMatchObject({ sortKey: 'date', sortDir: 'desc' });
    expect(parse('sort=name%3Aupwards').view).toMatchObject({ sortKey: 'name', sortDir: 'asc' });
  });

  it('repeated values are de-duplicated and an enormous q is cut', () => {
    expect(parse('cls=a&cls=a&cls=b').filters.classIds).toEqual(['a', 'b']);
    expect(parse(`q=${'x'.repeat(500)}`).filters.q).toHaveLength(100);
  });
});

describe('serializeListState', () => {
  it('writes nothing for the defaults', () => {
    expect(serializeListState({ filters: EMPTY_LIST_FILTERS, view: DEFAULT_VIEW }).toString()).toBe('');
  });

  it('round-trips a full state', () => {
    const state: ListState = {
      filters: { q: 'đồ thị', status: 'ready', semesters: ['HK1 2026-2027'], classIds: ['c1', 'c2'], examTypes: ['TK'], rooms: ['H3.03'], time: '30', noRubric: true },
      view: { sortKey: 'submitted', sortDir: 'asc', group: 'semester' },
    };
    expect(parseListState(serializeListState(state))).toEqual(state);
  });

  it('never writes a sessionId (the list is what the session screen comes back to)', () => {
    const qs = serializeListState({ filters: { ...EMPTY_LIST_FILTERS, q: 'a' }, view: DEFAULT_VIEW }).toString();
    expect(qs).not.toContain('sessionId');
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { recalledListHref, rememberListQuery } from './session-list-memory';

beforeEach(() => sessionStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('remembered list', () => {
  it('nothing remembered → the bare list', () => expect(recalledListHref()).toBe('/teacher/grading'));

  it('a remembered query is put back on the link', () => {
    rememberListQuery('status=attention&cls=c1');
    expect(recalledListHref()).toBe('/teacher/grading?status=attention&cls=c1');
  });

  it('an empty query forgets', () => {
    rememberListQuery('q=a');
    rememberListQuery('');
    expect(recalledListHref()).toBe('/teacher/grading');
  });

  it('storage that throws (private window, blocked site data) is ignored, both ways', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => rememberListQuery('q=a')).not.toThrow();
    expect(recalledListHref()).toBe('/teacher/grading');
  });
});

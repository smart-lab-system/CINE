import { describe, expect, it, vi } from 'vitest';
import { runSequentially } from './session-list-bulk';

describe('runSequentially', () => {
  it('runs the ids in order and reports each as ok', async () => {
    const seen: string[] = [];
    const out = await runSequentially(['a', 'b'], async (id) => {
      seen.push(id);
    });
    expect(seen).toEqual(['a', 'b']);
    expect(out).toEqual([{ sessionId: 'a', ok: true }, { sessionId: 'b', ok: true }]);
  });

  it('a rejection is recorded with the server message and does not stop the rest', async () => {
    const action = vi.fn(async (id: string) => {
      if (id === 'b') throw new Error('Phiên có bài code nhưng chưa ghim gói test.');
    });
    const out = await runSequentially(['a', 'b', 'c'], action);
    expect(action).toHaveBeenCalledTimes(3);
    expect(out).toEqual([
      { sessionId: 'a', ok: true },
      { sessionId: 'b', ok: false, message: 'Phiên có bài code nhưng chưa ghim gói test.' },
      { sessionId: 'c', ok: true },
    ]);
  });

  it('gives a fallback message when the rejection is not an Error', async () => {
    const out = await runSequentially(['a'], () => Promise.reject('boom'));
    expect(out[0]).toEqual({ sessionId: 'a', ok: false, message: 'Không rõ lỗi.' });
  });

  it('does nothing for an empty list', async () => {
    expect(await runSequentially([], async () => {})).toEqual([]);
  });
});

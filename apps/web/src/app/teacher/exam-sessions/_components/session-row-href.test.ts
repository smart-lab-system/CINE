import { describe, expect, it } from 'vitest';
import { examSessionRowHref } from './session-row-href';

const start = Date.parse('2026-11-01T08:00:00.000Z');

describe('examSessionRowHref', () => {
  it('còn hơn 30 phút thì vào thiết lập', () => {
    expect(examSessionRowHref('s1', new Date(start).toISOString(), start - 30 * 60_000 - 1)).toBe(
      '/teacher/exam-sessions/s1',
    );
  });

  it('đúng 30 phút hoặc muộn hơn thì vào vận hành', () => {
    expect(examSessionRowHref('s1', new Date(start).toISOString(), start - 30 * 60_000)).toBe(
      '/exam-sessions/s1',
    );
    expect(examSessionRowHref('s1', new Date(start).toISOString(), start + 60_000)).toBe(
      '/exam-sessions/s1',
    );
  });
});

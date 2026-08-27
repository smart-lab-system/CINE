import { describe, expect, it } from 'vitest';
import { getDisplaySessionStatus } from './exam-session-display';

// Pins the fix for a real bug: ExamSessionEntity.status is hardcoded to
// 'active' at creation and nothing ever flips it once endTime passes, so a
// session from days ago was showing "Đang diễn ra" forever. Real repro
// values from the live dev DB when this was reported (2026-08-27 session,
// checked on 2026-08-28).
describe('getDisplaySessionStatus', () => {
  it('shows "Đang diễn ra" while now is inside the time window', () => {
    const now = Date.now();
    const result = getDisplaySessionStatus(
      'active',
      new Date(now - 60_000).toISOString(),
      new Date(now + 60_000).toISOString(),
    );
    expect(result).toEqual({ label: 'Đang diễn ra', variant: 'success' });
  });

  it('shows "Đã kết thúc" once endTime has passed, not "Đang diễn ra" forever', () => {
    const result = getDisplaySessionStatus(
      'active',
      '2026-08-27T08:22:00.000Z',
      '2026-08-27T11:27:00.000Z',
    );
    expect(result).toEqual({ label: 'Đã kết thúc', variant: 'accent' });
  });

  it('shows "Sắp diễn ra" before startTime', () => {
    const now = Date.now();
    const result = getDisplaySessionStatus(
      'active',
      new Date(now + 60_000).toISOString(),
      new Date(now + 120_000).toISOString(),
    );
    expect(result).toEqual({ label: 'Sắp diễn ra', variant: 'info' });
  });

  it('never time-overrides an explicit non-active status (e.g. cancelled)', () => {
    // Time window says "in progress", but a teacher-cancelled session must
    // still show as cancelled — a clock should never overrule that.
    const now = Date.now();
    const result = getDisplaySessionStatus(
      'cancelled',
      new Date(now - 60_000).toISOString(),
      new Date(now + 60_000).toISOString(),
    );
    expect(result).toEqual({ label: 'Đã huỷ', variant: 'destructive' });
  });
});

import { describe, expect, it } from 'vitest';
import { getDisplaySessionStatus } from './exam-session-display';

describe('getDisplaySessionStatus', () => {
  it('maps active → Đang thi regardless of clock', () => {
    const now = Date.now();
    expect(
      getDisplaySessionStatus(
        'active',
        new Date(now - 60_000).toISOString(),
        new Date(now + 60_000).toISOString(),
      ),
    ).toEqual({ label: 'Đang thi', variant: 'success' });

    // Past endTime must NOT invent "Đã kết thúc" — DB status is source of truth.
    expect(
      getDisplaySessionStatus(
        'active',
        '2026-08-27T08:22:00.000Z',
        '2026-08-27T11:27:00.000Z',
      ),
    ).toEqual({ label: 'Đang thi', variant: 'success' });
  });

  it('maps scheduled → Sắp diễn ra', () => {
    const now = Date.now();
    expect(
      getDisplaySessionStatus(
        'scheduled',
        new Date(now + 60_000).toISOString(),
        new Date(now + 120_000).toISOString(),
      ),
    ).toEqual({ label: 'Sắp diễn ra', variant: 'info' });
  });

  it('never time-overrides an explicit non-active status (e.g. cancelled)', () => {
    const now = Date.now();
    const result = getDisplaySessionStatus(
      'cancelled',
      new Date(now - 60_000).toISOString(),
      new Date(now + 60_000).toISOString(),
    );
    expect(result).toEqual({ label: 'Đã huỷ', variant: 'destructive' });
  });

  it('maps completed → Đã kết thúc', () => {
    expect(
      getDisplaySessionStatus(
        'completed',
        '2026-08-27T08:22:00.000Z',
        '2026-08-27T11:27:00.000Z',
      ),
    ).toEqual({ label: 'Đã kết thúc', variant: 'default' });
  });
});

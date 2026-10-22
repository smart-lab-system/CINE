import { describe, expect, it } from 'vitest';
import { getDisplaySessionStatus } from './exam-session-display';

describe('getDisplaySessionStatus', () => {
  it('active đã mở nhưng chưa tới giờ bắt đầu → Đang diễn ra', () => {
    const now = Date.parse('2026-10-23T08:00:00.000Z');
    expect(
      getDisplaySessionStatus(
        'active',
        '2026-10-23T08:10:00.000Z',
        '2026-10-23T09:10:00.000Z',
        now,
      ),
    ).toEqual({ label: 'Đang diễn ra', variant: 'info' });
  });

  it('active từ giờ bắt đầu trở đi → Đang thi', () => {
    const now = Date.parse('2026-10-23T08:10:00.000Z');
    expect(
      getDisplaySessionStatus(
        'active',
        '2026-10-23T08:10:00.000Z',
        '2026-10-23T09:10:00.000Z',
        now,
      ),
    ).toEqual({ label: 'Đang thi', variant: 'success' });

    expect(
      getDisplaySessionStatus(
        'active',
        new Date(now - 60_000).toISOString(),
        new Date(now + 60_000).toISOString(),
        now,
      ),
    ).toEqual({ label: 'Đang thi', variant: 'success' });

    // Qua endTime mà DB vẫn active thì không bịa "Đã kết thúc".
    expect(
      getDisplaySessionStatus(
        'active',
        '2026-08-27T08:22:00.000Z',
        '2026-08-27T11:27:00.000Z',
        Date.parse('2026-10-23T08:00:00.000Z'),
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

  it('maps not_ready and missed without reading the clock', () => {
    expect(
      getDisplaySessionStatus(
        'not_ready',
        '2026-08-27T08:22:00.000Z',
        '2026-08-27T11:27:00.000Z',
      ),
    ).toEqual({ label: 'Chưa đủ điều kiện', variant: 'warning' });
    expect(
      getDisplaySessionStatus(
        'missed',
        '2026-08-27T08:22:00.000Z',
        '2026-08-27T11:27:00.000Z',
      ),
    ).toEqual({ label: 'Không diễn ra', variant: 'destructive' });
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

import { describe, expect, it } from 'vitest';
import { RATE_MIN_SPAN_MS, RATE_WINDOW_MS, addSample, describeRate, estimate } from './progress-rate';

const s = (seconds: number, done: number) => ({ t: seconds * 1000, done });

describe('addSample', () => {
  it('appends in order', () => {
    expect(addSample([s(0, 1)], s(5, 2))).toEqual([s(0, 1), s(5, 2)]);
  });
  it('forgets samples older than the window, so an old burst does not speak for now', () => {
    const old = { t: 0, done: 0 };
    const now = { t: RATE_WINDOW_MS + 1, done: 5 };
    expect(addSample([old], now)).toEqual([now]);
  });
  it('does not mutate its input', () => {
    const input = [s(0, 1)];
    addSample(input, s(5, 2));
    expect(input).toEqual([s(0, 1)]);
  });
});

describe('estimate — a measurement, or nothing (spec §3.8: "không ước được thì nói là không ước được")', () => {
  it('needs at least two samples', () => {
    expect(estimate([], 10)).toBeNull();
    expect(estimate([s(0, 1)], 10)).toBeNull();
  });
  it('needs enough elapsed time to mean anything', () => {
    expect(estimate([s(0, 0), s(RATE_MIN_SPAN_MS / 1000 - 1, 3)], 10)).toBeNull();
  });
  it('needs progress: nothing finished in the window ⇒ no rate, not "0 per minute"', () => {
    expect(estimate([s(0, 4), s(60, 4)], 10)).toBeNull();
  });
  it('is never negative when the count drops (regrade, refetch)', () => {
    expect(estimate([s(0, 9), s(60, 4)], 10)).toBeNull();
  });
  it('rate = finished / minutes; time left = pending / rate', () => {
    const e = estimate([s(0, 0), s(60, 6)], 12)!;
    expect(e.perMinute).toBe(6);
    expect(e.minutesLeft).toBe(2);
    expect(e.spanSeconds).toBe(60);
  });
  it('uses the whole window, first to last sample', () => {
    const e = estimate([s(0, 2), s(30, 3), s(120, 8)], 6)!;
    expect(e.perMinute).toBe(3);
    expect(e.spanSeconds).toBe(120);
  });
  it('nothing pending ⇒ nothing left', () => {
    expect(estimate([s(0, 0), s(60, 6)], 0)!.minutesLeft).toBe(0);
  });
});

describe('describeRate', () => {
  it('says so when it cannot estimate', () => {
    expect(describeRate(null)).toBe('Chưa ước tính được — cần đo thêm một lúc.');
  });
  it('states it is an estimate and over which window it was measured', () => {
    const text = describeRate({ perMinute: 6, minutesLeft: 2, spanSeconds: 60 });
    expect(text).toContain('Ước tính');
    expect(text).toContain('6 bài/phút');
    expect(text).toContain('khoảng 2 phút');
    expect(text).toContain('60 giây');
  });
  it('uses a decimal comma and rounds the time left up', () => {
    const text = describeRate({ perMinute: 1.5, minutesLeft: 3.2, spanSeconds: 90 });
    expect(text).toContain('1,5 bài/phút');
    expect(text).toContain('khoảng 4 phút');
  });
  it('under a minute is said as such, not "0 phút"', () => {
    expect(describeRate({ perMinute: 30, minutesLeft: 0.3, spanSeconds: 40 })).toContain('dưới 1 phút');
  });
  it('nothing left is not an estimate of time', () => {
    expect(describeRate({ perMinute: 6, minutesLeft: 0, spanSeconds: 60 })).not.toContain('còn khoảng');
  });
});

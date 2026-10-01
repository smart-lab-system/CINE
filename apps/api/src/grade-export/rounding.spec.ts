import { ROUNDING_STEPS } from './grade-export.types';
import { roundHalfUp } from './rounding';

describe('roundHalfUp — integer arithmetic only (parent §13.2)', () => {
  it.each([
    // v, step, expected
    [725, 50, 750], [724, 50, 700], [726, 50, 750], [710, 50, 700], [720, 50, 700], [775, 50, 800],
    [725, 25, 725], [730, 25, 725], [737, 25, 725], [739, 25, 750], [738, 25, 750],
    [265, 10, 270], [264, 10, 260], [675, 10, 680], [674, 10, 670],
    [725, 1, 725], [0, 50, 0], [1000, 50, 1000], [999, 50, 1000],
  ])('%i at step %i → %i', (hundredths, step, expected) => {
    expect(roundHalfUp(hundredths!, step!)).toBe(expected);
  });

  it('7,10 and 7,20 both give 7,0 at 0,5 (nothing changed) while 7,24 → 7,26 gives 7,0 → 7,5 (it did) — spec §13.1 rule 3', () => {
    expect(roundHalfUp(710, 50)).toBe(roundHalfUp(720, 50));
    expect(roundHalfUp(726, 50)).toBeGreaterThan(roundHalfUp(724, 50));
  });

  it('10 − 0,1 − 0,2 is exactly 9,70 on the integer path (floats give 9,700000000000001)', () => {
    expect(1000 - 10 - 20).toBe(970);
    expect(roundHalfUp(1000 - 10 - 20, 1)).toBe(970);
    expect(10 - 0.1 - 0.2).not.toBe(9.7); // the hazard this module exists to avoid
  });

  it('2,65 goes UP to 2,7 at step 0,1 — toFixed would say 2,6', () => {
    expect(roundHalfUp(265, 10)).toBe(270);
    expect((2.65).toFixed(1)).toBe('2.6'); // the hazard
  });

  it('is idempotent and never moves a score by more than half a step', () => {
    for (const step of ROUNDING_STEPS) {
      for (let v = 0; v <= 1000; v++) {
        const r = roundHalfUp(v, step);
        expect(roundHalfUp(r, step)).toBe(r);
        expect(r % step).toBe(0);
        expect(Math.abs(r - v) * 2).toBeLessThanOrEqual(step);
      }
    }
  });

  it('refuses a step outside {1, 10, 25, 50} and a score that is not a non-negative integer', () => {
    expect(() => roundHalfUp(700, 5)).toThrow(RangeError);
    expect(() => roundHalfUp(700, 0)).toThrow(RangeError);
    expect(() => roundHalfUp(7.5, 10)).toThrow(RangeError);
    expect(() => roundHalfUp(-1, 10)).toThrow(RangeError);
  });
});

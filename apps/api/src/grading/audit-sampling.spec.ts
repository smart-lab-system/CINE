import { AUDIT_DEFAULT_PERCENT, AUDIT_FLOOR_PERCENT, auditBucket, drawnForAudit, readAuditSampling } from './audit-sampling';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `00000000-0000-4000-8000-${i.toString(16).padStart(12, '0')}`);
const SEED = '6f1c1c1e-0d0a-4f0e-9d63-2a4f6d1f7a10';
const drawn = (seed: string, percent: number, n = 20_000) => ids(n).filter((id) => drawnForAudit(seed, id, percent));

describe('the draw (T-AUDIT-1, T-SAMP-3) — no database, no scores', () => {
  it('a bucket is an integer in [0, 9999]', () => {
    for (const id of ids(2000)) {
      const b = auditBucket(SEED, id);
      expect(Number.isInteger(b)).toBe(true);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(10_000);
    }
  });

  it('draws the requested share of a large frame (T-AUDIT-1)', () => {
    expect(drawn(SEED, 20).length / 20_000).toBeGreaterThan(0.18);
    expect(drawn(SEED, 20).length / 20_000).toBeLessThan(0.22);
    expect(drawn(SEED, 5).length / 20_000).toBeGreaterThan(0.04);
    expect(drawn(SEED, 5).length / 20_000).toBeLessThan(0.06);
  });

  it('100 % draws everything', () => {
    expect(drawn(SEED, 100, 2000)).toHaveLength(2000);
  });

  it('is monotone: whoever is drawn at 5 % is still drawn at 20 % (same seed)', () => {
    const at20 = new Set(drawn(SEED, 20));
    for (const id of drawn(SEED, 5)) expect(at20.has(id)).toBe(true);
  });

  // T-SAMP-3. The function has no score parameter, and this pins that nothing else sneaks in.
  it('the drawn set depends on the seed and the ids only — changing every score changes nothing', () => {
    const frame = ids(3000).map((id, i) => ({ id, score: (i % 11) / 10 }));
    const before = frame.filter((r) => drawnForAudit(SEED, r.id, 20)).map((r) => r.id);
    for (const r of frame) r.score = 10 - r.score;
    const after = frame.filter((r) => drawnForAudit(SEED, r.id, 20)).map((r) => r.id);
    expect(after).toEqual(before);
  });

  it('a different seed draws a different set', () => {
    expect(drawn('11111111-1111-4111-8111-111111111111', 20, 3000)).not.toEqual(drawn(SEED, 20, 3000));
  });
});

describe('readAuditSampling (T-AUDIT-2 — never 0)', () => {
  it('unset in production or dev: on, 20 %', () => {
    expect(readAuditSampling({})).toEqual({ enabled: true, percent: 20, warning: null });
  });

  it('unset or blank under NODE_ENV=test: OFF — existing suites stay deterministic', () => {
    expect(readAuditSampling({ NODE_ENV: 'test' })).toEqual({ enabled: false, percent: 20, warning: null });
    expect(readAuditSampling({ NODE_ENV: 'test', GRADING_AUDIT_SAMPLE_PERCENT: '  ' }).enabled).toBe(false);
  });

  it('set explicitly under NODE_ENV=test: on', () => {
    expect(readAuditSampling({ NODE_ENV: 'test', GRADING_AUDIT_SAMPLE_PERCENT: '100' })).toEqual({
      enabled: true, percent: 100, warning: null,
    });
  });

  it.each([['5', 5], ['20', 20], ['35', 35], ['100', 100]])('%s is used as is', (raw, percent) => {
    expect(readAuditSampling({ GRADING_AUDIT_SAMPLE_PERCENT: raw })).toEqual({ enabled: true, percent, warning: null });
  });

  it.each(['1', '2', '3', '4'])('%s is below the floor: raised to 5 with a warning', (raw) => {
    const r = readAuditSampling({ GRADING_AUDIT_SAMPLE_PERCENT: raw });
    expect(r.percent).toBe(AUDIT_FLOOR_PERCENT);
    expect(r.warning).toContain('GRADING_AUDIT_SAMPLE_PERCENT');
  });

  it('above 100 is capped at 100 with a warning', () => {
    const r = readAuditSampling({ GRADING_AUDIT_SAMPLE_PERCENT: '250' });
    expect(r.percent).toBe(100);
    expect(r.warning).toContain('GRADING_AUDIT_SAMPLE_PERCENT');
  });

  it.each(['0', '-5', 'abc', '7.5', '1e-3', 'NaN'])('%s is meaningless: default 20 % with a warning, never 0', (raw) => {
    const r = readAuditSampling({ GRADING_AUDIT_SAMPLE_PERCENT: raw });
    expect(r).toMatchObject({ enabled: true, percent: AUDIT_DEFAULT_PERCENT });
    expect(r.warning).toContain('GRADING_AUDIT_SAMPLE_PERCENT');
  });

  it('over every value a person could type, the percentage is never below the floor', () => {
    const typed = [...Array.from({ length: 400 }, (_, i) => String(i - 100)), '', ' ', 'x', '5.5', '99999'];
    for (const raw of typed) {
      const r = readAuditSampling({ GRADING_AUDIT_SAMPLE_PERCENT: raw });
      if (r.enabled) expect(r.percent).toBeGreaterThanOrEqual(AUDIT_FLOOR_PERCENT);
    }
  });
});

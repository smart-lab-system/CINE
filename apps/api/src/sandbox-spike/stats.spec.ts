import { decide, logLogSlope, median, std, Summary, summarize } from './stats';

describe('thống kê buổi thử', () => {
  it('median, std mẫu', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(std([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 3);
    expect(std([5])).toBe(0);
  });

  it('độ dốc log–log: t = n² → 2; t = n → 1', () => {
    const ns = [1, 2, 4, 8, 16, 32];
    expect(logLogSlope(ns.map((n) => ({ n, t: n * n })))).toBeCloseTo(2, 6);
    expect(logLogSlope(ns.map((n) => ({ n, t: 3 * n })))).toBeCloseTo(1, 6);
  });

  it('summarize bỏ lượt hỏng nhưng đếm nó', () => {
    const s = summarize([
      { perN: new Map([[1, 10], [2, 20]]), slope: 1 },
      null,
      { perN: new Map([[1, 12], [2, 22]]), slope: 1.1 },
    ]);
    expect(s).toMatchObject({ sessions: 2, failed: 1 });
    expect(s.slopeMean).toBeCloseTo(1.05, 6);
  });
});

describe('decide — luật D1–D4, chốt trước khi đo', () => {
  const S = (slopeStd: number, meanCv: number): Summary => ({ sessions: 8, failed: 0, slopeMean: 1, slopeStd, meanCv });
  const facts = { isoPassed: true, interferenceDetected: true, caseP95Ms: 900 };
  const base = () =>
    new Map<string, Summary>([
      ['runc|in_process|1|p', S(0.02, 0.05)], ['runc|process|1|p', S(0.05, 0.08)],
      ['runsc|in_process|1|p', S(0.022, 0.055)], ['runsc|process|1|p', S(0.09, 0.2)],
      ['runsc|in_process|2|p', S(0.021, 0.054)], ['runsc|in_process|4|p', S(0.03, 0.07)],
    ]);
  const input = (summaries = base(), f = { runc: facts, runsc: facts }) =>
    ({ summaries, facts: f, programs: ['p'], cppPrograms: ['p'], ks: [1, 2, 4] });

  it('in_process ổn định hơn → D1 chọn in_process; runsc trong 1,2× → D2 chọn runsc; K = 4 lệch quá 1,1× → D3 chọn 2', () => {
    expect(decide(input())).toMatchObject({ mode: 'in_process', runtime: 'runsc', k: 2, usable: true });
  });

  it('runsc trượt test:sandbox → runc, dù đo đẹp', () => {
    expect(decide(input(base(), { runc: facts, runsc: { ...facts, isoPassed: false } })).runtime).toBe('runc');
  });

  it('runsc không phát hiện được tiến trình nền → runc', () => {
    expect(decide(input(base(), { runc: facts, runsc: { ...facts, interferenceDetected: false } })).runtime).toBe('runc');
  });

  it('chưa đo runsc → runc, và nói ra', () => {
    const d = decide(input(base(), { runc: facts } as never));
    expect(d.runtime).toBe('runc');
    expect(d.reasons.join(' ')).toMatch(/runsc/);
  });

  it('D4: độ tản quá 0,10 ở cấu hình đã chọn → usable false', () => {
    const m = base();
    m.set('runc|in_process|1|p', S(0.2, 0.3));
    m.set('runc|process|1|p', S(0.3, 0.3));
    m.set('runsc|in_process|1|p', S(0.2, 0.3));
    const d = decide(input(m));
    expect(d).toMatchObject({ mode: 'in_process', runtime: 'runsc', usable: false });
  });
});

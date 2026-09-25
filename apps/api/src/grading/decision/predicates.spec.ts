import { evaluatePredicate, isMachineChecked } from './predicates';
import { runTestsCall } from './testing/result';

const BUNDLE = {
  cases: [
    { name: 'cb1', group: 'co_ban' }, { name: 'cb2', group: 'co_ban' },
    { name: 'tl1', group: 'trung_lap' },
  ],
};
const P = { kind: 'test_group_failed' as const, group: 'co_ban' };
const run = (...xs: ReturnType<typeof runTestsCall>[]) => ({
  calls: xs.map((x) => x.call),
  structured: Object.fromEntries(xs.map((x) => [x.call.id, x.structured])),
});
const evalOn = (p: typeof P, r: ReturnType<typeof run>) => evaluatePredicate(p, BUNDLE, r.calls, r.structured);

describe('evaluatePredicate — test_group_failed (T-POL-3: lỗi phát hiện được bằng test → verdict lấy từ test)', () => {
  it('một ca của nhóm fail → present, bằng chứng là đúng lời gọi đó', () => {
    const r = run(runTestsCall('tc-1', null, [
      { name: 'cb1', group: 'co_ban', status: 'pass' }, { name: 'cb2', group: 'co_ban', status: 'fail' },
      { name: 'tl1', group: 'trung_lap', status: 'pass' },
    ]));
    expect(evalOn(P, r)).toEqual({ state: 'present', toolCallIds: ['tc-1'], reason: null });
  });

  it('mọi ca của nhóm đã chạy và pass → absent', () => {
    const r = run(runTestsCall('tc-1', 'co_ban', [
      { name: 'cb1', group: 'co_ban', status: 'pass' }, { name: 'cb2', group: 'co_ban', status: 'pass' },
    ]));
    expect(evalOn(P, r).state).toBe('absent');
  });

  it('runtime_crash, recursion_limit, output_limit đều là fail của nhóm', () => {
    for (const status of ['runtime_crash', 'recursion_limit', 'output_limit'] as const) {
      const r = run(runTestsCall('tc-1', 'co_ban', [
        { name: 'cb1', group: 'co_ban', status: 'pass' }, { name: 'cb2', group: 'co_ban', status },
      ]));
      expect(evalOn(P, r).state).toBe('present');
    }
  });

  it('T-COMPILE-1 — bài không biên dịch: run_tests phủ nhóm đó → present (mọi ca compile_error)', () => {
    const r = run(runTestsCall('tc-1', null, [], { compileOk: false }));
    expect(evalOn(P, r)).toEqual({ state: 'present', toolCallIds: ['tc-1'], reason: 'bài không biên dịch' });
    // Lời gọi chỉ cho nhóm KHÁC không nói gì về nhóm này.
    const other = run(runTestsCall('tc-1', 'trung_lap', [], { compileOk: false }));
    expect(evalOn(P, other).state).toBe('unmeasured');
  });

  it('review I1 — biên dịch lần này hỏng, lần sau qua và mọi ca pass → unmeasured "không ổn định", KHÔNG phải present', () => {
    const r = run(
      runTestsCall('tc-1', null, [], { compileOk: false }),
      runTestsCall('tc-2', null, [
        { name: 'cb1', group: 'co_ban', status: 'pass' }, { name: 'cb2', group: 'co_ban', status: 'pass' },
        { name: 'tl1', group: 'trung_lap', status: 'pass' },
      ]),
    );
    const out = evalOn(P, r);
    expect(out.state).toBe('unmeasured');
    expect(out.reason).toMatch(/không ổn định/);
  });

  it('review I1 — hỏng biên dịch ở lời gọi của nhóm này, nhưng lời gọi của nhóm khác biên dịch được → unmeasured', () => {
    const r = run(
      runTestsCall('tc-1', 'trung_lap', [{ name: 'tl1', group: 'trung_lap', status: 'pass' }]),
      runTestsCall('tc-2', 'co_ban', [], { compileOk: false }),
    );
    expect(evalOn(P, r).state).toBe('unmeasured');
  });

  it('Review Focus 1 — nhóm không có trong gói test → unmeasured nêu lý do, KHÔNG phải absent', () => {
    const r = run(runTestsCall('tc-1', null, [{ name: 'cb1', group: 'co_ban', status: 'pass' }]));
    const out = evalOn({ kind: 'test_group_failed', group: 'co-ban' }, r);
    expect(out.state).toBe('unmeasured');
    expect(out.reason).toMatch(/không có trong gói test/);
  });

  it('Review Focus 2 — run_tests chỉ chạy nhóm khác → nhóm này unmeasured, không phải absent', () => {
    const r = run(runTestsCall('tc-1', 'trung_lap', [{ name: 'tl1', group: 'trung_lap', status: 'pass' }]));
    expect(evalOn(P, r).state).toBe('unmeasured');
  });

  it('chạy dở (aborted) thiếu một ca của nhóm → unmeasured', () => {
    const r = run(runTestsCall('tc-1', null, [{ name: 'cb1', group: 'co_ban', status: 'pass' }], { aborted: true }));
    expect(evalOn(P, r).state).toBe('unmeasured');
  });

  it('Q3 — ca không đạt chỉ là timeout → unmeasured (§4.5: chưa tách được chậm với treo)', () => {
    const r = run(runTestsCall('tc-1', 'co_ban', [
      { name: 'cb1', group: 'co_ban', status: 'pass' }, { name: 'cb2', group: 'co_ban', status: 'timeout' },
    ]));
    const out = evalOn(P, r);
    expect(out.state).toBe('unmeasured');
    expect(out.reason).toMatch(/hết giờ/);
  });

  it('một ca fail thật cộng một ca timeout → present (ca fail là đủ bằng chứng)', () => {
    const r = run(runTestsCall('tc-1', 'co_ban', [
      { name: 'cb1', group: 'co_ban', status: 'fail' }, { name: 'cb2', group: 'co_ban', status: 'timeout' },
    ]));
    expect(evalOn(P, r).state).toBe('present');
  });

  it('Review Focus 5 — một ca pass ở lần này, fail ở lần khác → unmeasured "không ổn định"', () => {
    const r = run(
      runTestsCall('tc-1', 'co_ban', [{ name: 'cb1', group: 'co_ban', status: 'pass' }, { name: 'cb2', group: 'co_ban', status: 'pass' }]),
      runTestsCall('tc-2', 'co_ban', [{ name: 'cb1', group: 'co_ban', status: 'fail' }, { name: 'cb2', group: 'co_ban', status: 'pass' }]),
    );
    const out = evalOn(P, r);
    expect(out.state).toBe('unmeasured');
    expect(out.reason).toMatch(/không ổn định/);
  });

  it('lời gọi không thành công (unavailable, error) không phải bằng chứng', () => {
    const x = runTestsCall('tc-1', null, [{ name: 'cb1', group: 'co_ban', status: 'fail' }]);
    const r = { calls: [{ ...x.call, status: 'unavailable' as const }], structured: { 'tc-1': x.structured } };
    expect(evaluatePredicate(P, BUNDLE, r.calls, r.structured).state).toBe('unmeasured');
  });

  it('Q1 — complexity, calls_function, no_recursion: chưa có công cụ ở bước này → unmeasured, nêu công cụ cần', () => {
    const r = run(runTestsCall('tc-1', null, [{ name: 'cb1', group: 'co_ban', status: 'pass' }]));
    expect(evalOn({ kind: 'complexity_exceeds_required' } as never, r)).toMatchObject({ state: 'unmeasured', reason: expect.stringMatching(/run_scaled/) });
    expect(evalOn({ kind: 'calls_function', name: 'sort' } as never, r)).toMatchObject({ state: 'unmeasured', reason: expect.stringMatching(/ast_query/) });
    expect(isMachineChecked({ kind: 'test_group_failed', group: 'x' })).toBe(true);
    expect(isMachineChecked({ kind: 'complexity_exceeds_required' })).toBe(false);
    expect(isMachineChecked(null)).toBe(false);
  });
});

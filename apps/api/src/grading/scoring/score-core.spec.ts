import { readFileCall, resultWith, runTestsCall } from '../decision/testing/result';
import { computeScore, repriceBreakdown, RuleSnapshot, ScoreCoreInput } from './score-core';
import { readStoredInvestigation, StoredInvestigation } from './stored-investigation';

const CASES = [
  { name: 'c1', group: 'co_ban' },
  { name: 'c2', group: 'bien' },
];
const RUBRIC = [
  { key: 'tinh_dung', maxHundredths: 600 },
  { key: 'trinh_bay', maxHundredths: 400 },
];

function rule(over: Partial<RuleSnapshot> & { ruleKey: string }): RuleSnapshot {
  return {
    ruleId: `id-${over.ruleKey}`, revisionId: `rev-${over.ruleKey}`, criterionKey: 'tinh_dung',
    predicate: null, deductionHundredths: 100, ...over,
  };
}

const CALLS = [
  runTestsCall('t1', null, [
    { name: 'c1', group: 'co_ban', status: 'pass' },
    { name: 'c2', group: 'bien', status: 'fail' },
  ]),
  readFileCall('r1', 'bai-nop/main.cpp'),
];

/** Bài: nhóm `bien` fail (máy quyết), model báo `ten_bien` (luật bằng lời), đã đọc file bài nộp. */
function stored(over: Partial<StoredInvestigation> = {}): StoredInvestigation {
  return {
    version: 1,
    result: resultWith({ calls: CALLS, errors: [{ ruleKey: 'ten_bien', toolCallIds: ['r1'] }] }),
    rulesSeen: [
      { ruleKey: 'sai_bien', checkedBy: 'machine' },
      { ruleKey: 'ten_bien', checkedBy: 'model' },
    ],
    ruleTable: [
      { ruleKey: 'sai_bien', checkedBy: 'machine' },
      { ruleKey: 'ten_bien', checkedBy: 'model' },
    ],
    modelCeiling: 1,
    ...over,
  };
}

const BIEN = rule({ ruleKey: 'sai_bien', predicate: { kind: 'test_group_failed', group: 'bien' }, deductionHundredths: 150 });
const TEN = rule({ ruleKey: 'ten_bien', criterionKey: 'trinh_bay', deductionHundredths: 50 });
const LATE = rule({ ruleKey: 'chu_thich_sai', criterionKey: 'trinh_bay', deductionHundredths: 25 });

function input(over: Partial<ScoreCoreInput> = {}): ScoreCoreInput {
  return {
    stored: stored(),
    bundleCases: CASES,
    rubric: RUBRIC,
    rules: [BIEN, TEN],
    sessionModelRules: new Set(['ten_bien']),
    waivedCriteria: [],
    exceptions: new Map(),
    theta: 0.85,
    ...over,
  };
}

describe('computeScore', () => {
  it('trừ theo bảng giá, ánh xạ rule_key sang uuid và bản sửa (T-KEY-1); confidence (150·1 + 50·0,5)/200 ≥ θ → tự quyết', () => {
    const out = computeScore(input());
    expect(out.outcome).toBe('auto');
    expect(out.scoreHundredths).toBe(1000 - 150 - 50);
    expect(out.breakdown.errors.map((e) => [e.ruleId, e.revisionId, e.counted])).toEqual([
      ['id-sai_bien', 'rev-sai_bien', 'counted'],
      ['id-ten_bien', 'rev-ten_bien', 'counted'],
    ]);
  });

  it('đổi giá thì đổi điểm, không cần gì khác (bậc 1, T-TIER-1)', () => {
    const out = computeScore(input({ rules: [{ ...BIEN, deductionHundredths: 300 }, TEN] }));
    expect(out.scoreHundredths).toBe(1000 - 300 - 50);
  });

  it('luật máy kiểm MỚI được đo trên kết quả đã lưu, không cần model (bậc 2, T-TIER-2)', () => {
    const out = computeScore(input({ stored: stored({ rulesSeen: [{ ruleKey: 'ten_bien', checkedBy: 'model' }] }) }));
    expect(out.breakdown.errors.map((e) => e.ruleKey)).toContain('sai_bien');
  });

  it('luật BẰNG LỜI có sau lượt chấm → không xét, nêu ra, và KHÔNG kéo bài sang gắn cờ (T-FAIR-1)', () => {
    const out = computeScore(input({ rules: [BIEN, TEN, LATE] }));
    expect(out.breakdown.notConsidered).toEqual([{ ruleId: 'id-chu_thich_sai', ruleKey: 'chu_thich_sai' }]);
    expect(out.breakdown.caseFlags.map((f) => f.code)).not.toContain('criterion_untouched');
    expect(out.outcome).toBe('auto');
    expect(out.scoreHundredths).toBe(computeScore(input()).scoreHundredths);
  });

  it('bài NÀY đã thấy luật lời, nhưng không phải mọi bài của phiên → vẫn không xét (tất cả hoặc không, §2.2)', () => {
    const saw = stored({
      rulesSeen: [...stored().rulesSeen, { ruleKey: 'chu_thich_sai', checkedBy: 'model' }],
      result: resultWith({
        calls: CALLS,
        errors: [{ ruleKey: 'ten_bien', toolCallIds: ['r1'] }, { ruleKey: 'chu_thich_sai', toolCallIds: ['r1'] }],
      }),
    });
    const out = computeScore(input({ stored: saw, rules: [BIEN, TEN, LATE] }));
    expect(out.breakdown.notConsidered.map((r) => r.ruleKey)).toEqual(['chu_thich_sai']);
    expect(out.breakdown.errors.map((e) => e.ruleKey)).not.toContain('chu_thich_sai');
    expect(out.scoreHundredths).toBe(800);
  });

  it('luật trỏ tiêu chí không có trong rubric → bị loại và nêu ra, KHÔNG ném (§14.1)', () => {
    const out = computeScore(input({ rules: [BIEN, TEN, rule({ ruleKey: 'la', criterionKey: 'khong_co', deductionHundredths: 999 })] }));
    expect(out.breakdown.mismatchedRules).toEqual([{ ruleId: 'id-la', ruleKey: 'la', criterionKey: 'khong_co' }]);
    expect(out.scoreHundredths).toBe(800);
  });

  it('bỏ một lỗi cho riêng bài này → không trừ, vẫn hiện trong hồ sơ là "excluded" (§2.2)', () => {
    const out = computeScore(input({ exceptions: new Map([['id-sai_bien', 'exclude']]) }));
    expect(out.scoreHundredths).toBe(1000 - 50);
    expect(out.breakdown.errors.find((e) => e.ruleKey === 'sai_bien')?.counted).toBe('excluded');
  });

  it('T-EXC-1: lỗi đã bỏ → đổi giá CHÍNH luật đó không đổi điểm; đổi giá luật khác vẫn áp', () => {
    const exceptions = new Map([['id-sai_bien', 'exclude' as const]]);
    expect(computeScore(input({ exceptions, rules: [{ ...BIEN, deductionHundredths: 500 }, TEN] })).scoreHundredths).toBe(950);
    expect(computeScore(input({ exceptions, rules: [BIEN, { ...TEN, deductionHundredths: 75 }] })).scoreHundredths).toBe(925);
  });

  it('"include" (gỡ một "exclude" trước đó) → lỗi tính lại vào điểm (T-EXC-2)', () => {
    const out = computeScore(input({ exceptions: new Map([['id-sai_bien', 'include']]) }));
    expect(out.scoreHundredths).toBe(800);
  });

  it('luật chưa có giá: không trừ, gắn cờ đúng lỗi đó, bài không tự quyết (T-POL-2)', () => {
    const out = computeScore(input({ rules: [{ ...BIEN, deductionHundredths: null }, TEN] }));
    expect(out.breakdown.errors.find((e) => e.ruleKey === 'sai_bien')?.counted).toBe('unpriced');
    expect(out.breakdown.errorFlags).toEqual([{ ruleKey: 'sai_bien', code: 'unpriced' }]);
    expect(out.outcome).toBe('flagged');
  });

  it('lượt chấm dưới sàn → ungradable, không có điểm', () => {
    const out = computeScore(input({ bundleCases: [] }));
    expect(out.outcome).toBe('ungradable');
    expect(out.scoreHundredths).toBeNull();
  });
});

describe('repriceBreakdown — "áp giá mới cho phiên đã chốt" chỉ đổi GIÁ (§2.2, review I3)', () => {
  const finalized = computeScore(input({ stored: stored({ result: resultWith({ calls: CALLS, errors: [{ ruleKey: 'ten_bien', toolCallIds: ['r1'] }] }) }) })).breakdown;

  it('giá mới của luật đã có trong lượt tính đã chốt → điểm theo giá mới, cùng tập lỗi', () => {
    const out = repriceBreakdown(finalized, RUBRIC, new Map([['id-sai_bien', 200], ['id-ten_bien', 50]]));
    expect(out.scoreHundredths).toBe(1000 - 200 - 50);
    expect(out.breakdown.errors.map((e) => [e.ruleKey, e.deductionHundredths, e.counted])).toEqual([
      ['sai_bien', 200, 'counted'],
      ['ten_bien', 50, 'counted'],
    ]);
    expect(out.newlyUnpriced).toEqual([]);
  });

  it('luật KHÔNG có trong lượt tính đã chốt không bao giờ lọt vào, dù đã có giá', () => {
    const out = repriceBreakdown(finalized, RUBRIC, new Map([['id-sai_bien', 150], ['id-ten_bien', 50], ['id-moi', 300]]));
    expect(out.scoreHundredths).toBe(800);
    expect(out.breakdown.errors.map((e) => e.ruleKey)).toEqual(['sai_bien', 'ten_bien']);
  });

  it('luật đã có giá lúc chốt nay về chưa giá → nêu ra, không lặng lẽ thành lỗi miễn phí', () => {
    const out = repriceBreakdown(finalized, RUBRIC, new Map([['id-ten_bien', 50]]));
    expect(out.newlyUnpriced).toEqual([{ ruleId: 'id-sai_bien', ruleKey: 'sai_bien' }]);
  });

  it('lỗi đã bỏ cho riêng bài vẫn bỏ; giá của nó không đổi điểm (T-EXC-1)', () => {
    const excluded = computeScore(input({ exceptions: new Map([['id-sai_bien', 'exclude']]) })).breakdown;
    const out = repriceBreakdown(excluded, RUBRIC, new Map([['id-sai_bien', 500], ['id-ten_bien', 50]]));
    expect(out.scoreHundredths).toBe(1000 - 50);
    expect(out.breakdown.errors.find((e) => e.ruleKey === 'sai_bien')?.counted).toBe('excluded');
  });
});

describe('readStoredInvestigation', () => {
  it('nhận đúng khuôn, từ chối khuôn lạ', () => {
    expect(readStoredInvestigation(JSON.parse(JSON.stringify(stored()))).version).toBe(1);
    expect(() => readStoredInvestigation({ version: 2 })).toThrow(/hồ sơ lượt chấm/);
    expect(() => readStoredInvestigation(null)).toThrow(/hồ sơ lượt chấm/);
  });
});

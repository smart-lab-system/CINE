import { decide } from './decide';
import { isMachineChecked } from './predicates';
import { readFileCall, resultWith, runTestsCall } from './testing/result';
import { DecisionInput, ErrorRule } from './types';

const BUNDLE = { cases: [{ name: 'cb1', group: 'co_ban' }, { name: 'tl1', group: 'trung_lap' }] };
const RUBRIC = [{ key: 'tinh_dung', maxHundredths: 700 }, { key: 'trinh_bay', maxHundredths: 300 }];
const RULES: ErrorRule[] = [
  { ruleKey: 'sai_ca_co_ban', criterionKey: 'tinh_dung', deductionHundredths: 300, predicate: { kind: 'test_group_failed', group: 'co_ban' } },
  { ruleKey: 'khong_xu_ly_trung', criterionKey: 'tinh_dung', deductionHundredths: 150, predicate: { kind: 'test_group_failed', group: 'trung_lap' } },
  { ruleKey: 'chu_thich_sai', criterionKey: 'trinh_bay', deductionHundredths: 50, predicate: null },
];
const allPass = runTestsCall('tc-1', null, [{ name: 'cb1', group: 'co_ban', status: 'pass' }, { name: 'tl1', group: 'trung_lap', status: 'pass' }]);
const failCoBan = runTestsCall('tc-1', null, [{ name: 'cb1', group: 'co_ban', status: 'fail' }, { name: 'tl1', group: 'trung_lap', status: 'pass' }]);
const read = readFileCall('tc-2', 'bai-nop/main.cpp');
/** Bảng lỗi model đã được xem lúc điều tra — mặc định là chính RULES. */
const SEEN = RULES.map((r) => ({ ruleKey: r.ruleKey, checkedBy: isMachineChecked(r.predicate) ? ('machine' as const) : ('model' as const) }));
const input = (over: Partial<DecisionInput> = {}): DecisionInput => ({
  pipeline: 'investigator', result: resultWith({ calls: [allPass, read] }), bundle: BUNDLE, rubric: RUBRIC, rules: RULES,
  rulesSeen: SEEN, waivedCriteria: [], modelCeiling: 0.5, theta: 0.85, ...over,
});

describe('decide() — MỘT công thức tự quyết (§4.2)', () => {
  it('T-FLOOR-2 — bài đúng, đủ test và đều pass, đã đọc code → điểm TỐI ĐA, tự quyết, confidence 1', () => {
    const d = decide(input());
    expect(d).toMatchObject({ outcome: 'auto', scoreHundredths: 1000, maxHundredths: 1000, confidence: 1, caseFlags: [], errorFlags: [] });
  });

  it('lỗi do code quyết → điểm do code tính, tự quyết (deterministic, trần 1)', () => {
    const d = decide(input({ result: resultWith({ calls: [failCoBan, read] }) }));
    expect(d).toMatchObject({ outcome: 'auto', scoreHundredths: 700, confidence: 1 });
    expect(d.errors.map((e) => [e.ruleKey, e.source])).toEqual([['sai_ca_co_ban', 'deterministic']]);
  });

  it('T-AUTO-1 — confidence dưới θ → gắn cờ low_confidence', () => {
    const rules: ErrorRule[] = [...RULES.slice(0, 2), { ...RULES[2], deductionHundredths: 200 }];
    const r = resultWith({ calls: [failCoBan, read], errors: [{ ruleKey: 'chu_thich_sai', toolCallIds: ['tc-2'] }] });
    const d = decide(input({ rules, result: r, modelCeiling: 1 }));
    expect(d.confidence).toBeCloseTo((300 + 200 * 0.5) / 500); // 0,80
    expect(d.outcome).toBe('flagged');
    expect(d.caseFlags.map((f) => f.code)).toEqual(['low_confidence']);
  });

  it('T-POL-2 — luật chưa có giá: bài dính nó KHÔNG tự quyết; cờ gắn ĐÚNG lỗi đó, không gắn cả bài', () => {
    const rules = RULES.map((r) => (r.ruleKey === 'sai_ca_co_ban' ? { ...r, deductionHundredths: null } : r));
    const d = decide(input({ rules, result: resultWith({ calls: [failCoBan, read] }) }));
    expect(d.outcome).toBe('flagged');
    expect(d.errorFlags).toEqual([{ ruleKey: 'sai_ca_co_ban', code: 'unpriced' }]);
    expect(d.caseFlags).toEqual([]);
    expect(d.scoreHundredths).toBe(1000); // luật chưa giá không trừ gì
  });

  it('T-COMPILE-1 — bài không biên dịch: gói test ĐÃ chạy, mọi luật nhóm test bắn, §4.3 gắn cờ, KHÔNG ungradable, KHÔNG điểm tối đa', () => {
    const broken = runTestsCall('tc-1', null, [], { compileOk: false });
    const d = decide(input({ result: resultWith({ calls: [broken, read] }) }));
    expect(d.outcome).toBe('flagged');
    expect(d.ungradable).toBeNull();
    expect(d.caseFlags.map((f) => f.code)).toContain('nothing_passed');
    expect(d.errors.map((e) => e.ruleKey).sort()).toEqual(['khong_xu_ly_trung', 'sai_ca_co_ban']);
    expect(d.scoreHundredths).toBe(550);
    expect(d.confidence).toBeLessThanOrEqual(0.5);
  });

  it('§4.3 — mọi ca đều không đạt mà agent chỉ chẩn đoán vài lỗi nhỏ → gắn cờ, trần 0,5, KHÔNG tự cho 0 điểm', () => {
    const allFail = runTestsCall('tc-1', null, [{ name: 'cb1', group: 'co_ban', status: 'fail' }, { name: 'tl1', group: 'trung_lap', status: 'fail' }]);
    const d = decide(input({ result: resultWith({ calls: [allFail, read] }) }));
    expect(d.caseFlags.map((f) => f.code)).toContain('nothing_passed');
    expect(d.confidence).toBe(0.5);
    expect(d.scoreHundredths).toBe(550);
  });

  it('T-FLOOR-1 — cạn ngân sách với 0 phát hiện → ungradable lớp system, TUYỆT ĐỐI không phải điểm tối đa', () => {
    const d = decide(input({ result: resultWith({ calls: [allPass, read], stopReason: 'max_tool_calls', flags: ['budget_exhausted'] }) }));
    expect(d.outcome).toBe('ungradable');
    expect(d.ungradable).toEqual({ class: 'system', reason: expect.stringMatching(/T-FLOOR-1/) });
    expect(d.scoreHundredths).toBeNull();
  });

  it('Q4 — cạn ngân sách NHƯNG code đã tìm ra lỗi → không phải T-FLOOR-1 (phát hiện gồm cả lỗi do code quyết)', () => {
    const d = decide(input({ result: resultWith({ calls: [failCoBan, read], stopReason: 'max_rounds', flags: ['budget_exhausted'] }) }));
    expect(d.outcome).toBe('flagged');
    expect(d.caseFlags.map((f) => f.code)).toEqual(['investigation_flag']);
  });

  it('T-FLOOR-4 / Q2 — luật không predicate mà agent không đọc file bài nộp nào → tiêu chí chưa chạm tới, nêu đích danh', () => {
    const d = decide(input({ result: resultWith({ calls: [allPass] }) }));
    expect(d.outcome).toBe('flagged');
    expect(d.caseFlags).toEqual([{ code: 'criterion_untouched', detail: expect.stringMatching(/trinh_bay/) }]);
  });

  it('T-FLOOR-4 / Q1 — tiêu chí có luật predicate chưa đo được → chưa chạm tới, nêu luật và công cụ cần', () => {
    const rules: ErrorRule[] = [...RULES, { ruleKey: 'do_phuc_tap', criterionKey: 'hieu_nang', deductionHundredths: 300, predicate: { kind: 'complexity_exceeds_required' } }];
    const rubric = [...RUBRIC, { key: 'hieu_nang', maxHundredths: 300 }];
    const d = decide(input({ rules, rubric }));
    expect(d.outcome).toBe('flagged');
    expect(d.caseFlags).toEqual([{ code: 'criterion_untouched', detail: expect.stringMatching(/hieu_nang.*do_phuc_tap.*run_scaled/) }]);
  });

  it('T-FLOOR-6 — tiêu chí có trần mà không luật nào trỏ vào → không tự quyết; đánh dấu "không có luật trừ" → hết chặn', () => {
    const rubric = [...RUBRIC, { key: 'sang_tao', maxHundredths: 100 }];
    expect(decide(input({ rubric })).caseFlags).toEqual([{ code: 'criterion_without_rules', detail: expect.stringMatching(/sang_tao/) }]);
    expect(decide(input({ rubric, waivedCriteria: ['sang_tao'] })).outcome).toBe('auto');
  });

  it('Review Focus 4 — tiêu chí trần 0 không đòi luật', () => {
    expect(decide(input({ rubric: [...RUBRIC, { key: 'thuong', maxHundredths: 0 }] })).outcome).toBe('auto');
  });

  it('Q5 — cờ của cuộc điều tra chặn tự quyết, nêu đích danh', () => {
    for (const flag of ['injection_suspected', 'replay_mismatch', 'replay_unverified', 'evidence_rejected'] as const) {
      const d = decide(input({ result: resultWith({ calls: [allPass, read], flags: [flag] }) }));
      expect(d.outcome).toBe('flagged');
      expect(d.caseFlags).toEqual([{ code: 'investigation_flag', detail: flag }]);
    }
  });

  it('trần confidence của cuộc điều tra (replay lệch 0,5) được áp', () => {
    const d = decide(input({ result: resultWith({ calls: [allPass, read], confidenceCap: 0.5, flags: ['replay_mismatch'] }) }));
    expect(d.confidence).toBe(0.5);
  });

  it('T-EMPTY-1 / T-FLOOR-5 — kết quả ungradable của cuộc điều tra đi thẳng ra, giữ nguyên lớp', () => {
    const r = resultWith({ kind: 'ungradable', ungradable: { class: 'submission', reason: 'bài nộp không có dòng mã nào (T-EMPTY-1)' } });
    expect(decide(input({ result: r }))).toMatchObject({ outcome: 'ungradable', ungradable: { class: 'submission' }, scoreHundredths: null, confidence: null });
  });

  it('§0.3 — pipeline một-phát (bài tự luận) KHÔNG BAO GIỜ tự quyết', () => {
    const d = decide(input({ pipeline: 'one_shot' }));
    expect(d.outcome).toBe('flagged');
    expect(d.caseFlags.map((f) => f.code)).toContain('not_code_pipeline');
  });

  it('T-TIER-1 — đổi giá một luật: quyết lại trên hồ sơ ĐÃ LƯU, điểm đổi theo, không cần model hay sandbox', () => {
    const stored = resultWith({ calls: [failCoBan, read] });
    const before = decide(input({ result: stored }));
    const after = decide(input({ result: stored, rules: RULES.map((r) => (r.ruleKey === 'sai_ca_co_ban' ? { ...r, deductionHundredths: 100 } : r)) }));
    expect([before.scoreHundredths, after.scoreHundredths]).toEqual([700, 900]);
  });

  it('review I1 — biên dịch chập chờn (hỏng rồi qua, mọi ca pass) → KHÔNG tự quyết trừ điểm; không lỗi máy quyết, gắn cờ', () => {
    const r = resultWith({ calls: [runTestsCall('tc-3', null, [], { compileOk: false }), allPass, read] });
    const d = decide(input({ result: r }));
    expect(d.errors).toEqual([]);
    expect(d.outcome).toBe('flagged');
    expect(d.caseFlags.map((f) => f.code)).toContain('criterion_untouched');
  });

  it('review I2 — decide() tự kiểm độ phủ gói test: không run_tests nào → ungradable, KHÔNG phải điểm tối đa', () => {
    const rules: ErrorRule[] = [{ ruleKey: 'chu_thich_sai', criterionKey: 'trinh_bay', deductionHundredths: 50, predicate: null }];
    const d = decide(input({ rules, rubric: [{ key: 'trinh_bay', maxHundredths: 1000 }], rulesSeen: [{ ruleKey: 'chu_thich_sai', checkedBy: 'model' }], result: resultWith({ calls: [read] }) }));
    expect(d).toMatchObject({ outcome: 'ungradable', scoreHundredths: null, ungradable: { class: 'system', reason: expect.stringMatching(/chưa chạy đủ/) } });
  });

  it('review I2 — chỉ chạy một nửa gói → ungradable, nêu nhóm còn thiếu', () => {
    const half = runTestsCall('tc-1', 'co_ban', [{ name: 'cb1', group: 'co_ban', status: 'pass' }]);
    const d = decide(input({ result: resultWith({ calls: [half, read] }) }));
    expect(d.outcome).toBe('ungradable');
    expect(d.ungradable?.reason).toMatch(/trung_lap/);
  });

  it('review I2 — gói test rỗng → ungradable (§4.4 dòng đầu)', () => {
    expect(decide(input({ bundle: { cases: [] } })).outcome).toBe('ungradable');
  });

  it('review I3 — luật lời thêm SAU cuộc điều tra (model chưa từng thấy) → tiêu chí chưa xét theo luật đó, không tự quyết', () => {
    const rules: ErrorRule[] = [...RULES, { ruleKey: 'dat_ten_vo_nghia', criterionKey: 'trinh_bay', deductionHundredths: 50, predicate: null }];
    const d = decide(input({ rules }));
    expect(d.outcome).toBe('flagged');
    expect(d.caseFlags).toEqual([{ code: 'criterion_untouched', detail: expect.stringMatching(/dat_ten_vo_nghia.*chưa xét/) }]);
  });

  it('review I3 — luật model được dặn KHÔNG đề xuất (máy kiểm) nay mất predicate → không coi là model đã xét', () => {
    const rules = RULES.map((r) => (r.ruleKey === 'sai_ca_co_ban' ? { ...r, predicate: null } : r));
    const d = decide(input({ rules }));
    expect(d.caseFlags).toEqual([{ code: 'criterion_untouched', detail: expect.stringMatching(/sai_ca_co_ban.*KHÔNG đề xuất/) }]);
  });

  it('T-TIER-2 — luật máy kiểm MỚI, đánh giá được trên kết quả đã lưu → áp ngay', () => {
    const stored = resultWith({ calls: [failCoBan, read] });
    const rules: ErrorRule[] = [...RULES, { ruleKey: 'sai_co_ban_moi', criterionKey: 'trinh_bay', deductionHundredths: 50, predicate: { kind: 'test_group_failed', group: 'co_ban' } }];
    expect(decide(input({ result: stored, rules })).errors.map((e) => e.ruleKey)).toContain('sai_co_ban_moi');
  });
});

import { decide } from './decide';
import { isMachineChecked } from './predicates';
import { readFileCall, resultWith, runTestsCall } from './testing/result';
import { DecisionInput, ErrorRule } from './types';
import type { StoredChallenge } from '../investigator/challenge';

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
  rulesSeen: SEEN, waivedCriteria: [], modelCeiling: 0.5, theta: 0.85, challenge: null, ...over,
});

/** Một kết luận phản biện tự dựng — một lăng kính gộp mọi ruleKey cho gọn test. */
function challengeOf(
  perError: { ruleKey: string; status: 'confirmed' | 'refuted' | 'unverified' }[],
  caseNotes: StoredChallenge['caseNotes'] = [],
): StoredChallenge {
  return {
    perError: [{ challenger: 'lens', perError: perError.map((e) => ({ ...e, toolCallIds: [] })) }],
    caseNotes,
  };
}

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

  it('review eef17b1 I-1 — biên dịch chập chờn + lần đã biên dịch fail cả nhóm → vẫn trừ điểm; cạn ngân sách không thành "0 phát hiện"', () => {
    const flaky = runTestsCall('tc-3', null, [], { compileOk: false });
    const d = decide(input({ result: resultWith({ calls: [flaky, failCoBan, read] }) }));
    expect(d.errors.map((e) => [e.ruleKey, e.source, e.toolCallIds])).toEqual([['sai_ca_co_ban', 'deterministic', ['tc-1']]]);
    expect(d).toMatchObject({ outcome: 'flagged', scoreHundredths: 700 });
    expect(d.caseFlags.map((f) => f.code)).toEqual(['criterion_untouched']); // khong_xu_ly_trung: chưa ổn định
    const budget = decide(input({ result: resultWith({ calls: [flaky, failCoBan, read], stopReason: 'max_rounds', flags: ['budget_exhausted'] }) }));
    expect(budget).toMatchObject({ outcome: 'flagged', scoreHundredths: 700 });
  });

  it('review eef17b1 M5 — bài tự luận không có gói test: gắn cờ not_code_pipeline, KHÔNG rơi vào sàn gói test', () => {
    const d = decide(input({ pipeline: 'one_shot', bundle: { cases: [] }, result: resultWith({ calls: [] }) }));
    expect(d.outcome).toBe('flagged');
    expect(d.caseFlags.map((f) => f.code)).toContain('not_code_pipeline');
  });

  it('review I2 — decide() tự kiểm độ phủ gói test: không run_tests nào → ungradable, KHÔNG phải điểm tối đa', () => {
    const rules: ErrorRule[] = [{ ruleKey: 'chu_thich_sai', criterionKey: 'trinh_bay', deductionHundredths: 50, predicate: null }];
    const d = decide(input({ rules, rubric: [{ key: 'trinh_bay', maxHundredths: 1000 }], rulesSeen: [{ ruleKey: 'chu_thich_sai', checkedBy: 'model' }], result: resultWith({ calls: [read] }) }));
    expect(d).toMatchObject({ outcome: 'ungradable', scoreHundredths: null, ungradable: { class: 'system', reason: expect.stringMatching(/chưa chạy đủ/) } });
    expect(d.ungradable?.reason).not.toMatch(/§/);
  });

  it('review I2 — chỉ chạy một nửa gói → ungradable, nêu nhóm còn thiếu', () => {
    const half = runTestsCall('tc-1', 'co_ban', [{ name: 'cb1', group: 'co_ban', status: 'pass' }]);
    const d = decide(input({ result: resultWith({ calls: [half, read] }) }));
    expect(d.outcome).toBe('ungradable');
    expect(d.ungradable?.reason).toMatch(/trung_lap/);
  });

  it('review I2 — gói test rỗng → ungradable (§4.4 dòng đầu)', () => {
    const d = decide(input({ bundle: { cases: [] } }));
    expect(d.outcome).toBe('ungradable');
    expect(d.ungradable?.reason).toMatch(/gói test rỗng/);
    expect(d.ungradable?.reason).not.toMatch(/§/);
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

describe('decide() — §6.2 phản biện', () => {
  const withError = { result: resultWith({ calls: [failCoBan, read] }) };
  // sai_ca_co_ban (deterministic, từ failCoBan) — dùng để kiểm C2 (lỗi máy quyết MIỄN NHIỄM
  // với phản biện). chu_thich_sai (predicate null → luật LỜI) là lỗi bị lăng kính xét ở các test
  // §6.2 khác — sau review cuối (finding C2): lăng kính KHÔNG được phép bác/unverify một lỗi
  // MÁY QUYẾT (§4.1 "Code đánh giá predicate. Model không tham gia"), nên các test §6.2 phải
  // xét một lỗi model, không phải sai_ca_co_ban.
  const withModelError = { result: resultWith({ calls: [failCoBan, read], errors: [{ ruleKey: 'chu_thich_sai', toolCallIds: ['tc-2'] }] }) };

  it('lỗi bị refuted → KHÔNG trừ điểm, NHƯNG vẫn nằm trong errors và có errorFlag refuted', () => {
    const withRefute = decide(input({ ...withModelError, challenge: challengeOf([{ ruleKey: 'chu_thich_sai', status: 'refuted' }]) }));
    const withoutChallenge = decide(input(withModelError));
    expect(withRefute.errors.map((e) => e.ruleKey)).toContain('chu_thich_sai');
    expect(withRefute.errorFlags).toContainEqual({ ruleKey: 'chu_thich_sai', code: 'refuted' });
    expect(withRefute.scoreHundredths).toBe(700); // 1000 - 300 (sai_ca_co_ban) - 0 (chu_thich_sai bị bác)
    expect(withoutChallenge.scoreHundredths).toBe(650); // 1000 - 300 - 50
  });

  it('lỗi bị unverified → GIỮ trong điểm, gắn errorFlag unverified, hạ confidence', () => {
    const d = decide(input({ ...withModelError, challenge: challengeOf([{ ruleKey: 'chu_thich_sai', status: 'unverified' }]) }));
    expect(d.errorFlags).toContainEqual({ ruleKey: 'chu_thich_sai', code: 'unverified' });
    expect(d.scoreHundredths).toBe(650);
    expect(d.confidence).toBeLessThanOrEqual(0.5);
  });

  it('lỗi confirmed → không thêm errorFlag nào, hành vi y hệt không bật phản biện', () => {
    const withConfirmed = decide(input({ ...withModelError, challenge: challengeOf([{ ruleKey: 'chu_thich_sai', status: 'confirmed' }]) }));
    const withoutChallenge = decide(input({ ...withModelError, challenge: null }));
    expect(withConfirmed.errorFlags).toEqual(withoutChallenge.errorFlags);
    expect(withConfirmed.scoreHundredths).toEqual(withoutChallenge.scoreHundredths);
  });

  it('challenge: null (chưa bật, hay hồ sơ cũ) → hành vi y hệt hôm nay, KHÔNG tự gắn unverified cho ai (Review Focus 3)', () => {
    const d = decide(input({ ...withModelError, challenge: null }));
    expect(d.errorFlags.some((f) => f.code === 'refuted' || f.code === 'unverified')).toBe(false);
  });

  it('C2 — lỗi MÁY QUYẾT (deterministic) MIỄN NHIỄM với phản biện, dù có kết luận challenge trỏ đúng ruleKey của nó (§4.1)', () => {
    const d = decide(input({ ...withError, challenge: challengeOf([{ ruleKey: 'sai_ca_co_ban', status: 'refuted' }]) }));
    expect(d.errorFlags.some((f) => f.ruleKey === 'sai_ca_co_ban')).toBe(false);
    expect(d.scoreHundredths).toBe(700); // KHÔNG phải 1000 — bị bác không có tác dụng gì trên lỗi máy quyết
  });

  it('caseNote suspected=true (Bỏ sót/Gian lận) → caseFlag challenge_suspected, chặn tự quyết', () => {
    const d = decide(input({ challenge: challengeOf([], [{ lens: 'gian_lan', suspected: true, concluded: true, note: 'nghi hard-code' }]) }));
    expect(d.caseFlags).toContainEqual({ code: 'challenge_suspected', detail: expect.stringContaining('gian_lan') });
    expect(d.outcome).not.toBe('auto');
  });

  it('unverified hạ confidence NHƯNG không tự đẩy outcome xuống ungradable (Review Focus 4)', () => {
    const d = decide(input({ ...withModelError, challenge: challengeOf([{ ruleKey: 'chu_thich_sai', status: 'unverified' }]) }));
    expect(d.outcome).not.toBe('ungradable');
  });

  it('W5 — MỘT lăng kính xác nhận (đã tự chạy), lăng kính KIA không trả lời được → gộp thành confirmed, không phải unverified (im lặng của một lăng kính không kéo tụt lăng kính đã xác nhận)', () => {
    const mixed: StoredChallenge = {
      perError: [
        { challenger: 'tinh_dung', perError: [{ ruleKey: 'chu_thich_sai', status: 'confirmed', toolCallIds: [] }] },
        { challenger: 'qua_tay', perError: [{ ruleKey: 'chu_thich_sai', status: 'unverified', toolCallIds: [] }] },
      ],
      caseNotes: [],
    };
    const d = decide(input({ ...withModelError, challenge: mixed }));
    expect(d.errorFlags.some((f) => f.ruleKey === 'chu_thich_sai')).toBe(false);
    expect(d.scoreHundredths).toBe(650); // tính như confirmed, không hạ confidence như unverified
  });
});

/** Cờ gửi giảng viên hiện ở dòng chi tiết; mã mục spec (§x.y) là ghi chú nội bộ, không được lộ ra. */
function expectPlainDetail(d: ReturnType<typeof decide>, code: string): void {
  const flag = d.caseFlags.find((f) => f.code === code);
  expect(flag).toBeDefined();
  expect(flag?.detail).not.toMatch(/§/);
}

describe('decide() — chi tiết cờ gửi giảng viên không mang mã mục spec', () => {
  it('nothing_passed: mọi ca không đạt', () => {
    const allFail = runTestsCall('tc-1', null, [{ name: 'cb1', group: 'co_ban', status: 'fail' }, { name: 'tl1', group: 'trung_lap', status: 'fail' }]);
    expectPlainDetail(decide(input({ result: resultWith({ calls: [allFail, read] }) })), 'nothing_passed');
  });

  it('not_code_pipeline: bài tự luận', () => {
    expectPlainDetail(decide(input({ pipeline: 'one_shot', bundle: { cases: [] }, result: resultWith({ calls: [] }) })), 'not_code_pipeline');
  });

  it('ruler_unverified: thước chưa kiểm chứng', () => {
    expectPlainDetail(decide(input({ rulerTrust: 'unverified' })), 'ruler_unverified');
  });

  it('no_error_auto_disabled: tự chốt bài không lỗi đang tắt', () => {
    expectPlainDetail(decide(input({ autoNoErrorEnabled: false })), 'no_error_auto_disabled');
  });

  it('type_auto_disabled: tự chốt đang tắt cho một loại lỗi', () => {
    const d = decide(input({ result: resultWith({ calls: [failCoBan, read] }), autoBlockedRuleKeys: new Set(['sai_ca_co_ban']) }));
    expectPlainDetail(d, 'type_auto_disabled');
  });
});

describe('decide() — cờ ruler_unverified (§6.3b, P1b)', () => {
  it('bài đủ bằng chứng nhưng thước chưa kiểm chứng → flagged kèm cờ ruler_unverified, không tự quyết', () => {
    const d = decide(input({ rulerTrust: 'unverified' }));
    expect(d.outcome).toBe('flagged');
    expect(d.caseFlags.map((f) => f.code)).toContain('ruler_unverified');
  });

  it.each([['teacher'], ['verified'], [null]] as const)('rulerTrust = %s giữ hành vi cũ: bài đủ bằng chứng vẫn tự quyết', (trust) => {
    const d = decide(input({ rulerTrust: trust }));
    expect(d).toMatchObject({ outcome: 'auto', caseFlags: [] });
  });

  it('không khai báo rulerTrust (hồ sơ cũ, đường one_shot) giữ hành vi cũ', () => {
    expect(decide(input()).outcome).toBe('auto');
  });
});

describe('decide() — lăng kính cấp bài không kết luận được (lỗ hổng HS2410021, diễn tập 19/10)', () => {
  // Bài KHÔNG có lỗi nào: trước đây hai lăng kính hết giờ → không có ghi chú nghi ngờ → tự duyệt điểm 10 cho bài hard-code.
  const noErrorWith = (caseNotes: StoredChallenge['caseNotes']) => input({ challenge: challengeOf([], caseNotes) });

  it('lăng kính Gian lận hết giờ (không kết luận) → KHÔNG tự quyết, gắn challenge_incomplete nêu đích danh lăng kính', () => {
    const d = decide(noErrorWith([
      { lens: 'gian_lan', suspected: false, concluded: false, note: 'không kết luận được — hết giờ (100s)' },
      { lens: 'bo_sot', suspected: false, concluded: true, note: 'đã đọc, không thấy lỗi' },
    ]));
    expect(d.outcome).toBe('flagged');
    expect(d.caseFlags).toContainEqual({ code: 'challenge_incomplete', detail: expect.stringContaining('gian_lan') });
  });

  it('cả hai lăng kính đã kết luận "không nghi ngờ" → vẫn tự quyết (không làm tụt bài đúng)', () => {
    const d = decide(noErrorWith([
      { lens: 'gian_lan', suspected: false, concluded: true, note: 'ok' },
      { lens: 'bo_sot', suspected: false, concluded: true, note: 'ok' },
    ]));
    expect(d).toMatchObject({ outcome: 'auto', caseFlags: [] });
  });

  it('hồ sơ ghi trước trường concluded → coi là chưa xét, không tự quyết (bên an toàn)', () => {
    const legacy = { lens: 'gian_lan', suspected: false, note: 'ok' } as unknown as StoredChallenge['caseNotes'][number];
    expect(decide(noErrorWith([legacy])).outcome).toBe('flagged');
  });

  it('một lăng kính nêu nghi vấn VÀ một lăng kính không kết luận được → gắn cả hai cờ, không tự quyết', () => {
    const d = decide(noErrorWith([
      { lens: 'gian_lan', suspected: true, concluded: true, note: 'nghi hard-code' },
      { lens: 'bo_sot', suspected: false, concluded: false, note: 'không kết luận được — hết giờ' },
    ]));
    expect(d.outcome).toBe('flagged');
    expect(d.caseFlags.map((f) => f.code)).toEqual(expect.arrayContaining(['challenge_suspected', 'challenge_incomplete']));
  });

  it('không có phản biện (challenge: null) → không gắn challenge_incomplete, hành vi cũ giữ nguyên', () => {
    expect(decide(input({ challenge: null })).outcome).toBe('auto');
  });
});

describe('decide() — cờ chặn tự chốt: lớp bài không lỗi và luật bị chặn', () => {
  // Bài không lỗi = mặc định của input(): mọi ca pass, đã đọc bài nộp, confidence 1,0.
  // Bài có lỗi máy = failCoBan → sai_ca_co_ban (deterministic), confidence 1,0, hôm nay tự chốt.
  const withMachineError = { result: resultWith({ calls: [failCoBan, read] }) };

  it('bài không có lỗi nào không tự chốt khi autoNoErrorEnabled=false, kể cả confidence 1,0', () => {
    const r = decide(input({ autoNoErrorEnabled: false }));
    expect(r.errors).toEqual([]);
    expect(r.confidence).toBe(1);
    expect(r.outcome).toBe('flagged');
    expect(r.caseFlags.map((f) => f.code)).toContain('no_error_auto_disabled');
  });

  it('tham số vắng mặt: bài không lỗi vẫn tự chốt như hôm nay', () => {
    expect(decide(input()).outcome).toBe('auto');
  });

  it('autoNoErrorEnabled=true: bài không lỗi vẫn tự chốt', () => {
    expect(decide(input({ autoNoErrorEnabled: true }))).toMatchObject({ outcome: 'auto', caseFlags: [] });
  });

  it('autoNoErrorEnabled=false chỉ chặn lớp bài không lỗi: bài có lỗi máy vẫn tự chốt', () => {
    expect(decide(input({ ...withMachineError, autoNoErrorEnabled: false })).outcome).toBe('auto');
  });

  it('lỗi thuộc autoBlockedRuleKeys không tự chốt; điểm và confidence không đổi', () => {
    const r = decide(input({ ...withMachineError, autoBlockedRuleKeys: new Set(['sai_ca_co_ban']) }));
    const base = decide(input(withMachineError));
    expect(r.outcome).toBe('flagged');
    expect(r.caseFlags.map((f) => f.code)).toContain('type_auto_disabled');
    expect([r.scoreHundredths, r.confidence]).toEqual([base.scoreHundredths, base.confidence]);
  });

  it('tham số vắng mặt: bài có lỗi máy, confidence 1,0 vẫn tự chốt như hôm nay', () => {
    expect(decide(input(withMachineError))).toMatchObject({ outcome: 'auto', confidence: 1 });
  });

  it('tập chặn rỗng: bài có lỗi máy vẫn tự chốt như hôm nay', () => {
    expect(decide(input({ ...withMachineError, autoBlockedRuleKeys: new Set() })).outcome).toBe('auto');
  });

  it('tập chặn chứa khoá khác thì không ảnh hưởng', () => {
    expect(decide(input({ ...withMachineError, autoBlockedRuleKeys: new Set(['khong_xu_ly_trung']) })).outcome).toBe('auto');
  });

  it('nhiều lỗi thuộc tập chặn → một cờ cho mỗi khoá, nêu đích danh khoá', () => {
    const twoErrors = { result: resultWith({ calls: [failCoBan, read], errors: [{ ruleKey: 'chu_thich_sai', toolCallIds: ['tc-2'] }] }) };
    const r = decide(input({ ...twoErrors, autoBlockedRuleKeys: new Set(['sai_ca_co_ban', 'chu_thich_sai']) }));
    const blocked = r.caseFlags.filter((f) => f.code === 'type_auto_disabled');
    expect(blocked).toHaveLength(2);
    expect(blocked.map((f) => f.detail)).toEqual(
      expect.arrayContaining([expect.stringContaining('sai_ca_co_ban'), expect.stringContaining('chu_thich_sai')]),
    );
  });
});

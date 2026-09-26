import { diagnose } from './diagnose';
import { readFileCall, resultWith, runTestsCall } from './testing/result';
import { ErrorRule } from './types';

const BUNDLE = { cases: [{ name: 'cb1', group: 'co_ban' }, { name: 'tl1', group: 'trung_lap' }] };
const RULES: ErrorRule[] = [
  { ruleKey: 'sai_ca_co_ban', criterionKey: 'tinh_dung', deductionHundredths: 300, predicate: { kind: 'test_group_failed', group: 'co_ban' } },
  { ruleKey: 'khong_xu_ly_trung', criterionKey: 'tinh_dung', deductionHundredths: 150, predicate: { kind: 'test_group_failed', group: 'trung_lap' } },
  { ruleKey: 'do_phuc_tap', criterionKey: 'hieu_nang', deductionHundredths: 300, predicate: { kind: 'complexity_exceeds_required' } },
  { ruleKey: 'chu_thich_sai', criterionKey: 'trinh_bay', deductionHundredths: 50, predicate: null },
];
const failCoBan = runTestsCall('tc-2', null, [
  { name: 'cb1', group: 'co_ban', status: 'fail' }, { name: 'tl1', group: 'trung_lap', status: 'pass' },
]);

describe('diagnose — nguồn gốc của từng lỗi (§4.1)', () => {
  it('luật máy kiểm: code quyết, nguồn gốc deterministic — model không cần nhắc tới', () => {
    const d = diagnose({ rules: RULES, bundle: BUNDLE, result: resultWith({ calls: [failCoBan] }) });
    expect(d.errors).toEqual([
      { ruleKey: 'sai_ca_co_ban', criterionKey: 'tinh_dung', deductionHundredths: 300, source: 'deterministic', toolCallIds: ['tc-2'] },
    ]);
    expect(d.measurements.map((m) => [m.ruleKey, m.outcome.state])).toEqual([
      ['sai_ca_co_ban', 'present'], ['khong_xu_ly_trung', 'absent'], ['do_phuc_tap', 'unmeasured'],
    ]);
  });

  it('Review Focus 3 — model đề xuất đúng luật máy kiểm → trừ MỘT lần, deterministic; đề xuất vào danh sách bỏ qua', () => {
    const r = resultWith({ calls: [failCoBan], errors: [{ ruleKey: 'sai_ca_co_ban', toolCallIds: ['tc-2'] }] });
    const d = diagnose({ rules: RULES, bundle: BUNDLE, result: r });
    expect(d.errors.filter((e) => e.ruleKey === 'sai_ca_co_ban')).toHaveLength(1);
    expect(d.errors[0].source).toBe('deterministic');
    expect(d.ignored).toEqual([{ ruleKey: 'sai_ca_co_ban', reason: 'machine_checked_rule' }]);
  });

  it('§4.1 luật 2 — model đề xuất luật máy kiểm mà code KHÔNG thấy → không thành lỗi (code thắng model)', () => {
    const allPass = runTestsCall('tc-2', null, [{ name: 'cb1', group: 'co_ban', status: 'pass' }, { name: 'tl1', group: 'trung_lap', status: 'pass' }]);
    const r = resultWith({ calls: [allPass], errors: [{ ruleKey: 'sai_ca_co_ban', toolCallIds: ['tc-2'] }] });
    const d = diagnose({ rules: RULES, bundle: BUNDLE, result: r });
    expect(d.errors).toEqual([]);
    expect(d.ignored).toEqual([{ ruleKey: 'sai_ca_co_ban', reason: 'machine_checked_rule' }]);
  });

  it('§4.1 luật 3 — luật không predicate có bằng chứng run/run_tests → llm_with_tools, dù bằng chứng chắc chắn', () => {
    const r = resultWith({ calls: [failCoBan], errors: [{ ruleKey: 'chu_thich_sai', toolCallIds: ['tc-2'] }] });
    expect(diagnose({ rules: RULES, bundle: BUNDLE, result: r }).errors.find((e) => e.ruleKey === 'chu_thich_sai')?.source).toBe('llm_with_tools');
  });

  it('bằng chứng chỉ là lời gọi đọc (read_file, list_files) → llm_only: không công cụ nào chống lưng phán đoán', () => {
    const r = resultWith({ calls: [readFileCall('tc-1', 'bai-nop/main.cpp')], errors: [{ ruleKey: 'chu_thich_sai', toolCallIds: ['tc-1'] }] });
    expect(diagnose({ rules: RULES, bundle: BUNDLE, result: r }).errors).toEqual([
      { ruleKey: 'chu_thich_sai', criterionKey: 'trinh_bay', deductionHundredths: 50, source: 'llm_only', toolCallIds: ['tc-1'] },
    ]);
  });

  it('Q1 — luật predicate chưa đo được (độ phức tạp): model được phán đoán, nguồn gốc theo bằng chứng, không deterministic', () => {
    const r = resultWith({ calls: [failCoBan], errors: [{ ruleKey: 'do_phuc_tap', toolCallIds: ['tc-2'] }] });
    const e = diagnose({ rules: RULES, bundle: BUNDLE, result: r }).errors.find((x) => x.ruleKey === 'do_phuc_tap');
    expect(e?.source).toBe('llm_with_tools');
  });

  it('kết quả không kết luận được (ungradable) → không lỗi nào, kể cả lỗi code đo được', () => {
    const r = resultWith({ kind: 'ungradable', ungradable: { class: 'system', reason: 'x' }, calls: [failCoBan] });
    expect(diagnose({ rules: RULES, bundle: BUNDLE, result: r }).errors).toEqual([]);
  });
});

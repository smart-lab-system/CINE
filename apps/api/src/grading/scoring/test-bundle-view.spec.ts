import { buildTestBundleView, caseViewStatus, TestBundleInput } from './test-bundle-view';

const cases: TestBundleInput['cases'] = [
  { caseKey: 'c1', group: 'bien', input: '1', expectedOutput: '2', constraintQuote: 'Đọc n', autoDroppedReason: null },
  { caseKey: 'c2', group: 'bien', input: '2', expectedOutput: '4', constraintQuote: null, autoDroppedReason: null },
  { caseKey: 'c3', group: 'ghi', input: '3', expectedOutput: '9', constraintQuote: null, autoDroppedReason: null },
  { caseKey: 'c4', group: 'ghi', input: 'x', expectedOutput: '0', constraintQuote: null, autoDroppedReason: 'trùng ca c3' },
];

const rule = (ruleId: string, group: string, triggered = false): TestBundleInput['rules'][number] => ({
  ruleId,
  ruleKey: `luat_${group}`,
  predicate: { kind: 'test_group_failed', group },
  deductionHundredths: 150,
  triggered,
});

const base = (over: Partial<TestBundleInput> = {}): TestBundleInput => ({
  id: 'b1',
  version: 2,
  origin: 'teacher',
  filename: 'de.json',
  approvedAt: new Date('2026-10-20T00:00:00Z'),
  cases,
  runs: [],
  rules: [],
  ...over,
});

describe('caseViewStatus — trạng thái ca cho giao diện (§5.8c)', () => {
  it('map trạng thái sandbox sang năm trạng thái; không có kết quả thì not_run, KHÔNG phải đạt', () => {
    expect(caseViewStatus(null)).toBe('not_run');
    expect(caseViewStatus('pass')).toBe('pass');
    expect(caseViewStatus('fail')).toBe('fail');
    expect(caseViewStatus('timeout')).toBe('timeout');
    expect(caseViewStatus('runtime_crash')).toBe('error');
    expect(caseViewStatus('recursion_limit')).toBe('error');
    expect(caseViewStatus('output_limit')).toBe('error');
    expect(caseViewStatus('ran')).toBe('not_run');
  });
});

describe('buildTestBundleView', () => {
  it('dòng giới thiệu: phiên bản, nguồn, tên file, đã duyệt; ca bị hệ thống bỏ không tính vào số ca', () => {
    const v = buildTestBundleView(base());
    expect(v).toMatchObject({ id: 'b1', version: 2, origin: 'teacher', filename: 'de.json', approved: true, caseCount: 3, droppedCount: 1 });
  });

  it('chưa duyệt → approved = false', () => {
    expect(buildTestBundleView(base({ approvedAt: null })).approved).toBe(false);
  });

  it('nhóm theo group; ca không đạt đứng trước; ca không có trong lượt chạy là not_run, không phải đạt', () => {
    const runs = [
      { name: 'c1', group: 'bien', status: 'pass' as const, diff: null, ms: 3 },
      { name: 'c2', group: 'bien', status: 'fail' as const, diff: '- 4\n+ 5', ms: 12 },
    ];
    const v = buildTestBundleView(base({ runs, rules: [rule('r1', 'bien', true)] }));
    const bien = v.groups.find((g) => g.group === 'bien')!;
    expect(bien.cases.map((c) => [c.caseKey, c.status])).toEqual([
      ['c2', 'fail'],
      ['c1', 'pass'],
    ]);
    expect(bien.cases[0]).toMatchObject({ ms: 12, diff: '- 4\n+ 5', input: '2', expectedOutput: '4' });
    const ghi = v.groups.find((g) => g.group === 'ghi')!;
    expect(ghi.cases).toEqual([expect.objectContaining({ caseKey: 'c3', status: 'not_run', ms: null, diff: null })]);
  });

  it('câu trích của đề đi kèm ca; ca dùng nhóm nào thì quy tắc của nhóm đó nằm dưới nhóm, kèm trạng thái đang trừ hay chưa', () => {
    const v = buildTestBundleView(base({ rules: [rule('r1', 'bien', true), rule('r2', 'bien', false)] }));
    const bien = v.groups.find((g) => g.group === 'bien')!;
    expect(bien.cases.find((c) => c.caseKey === 'c1')!.constraintQuote).toBe('Đọc n');
    expect(bien.rules).toEqual([
      { ruleId: 'r1', ruleKey: 'luat_bien', deductionHundredths: 150, triggered: true },
      { ruleId: 'r2', ruleKey: 'luat_bien', deductionHundredths: 150, triggered: false },
    ]);
  });

  it('ca không đạt mà nhóm không có quy tắc nào → uncoveredFailingCases; ca không đạt đã có quy tắc thì không', () => {
    const runs = [
      { name: 'c2', group: 'bien', status: 'fail' as const, diff: null, ms: 1 },
      { name: 'c3', group: 'ghi', status: 'fail' as const, diff: null, ms: 1 },
    ];
    const v = buildTestBundleView(base({ runs, rules: [rule('r1', 'bien')] }));
    expect(v.uncoveredFailingCases).toEqual(['c3']);
  });

  it('quy tắc dùng một nhóm mà gói không có → unmeasuredRules; không có nghĩa là đạt và không vào groups', () => {
    const v = buildTestBundleView(base({ rules: [rule('r9', 'thieu_nhom')] }));
    expect(v.unmeasuredRules).toEqual([{ ruleId: 'r9', ruleKey: 'luat_thieu_nhom', group: 'thieu_nhom' }]);
    expect(v.groups.map((g) => g.group)).not.toContain('thieu_nhom');
  });

  it('quy tắc không phải test_group_failed không bị đưa vào unmeasuredRules', () => {
    const other: TestBundleInput['rules'][number] = {
      ruleId: 'r5', ruleKey: 'luat_khac', predicate: { kind: 'no_recursion' }, deductionHundredths: 50, triggered: false,
    };
    expect(buildTestBundleView(base({ rules: [other] })).unmeasuredRules).toEqual([]);
  });

  it('gói không có ca nào → groups rỗng, không lỗi', () => {
    const v = buildTestBundleView(base({ cases: [] }));
    expect(v).toMatchObject({ caseCount: 0, droppedCount: 0, groups: [], uncoveredFailingCases: [] });
  });
});

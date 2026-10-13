import { Manifest, manifestSchema } from './manifest.schema';
import { waiveUnmeasured } from './waive';

function manifest(): Manifest {
  return manifestSchema.parse({
    id: 'x', split: 'dev', language: 'cpp', statement: 's', requiredComplexity: null,
    driver: 'd.cpp', modelAnswer: 'm.cpp', tests: 't.json', probes: 'p.json',
    rubric: [
      { key: 'tinh_dung', description: 'Tính đúng', maxPoints: '6.00' },
      { key: 'hieu_nang', description: 'Hiệu năng', maxPoints: '3.00' },
      { key: 'trinh_bay', description: 'Trình bày', maxPoints: '1.00' },
    ],
    rules: [
      { ruleKey: 'sai_co_ban', title: 'a', criterionKey: 'tinh_dung', deduction: '4.00', predicate: { kind: 'test_group_failed', group: 'co_ban' } },
      { ruleKey: 'dung_sort', title: 'b', criterionKey: 'tinh_dung', deduction: '1.00', predicate: { kind: 'calls_function', name: 'sort' } },
      { ruleKey: 'do_phuc_tap', title: 'c', criterionKey: 'hieu_nang', deduction: '3.00', predicate: { kind: 'complexity_exceeds_required' } },
      { ruleKey: 'chu_thich_sai', title: 'd', criterionKey: 'trinh_bay', deduction: '0.50', predicate: null },
    ],
    cases: [
      { id: 'A0', group: 2, file: 'model.cpp', behavior: 'dynamic', expectedRuleIds: [], expectedOutcome: 'graded', expectedScore: '10.00', expectedComplexity: null, cleanTwin: null, note: '' },
      { id: 'M1', group: 1, file: 'm1.cpp', behavior: 'dynamic', expectedRuleIds: ['sai_co_ban', 'do_phuc_tap', 'dung_sort'], expectedOutcome: 'graded', expectedScore: '0.00', expectedComplexity: null, cleanTwin: null, note: '' },
    ],
  });
}

describe('waiveUnmeasured()', () => {
  it('bỏ luật chưa đo được của tiêu chí được nêu; tiêu chí mất hết luật được đánh dấu miễn', () => {
    const m = manifest();
    const removed = waiveUnmeasured(m, ['hieu_nang']);
    expect(removed).toEqual(['do_phuc_tap']);
    expect(m.rules.map((r) => r.ruleKey)).toEqual(['sai_co_ban', 'dung_sort', 'chu_thich_sai']);
    expect(m.waivedCriteria).toEqual(['hieu_nang']);
  });

  it('tiêu chí còn luật đo được ở lại thì KHÔNG bị đánh dấu miễn — chỉ luật chưa đo được bị bỏ', () => {
    const m = manifest();
    expect(waiveUnmeasured(m, ['tinh_dung'])).toEqual(['dung_sort']);
    expect(m.rules.map((r) => r.ruleKey)).toContain('sai_co_ban');
    expect(m.waivedCriteria).toEqual([]);
  });

  it('luật lời (predicate null) và luật máy đo được của tiêu chí được nêu ở lại', () => {
    const m = manifest();
    expect(waiveUnmeasured(m, ['trinh_bay'])).toEqual([]);
    expect(m.rules).toHaveLength(4);
    expect(m.waivedCriteria).toEqual([]);
  });

  it('bỏ luôn khoá luật khỏi expectedRuleIds để điểm kỳ vọng tính trên cùng bảng luật', () => {
    const m = manifest();
    waiveUnmeasured(m, ['hieu_nang', 'tinh_dung']);
    expect(m.cases.find((c) => c.id === 'M1')!.expectedRuleIds).toEqual(['sai_co_ban']);
  });

  it('giữ các tiêu chí đã miễn từ trước và không nhân đôi', () => {
    const m = manifest();
    m.waivedCriteria = ['hieu_nang'];
    waiveUnmeasured(m, ['hieu_nang']);
    expect(m.waivedCriteria).toEqual(['hieu_nang']);
  });

  it('không nêu tiêu chí nào → không đổi gì', () => {
    const m = manifest();
    expect(waiveUnmeasured(m, [])).toEqual([]);
    expect(m.rules).toHaveLength(4);
    expect(m.waivedCriteria).toEqual([]);
  });
});

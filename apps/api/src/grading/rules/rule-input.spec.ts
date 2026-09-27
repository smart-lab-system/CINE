import { parseDeduction, parseRuleChanges, parseRuleInput } from './rule-input';

const base = { ruleKey: 'sai_bien', name: 'Sai biên', description: 'Ca biên không đạt', criterionKey: 'tinh_dung' };

describe('parseRuleInput', () => {
  it.each([
    [null],
    [{ kind: 'test_group_failed', group: 'bien' }],
    [{ kind: 'calls_function', name: 'sort' }],
    [{ kind: 'complexity_exceeds_required' }],
    [{ kind: 'no_recursion' }],
    [{ kind: 'no_recursion', functionName: 'dfs' }],
  ])('nhận mẫu %j', (predicate) => {
    expect(parseRuleInput({ ...base, predicate }).predicate).toEqual(predicate);
  });

  it.each([
    [{ kind: 'eval_code', src: 'x' }],
    [{ kind: 'test_group_failed' }],
    [{ kind: 'complexity_exceeds_required', x: 1 }],
    [{ kind: 'calls_function', name: 'a b' }],
    ['test_group_failed'],
  ])('từ chối mẫu %j', (predicate) => {
    expect(() => parseRuleInput({ ...base, predicate })).toThrow(/điều kiện/);
  });

  it('từ chối khoá luật và khoá tiêu chí sai khuôn', () => {
    expect(() => parseRuleInput({ ...base, ruleKey: 'Sai Bien', predicate: null })).toThrow(/ruleKey/);
    expect(() => parseRuleInput({ ...base, criterionKey: '', predicate: null })).toThrow(/criterionKey/);
  });

  it('thiếu predicate = luật bằng lời', () => {
    expect(parseRuleInput(base).predicate).toBeNull();
  });
});

describe('parseRuleChanges', () => {
  it('chỉ trả trường được gửi, không nhận ruleKey', () => {
    expect(parseRuleChanges({ name: 'Tên mới', ruleKey: 'khac' })).toEqual({ name: 'Tên mới' });
    expect(parseRuleChanges({ predicate: null })).toEqual({ predicate: null });
  });
});

describe('parseDeduction', () => {
  it('null hoặc chuỗi tối đa hai chữ số lẻ; không nhận number', () => {
    expect(parseDeduction(null)).toBeNull();
    expect(parseDeduction('1.5')).toBe('1.5');
    expect(() => parseDeduction(1.5)).toThrow(/mức trừ/);
    expect(() => parseDeduction('7.555')).toThrow(/mức trừ/);
    expect(() => parseDeduction('-1')).toThrow(/mức trừ/);
  });
});

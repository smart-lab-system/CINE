import { parseAssignInput, parseDeduction, parseNewRule, parseRuleChanges } from './rule-input';

const NEW = { name: 'Sai ca biên', description: 'd', predicate: null };

describe('parseNewRule', () => {
  it.each([
    [null],
    [{ kind: 'test_group_failed', group: 'bien' }],
    [{ kind: 'calls_function', name: 'sort' }],
    [{ kind: 'complexity_exceeds_required' }],
    [{ kind: 'no_recursion' }],
    [{ kind: 'no_recursion', functionName: 'dfs' }],
  ])('nhận mẫu %j', (predicate) => {
    expect(parseNewRule({ name: 'Sai biên', description: 'd', predicate }).predicate).toEqual(predicate);
  });

  it.each([
    [{ kind: 'eval_code', src: 'x' }],
    [{ kind: 'test_group_failed' }],
    [{ kind: 'complexity_exceeds_required', x: 1 }],
    [{ kind: 'calls_function', name: 'a b' }],
    ['test_group_failed'],
  ])('từ chối mẫu %j', (predicate) => {
    expect(() => parseNewRule({ name: 'x', description: 'x', predicate })).toThrow(/điều kiện/);
    let message = '';
    try {
      parseNewRule({ name: 'x', description: 'x', predicate });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).not.toMatch(/§/);
  });

  it('thiếu predicate = luật bằng lời', () => {
    expect(parseNewRule({ name: 'Sai biên', description: 'd' }).predicate).toBeNull();
  });
});

describe('parseAssignInput', () => {
  it('đúng một trong ruleId hoặc newRule', () => {
    expect(() => parseAssignInput({ rubricName: 'R', criterionKey: 'a' })).toThrow(/đúng một/);
    expect(() =>
      parseAssignInput({
        rubricName: 'R',
        criterionKey: 'a',
        ruleId: '00000000-0000-4000-8000-000000000000',
        newRule: NEW,
      }),
    ).toThrow(/đúng một/);
  });
  it('newRule + deduction chuỗi; ruleKey tường minh phải đúng khuôn', () => {
    expect(parseAssignInput({ rubricName: 'R', criterionKey: 'a', deduction: '1.50', newRule: NEW }).deduction).toBe(
      '1.50',
    );
    expect(() =>
      parseAssignInput({ rubricName: 'R', criterionKey: 'a', newRule: { ...NEW, ruleKey: 'Co Dau' } }),
    ).toThrow(/ruleKey/);
    expect(() => parseAssignInput({ rubricName: 'R', criterionKey: 'a', deduction: 1.5, newRule: NEW })).toThrow(
      /mức trừ/,
    );
  });
  it('changes chỉ đi cùng ruleId', () => {
    expect(() =>
      parseAssignInput({ rubricName: 'R', criterionKey: 'a', newRule: NEW, changes: { name: 'x' } }),
    ).toThrow(/changes/);
    expect(
      parseAssignInput({
        rubricName: 'R',
        criterionKey: 'a',
        ruleId: '00000000-0000-4000-8000-000000000000',
        changes: { name: 'x' },
      }).changes,
    ).toEqual({ name: 'x' });
  });
  it('parseNewRule không nhận criterionKey (tiêu chí thuộc dòng áp dụng)', () => {
    expect(parseNewRule({ ...NEW, criterionKey: 'a' })).toEqual({
      name: 'Sai ca biên',
      description: 'd',
      predicate: null,
    });
  });
});

describe('parseRuleChanges', () => {
  it('chỉ trả trường được gửi, không nhận ruleKey hay criterionKey', () => {
    expect(parseRuleChanges({ name: 'Tên mới', ruleKey: 'khac', criterionKey: 'a' })).toEqual({ name: 'Tên mới' });
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

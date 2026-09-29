import { describe, expect, it } from 'vitest';
import {
  EMPTY_FORM,
  TEMPLATE_META,
  buildRuleChanges,
  buildRuleInput,
  formFromRule,
  planSave,
  predicateFromForm,
  previewInputOf,
  samePrice,
  saveLabelOf,
  tierOf,
  validateRuleForm,
  type RuleFormState,
} from './rule-form';
import { rule } from '@/app/teacher/rules/_components/fixtures';
import type { RulePredicate } from './api/rules';

const valid = (over: Partial<RuleFormState> = {}): RuleFormState => ({
  ...EMPTY_FORM,
  name: 'Tên biến không nói lên vai trò',
  description: 'Biến đặt tên a, b, t',
  criterionKey: 'trinh_bay',
  mode: 'words',
  ...over,
});

describe('predicateFromForm', () => {
  it('mô tả bằng lời → null (không có điều kiện)', () => {
    expect(predicateFromForm(valid({ mode: 'words', param: 'bỏ qua' }))).toBeNull();
  });
  it('nhóm test trượt → test_group_failed, cắt khoảng trắng', () => {
    expect(predicateFromForm(valid({ mode: 'machine', template: 'tests', param: ' bien ' }))).toEqual({
      kind: 'test_group_failed',
      group: 'bien',
    });
  });
  it('mã gọi một hàm → calls_function', () => {
    expect(predicateFromForm(valid({ mode: 'machine', template: 'call', param: 'sort' }))).toEqual({
      kind: 'calls_function',
      name: 'sort',
    });
  });
  it('độ phức tạp → không kèm trường nào khác (server 400 nếu có trường lạ)', () => {
    expect(predicateFromForm(valid({ mode: 'machine', template: 'complexity', param: 'rác' }))).toEqual({
      kind: 'complexity_exceeds_required',
    });
  });
  it('không dùng đệ quy: tên hàm là tuỳ chọn, để trống thì KHÔNG gửi functionName', () => {
    expect(predicateFromForm(valid({ mode: 'machine', template: 'recursion', param: '' }))).toEqual({ kind: 'no_recursion' });
    expect(predicateFromForm(valid({ mode: 'machine', template: 'recursion', param: 'quick' }))).toEqual({
      kind: 'no_recursion',
      functionName: 'quick',
    });
  });
});

describe('tierOf / TEMPLATE_META (spec §3.2: chỉ mẫu nhóm test trượt máy đo được)', () => {
  it('bậc theo mẫu', () => {
    expect(tierOf(valid({ mode: 'words' }))).toBe(4);
    expect(tierOf(valid({ mode: 'machine', template: 'tests' }))).toBe(2);
    expect(tierOf(valid({ mode: 'machine', template: 'call' }))).toBe(3);
    expect(tierOf(valid({ mode: 'machine', template: 'complexity' }))).toBe(3);
    expect(tierOf(valid({ mode: 'machine', template: 'recursion' }))).toBe(3);
  });
  it('đúng một mẫu đo được', () => {
    const measurable = Object.entries(TEMPLATE_META).filter(([, m]) => m.measurable).map(([k]) => k);
    expect(measurable).toEqual(['tests']);
  });
});

describe('formFromRule', () => {
  it('luật bằng lời → mode words', () => {
    const f = formFromRule(rule({ checkedBy: 'model', revision: { predicate: null } }));
    expect(f.mode).toBe('words');
  });
  it.each<RulePredicate>([
    { kind: 'test_group_failed', group: 'bien' },
    { kind: 'calls_function', name: 'sort' },
    { kind: 'complexity_exceeds_required' },
    { kind: 'no_recursion', functionName: 'quick' },
    { kind: 'no_recursion' },
  ])('vòng khứ hồi giữ nguyên điều kiện %j', (predicate) => {
    const f = formFromRule(rule({ revision: { predicate } }));
    expect(f.mode).toBe('machine');
    expect(predicateFromForm(f)).toEqual(predicate);
  });
  it('sao chép tên, mô tả, tiêu chí; giá "1.50" hiện "1,5", chưa giá hiện rỗng', () => {
    const f = formFromRule(rule({ deduction: '1.50', revision: { name: 'N', description: 'D', criterionKey: 'k' } }));
    expect(f).toMatchObject({ name: 'N', description: 'D', criterionKey: 'k', price: '1,5' });
    expect(formFromRule(rule({ deduction: null })).price).toBe('');
  });
});

describe('validateRuleForm (khớp các luật của server, rule-input.ts)', () => {
  it('form hợp lệ → không lỗi', () => {
    expect(validateRuleForm(valid())).toEqual({});
  });
  it('tên trống hoặc quá 200 ký tự', () => {
    expect(validateRuleForm(valid({ name: '   ' })).name).toBeTruthy();
    expect(validateRuleForm(valid({ name: 'a'.repeat(201) })).name).toBeTruthy();
    expect(validateRuleForm(valid({ name: 'a'.repeat(200) })).name).toBeUndefined();
  });
  it('mô tả trống hoặc quá 2000 ký tự', () => {
    expect(validateRuleForm(valid({ description: '' })).description).toBeTruthy();
    expect(validateRuleForm(valid({ description: 'a'.repeat(2001) })).description).toBeTruthy();
  });
  it('phải chọn tiêu chí', () => {
    expect(validateRuleForm(valid({ criterionKey: '' })).criterionKey).toBe('Chọn tiêu chí mà lỗi này thuộc về.');
  });
  it('nhóm test là bắt buộc khi chọn mẫu nhóm test trượt', () => {
    expect(validateRuleForm(valid({ mode: 'machine', template: 'tests', param: ' ' })).param).toBeTruthy();
    expect(validateRuleForm(valid({ mode: 'machine', template: 'tests', param: 'bien' })).param).toBeUndefined();
  });
  it('tên nhóm test tối đa 100 ký tự', () => {
    expect(validateRuleForm(valid({ mode: 'machine', template: 'tests', param: 'a'.repeat(101) })).param).toBeTruthy();
    expect(validateRuleForm(valid({ mode: 'machine', template: 'tests', param: 'a'.repeat(100) })).param).toBeUndefined();
  });
  it('tên hàm phải là định danh hợp lệ', () => {
    for (const bad of ['1abc', 'sort()', 'a-b', '']) {
      expect(validateRuleForm(valid({ mode: 'machine', template: 'call', param: bad })).param).toBeTruthy();
    }
    expect(validateRuleForm(valid({ mode: 'machine', template: 'call', param: 'sort_2' })).param).toBeUndefined();
  });
  it('đệ quy: tên hàm tuỳ chọn nhưng nếu có thì phải hợp lệ', () => {
    expect(validateRuleForm(valid({ mode: 'machine', template: 'recursion', param: '' })).param).toBeUndefined();
    expect(validateRuleForm(valid({ mode: 'machine', template: 'recursion', param: '9x' })).param).toBeTruthy();
  });
  it('chế độ bằng lời bỏ qua tham số của mẫu', () => {
    expect(validateRuleForm(valid({ mode: 'words', template: 'tests', param: '' })).param).toBeUndefined();
  });
  it('giá: để trống được, gõ bậy thì báo', () => {
    expect(validateRuleForm(valid({ price: '' })).price).toBeUndefined();
    expect(validateRuleForm(valid({ price: '0,5' })).price).toBeUndefined();
    expect(validateRuleForm(valid({ price: 'abc' })).price).toBe('Mức trừ: số không âm, tối đa hai chữ số lẻ.');
  });
});

describe('buildRuleInput / buildRuleChanges', () => {
  it('tạo mới: khoá sinh từ tên, mọi trường đã cắt khoảng trắng, kèm điều kiện', () => {
    expect(
      buildRuleInput(valid({ name: '  Sập ở mảng rỗng ', description: ' d ', mode: 'machine', template: 'tests', param: 'empty' })),
    ).toEqual({
      ruleKey: 'sap_o_mang_rong',
      name: 'Sập ở mảng rỗng',
      description: 'd',
      criterionKey: 'trinh_bay',
      predicate: { kind: 'test_group_failed', group: 'empty' },
    });
  });
  it('luật bằng lời gửi predicate null tường minh (chuyển máy kiểm → bằng lời phải xoá điều kiện)', () => {
    expect(buildRuleInput(valid()).predicate).toBeNull();
    expect(buildRuleChanges(valid())).toHaveProperty('predicate', null);
  });
  it('sửa luật KHÔNG gửi ruleKey (khoá không đổi được)', () => {
    expect(buildRuleChanges(valid())).not.toHaveProperty('ruleKey');
  });
});

describe('saveLabelOf (nút lưu nói đúng hệ quả — spec §3.2)', () => {
  it('bậc 2 có số bài khớp → "Lưu và áp cho N bài"', () => {
    expect(saveLabelOf(2, 3)).toBe('Lưu và áp cho 3 bài');
  });
  it('bậc 2 chưa biết số bài', () => {
    expect(saveLabelOf(2, undefined)).toBe('Lưu và áp cho các bài khớp');
  });
  it('bậc 3 (bản này) và bậc 4: áp từ phiên chưa chấm', () => {
    expect(saveLabelOf(3, undefined)).toBe('Lưu luật — áp từ phiên chưa chấm');
    expect(saveLabelOf(4, undefined)).toBe('Lưu luật — áp từ phiên chưa chấm');
  });
});

describe('samePrice', () => {
  it('so số, không so chuỗi', () => {
    expect(samePrice('1.50', '1.5')).toBe(true);
    expect(samePrice(null, null)).toBe(true);
    expect(samePrice(null, '0')).toBe(false);
    expect(samePrice('1.5', null)).toBe(false);
    expect(samePrice('1.5', '2')).toBe(false);
  });
});

describe('previewInputOf (POST /rules/preview needs the FULL rule, valid, before it will answer)', () => {
  it('a valid new rule → ruleKey from the name, no ruleId, the typed price as a decimal string', () => {
    expect(
      previewInputOf(valid({ name: 'Sập ở mảng rỗng', mode: 'machine', template: 'tests', param: 'empty', price: '1,5' }), undefined),
    ).toEqual({
      ruleKey: 'sap_o_mang_rong',
      name: 'Sập ở mảng rỗng',
      description: 'Biến đặt tên a, b, t',
      criterionKey: 'trinh_bay',
      predicate: { kind: 'test_group_failed', group: 'empty' },
      deduction: '1.5',
    });
  });
  it('an existing rule keeps ITS ruleKey and sends ruleId so the draft replaces it instead of duplicating it', () => {
    const input = previewInputOf(valid({ name: 'Tên mới hoàn toàn' }), { id: 'r-9', ruleKey: 'sai_bien' });
    expect(input).toMatchObject({ ruleKey: 'sai_bien', ruleId: 'r-9', name: 'Tên mới hoàn toàn' });
  });
  it('a blank price is an explicit null (unpriced), not omitted', () => {
    expect(previewInputOf(valid({ price: '' }), undefined)).toHaveProperty('deduction', null);
  });
  it('null while the form is not valid enough to answer — never ask the server a question it must reject', () => {
    expect(previewInputOf(valid({ name: '' }), undefined)).toBeNull();
    expect(previewInputOf(valid({ criterionKey: '' }), undefined)).toBeNull();
    expect(previewInputOf(valid({ mode: 'machine', template: 'tests', param: '' }), undefined)).toBeNull();
    expect(previewInputOf(valid({ price: 'abc' }), undefined)).toBeNull();
  });
});

describe('planSave (what is STILL left to write — drives the Lưu button and safe retries)', () => {
  const active = rule({
    id: 'r1', deduction: '1.50',
    revision: { name: 'Sai ca biên', description: 'Nhóm biên không đạt', criterionKey: 'tinh_dung', predicate: { kind: 'test_group_failed', group: 'bien' } },
  });
  const proposed = rule({
    id: 'p1', state: 'proposed', deduction: null, checkedBy: 'model',
    revision: { name: 'x', description: 'Trả về mảng mới', criterionKey: 'chua_gan', predicate: null },
  });

  it('a brand-new rule: create; the price only when typed', () => {
    expect(planSave(valid(), undefined, {})).toEqual({ write: 'create', activate: false, price: null });
    expect(planSave(valid({ price: '1,5' }), undefined, {})).toEqual({ write: 'create', activate: false, price: { value: '1.5' } });
  });

  it('an existing rule left untouched has nothing to write', () => {
    expect(planSave(formFromRule(active), active, {})).toEqual({ write: null, activate: false, price: null });
  });

  it('any rule field changed → a new revision', () => {
    expect(planSave({ ...formFromRule(active), description: 'khác' }, active, {}).write).toBe('revise');
    expect(planSave({ ...formFromRule(active), criterionKey: 'trinh_bay' }, active, {}).write).toBe('revise');
    expect(planSave({ ...formFromRule(active), param: 'khac' }, active, {}).write).toBe('revise');
  });

  it('whitespace around a field is not a change', () => {
    expect(planSave({ ...formFromRule(active), name: '  Sai ca biên  ' }, active, {}).write).toBeNull();
  });

  it('a price-only change writes the price and nothing else', () => {
    expect(planSave({ ...formFromRule(active), price: '2' }, active, {})).toEqual({ write: null, activate: false, price: { value: '2' } });
  });

  it('the same price spelled differently is not a change; clearing it IS (explicit null)', () => {
    expect(planSave({ ...formFromRule(active), price: '1,50' }, active, {}).price).toBeNull();
    expect(planSave({ ...formFromRule(active), price: '' }, active, {}).price).toEqual({ value: null });
  });

  it('an unparseable price writes no price (validation blocks the save before this matters)', () => {
    expect(planSave({ ...formFromRule(active), price: 'abc' }, active, {}).price).toBeNull();
  });

  it('promoting an agent-reported rule: always revise + activate, price only when typed', () => {
    const form = { ...formFromRule(proposed), criterionKey: 'tinh_dung' };
    expect(planSave(form, proposed, {})).toEqual({ write: 'revise', activate: true, price: null });
    expect(planSave({ ...form, price: '1' }, proposed, {}).price).toEqual({ value: '1' });
  });

  describe('resuming after a step already succeeded', () => {
    it('created but the price failed → no second create, just the price', () => {
      const form = valid({ price: '1' });
      const key = JSON.stringify(buildRuleChanges(form));
      expect(planSave(form, undefined, { ruleId: 'new-1', writtenKey: key })).toEqual({ write: null, activate: false, price: { value: '1' } });
    });

    it('created, then the description was edited → a revision of the CREATED rule, not another create', () => {
      const before = valid();
      const progress = { ruleId: 'new-1', writtenKey: JSON.stringify(buildRuleChanges(before)) };
      expect(planSave({ ...before, description: 'sửa sau khi tạo' }, undefined, progress).write).toBe('revise');
    });

    it('revised + activated, only the price left', () => {
      const form = { ...formFromRule(proposed), criterionKey: 'tinh_dung', price: '1' };
      const progress = { writtenKey: JSON.stringify(buildRuleChanges(form)), activated: true };
      expect(planSave(form, proposed, progress)).toEqual({ write: null, activate: false, price: { value: '1' } });
    });

    it('a price already written is the new baseline', () => {
      expect(planSave({ ...formFromRule(active), price: '2' }, active, { price: '2' }).price).toBeNull();
      expect(planSave({ ...formFromRule(active), price: '3' }, active, { price: '2' }).price).toEqual({ value: '3' });
    });

    it('everything written → nothing left', () => {
      const form = valid({ price: '1' });
      const progress = { ruleId: 'new-1', writtenKey: JSON.stringify(buildRuleChanges(form)), price: '1' };
      expect(planSave(form, undefined, progress)).toEqual({ write: null, activate: false, price: null });
    });
  });
});

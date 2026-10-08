import { describe, expect, it } from 'vitest';
import { libraryRule } from '@/app/teacher/rules/_components/fixtures';
import {
  EMPTY_ERROR_FORM,
  buildChanges,
  buildNewRule,
  detectionOf,
  formFromRule,
  isDirty,
  predicateOf,
  validateErrorForm,
} from './error-form';

const legacy = libraryRule({
  revision: { id: 'v1', revision: 1, name: 'Gọi sort', description: 'Dùng sort có sẵn', predicate: { kind: 'calls_function', name: 'sort' } },
  checkedBy: 'model',
});
const ai = libraryRule({ revision: { id: 'v1', revision: 1, name: 'Đặt tên', description: 'Tên biến khó hiểu', predicate: null }, checkedBy: 'model' });

describe('detectionOf (D9)', () => {
  it('nhóm test → Tự động, mang tên nhóm', () => {
    expect(detectionOf({ kind: 'test_group_failed', group: 'bien' })).toEqual({ detection: 'auto', group: 'bien', legacyNote: null });
  });
  it('không có điều kiện → AI đọc bài, không ghi chú', () => {
    expect(detectionOf(null)).toEqual({ detection: 'ai', group: '', legacyNote: null });
  });
  it('ba mẫu cũ → AI đọc bài kèm một dòng ghi chú điều kiện', () => {
    expect(detectionOf({ kind: 'calls_function', name: 'sort' })).toMatchObject({ detection: 'ai', legacyNote: 'gọi hàm “sort”' });
    expect(detectionOf({ kind: 'complexity_exceeds_required' })).toMatchObject({ detection: 'ai', legacyNote: 'độ phức tạp vượt yêu cầu của đề' });
    expect(detectionOf({ kind: 'no_recursion' }).legacyNote).toBe('không dùng đệ quy');
    expect(detectionOf({ kind: 'no_recursion', functionName: 'dfs' }).legacyNote).toBe('không dùng đệ quy trong hàm “dfs”');
  });
});

describe('validateErrorForm', () => {
  const ok = { ...EMPTY_ERROR_FORM, name: 'Sai ca biên', description: 'Mô tả' };
  it('hợp lệ', () => {
    expect(validateErrorForm(ok)).toEqual({});
    expect(validateErrorForm({ ...ok, detection: 'auto', group: 'bien' })).toEqual({});
  });
  it('tên và mô tả bắt buộc, có trần độ dài', () => {
    expect(validateErrorForm(EMPTY_ERROR_FORM)).toEqual({
      name: 'Đặt tên cho lỗi này.',
      description: 'Mô tả lỗi để giảng viên khác và AI hiểu cùng một nghĩa.',
    });
    expect(validateErrorForm({ ...ok, name: 'x'.repeat(201) }).name).toBe('Tên tối đa 200 ký tự.');
    expect(validateErrorForm({ ...ok, description: 'x'.repeat(2001) }).description).toBe('Mô tả tối đa 2000 ký tự.');
  });
  it('Tự động đòi tên nhóm test; AI đọc bài thì bỏ qua ô nhóm', () => {
    expect(validateErrorForm({ ...ok, detection: 'auto', group: '  ' }).group).toBe('Nhập tên nhóm test.');
    expect(validateErrorForm({ ...ok, detection: 'auto', group: 'g'.repeat(101) }).group).toBe('Tên nhóm tối đa 100 ký tự.');
    expect(validateErrorForm({ ...ok, detection: 'ai', group: '' })).toEqual({});
  });
});

describe('predicateOf / buildNewRule', () => {
  it('Tự động → test_group_failed; AI đọc bài → null; tên và mô tả được cắt khoảng trắng', () => {
    expect(predicateOf({ ...EMPTY_ERROR_FORM, detection: 'auto', group: ' bien ' })).toEqual({ kind: 'test_group_failed', group: 'bien' });
    expect(predicateOf({ ...EMPTY_ERROR_FORM, detection: 'ai', group: 'bien' })).toBeNull();
    expect(buildNewRule({ name: ' Sai ca biên ', description: ' mô tả ', detection: 'auto', group: 'bien' })).toEqual({
      name: 'Sai ca biên',
      description: 'mô tả',
      predicate: { kind: 'test_group_failed', group: 'bien' },
    });
  });
});

describe('buildChanges — chỉ gửi điều ĐÃ ĐỔI (Review Focus 6)', () => {
  it('không đổi gì → rỗng, không bẩn', () => {
    const form = formFromRule(ai);
    expect(buildChanges(ai, form)).toEqual({});
    expect(isDirty(ai, form)).toBe(false);
  });
  it('đổi tên → chỉ name', () => {
    expect(buildChanges(ai, { ...formFromRule(ai), name: 'Tên mới ' })).toEqual({ name: 'Tên mới' });
  });
  it('lỗi cũ có điều kiện "gọi hàm": chỉ đổi tên thì KHÔNG gửi predicate (giữ nguyên điều kiện)', () => {
    const form = { ...formFromRule(legacy), name: 'Gọi sort có sẵn' };
    expect(buildChanges(legacy, form)).toEqual({ name: 'Gọi sort có sẵn' });
  });
  it('lỗi cũ: chọn Tự động rồi chọn lại AI đọc bài thì vẫn là "không đổi điều kiện"', () => {
    const back = { ...formFromRule(legacy), detection: 'ai' as const, group: 'bien' };
    expect(buildChanges(legacy, back)).toEqual({});
  });
  it('AI → Tự động thay điều kiện bằng test_group_failed; Tự động → AI xoá điều kiện (null)', () => {
    expect(buildChanges(ai, { ...formFromRule(ai), detection: 'auto', group: 'bien' })).toEqual({ predicate: { kind: 'test_group_failed', group: 'bien' } });
    const auto = libraryRule();
    expect(buildChanges(auto, { ...formFromRule(auto), detection: 'ai' })).toEqual({ predicate: null });
  });
  it('đổi nhóm test của lỗi Tự động', () => {
    const auto = libraryRule();
    expect(buildChanges(auto, { ...formFromRule(auto), group: 'co_ban' })).toEqual({ predicate: { kind: 'test_group_failed', group: 'co_ban' } });
    expect(isDirty(auto, { ...formFromRule(auto), group: 'co_ban' })).toBe(true);
  });
});

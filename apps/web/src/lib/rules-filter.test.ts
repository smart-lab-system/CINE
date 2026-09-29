import { describe, expect, it } from 'vitest';
import { countByFilter, filterRules } from './rules-filter';
import { rule } from '@/app/teacher/rules/_components/fixtures';

const machinePriced = rule({ id: 'a', ruleKey: 'sai_bien' });
const machineUnpriced = rule({ id: 'b', ruleKey: 'chua_gia', deduction: null });
const words = rule({
  id: 'c',
  ruleKey: 'ten_bien',
  checkedBy: 'model',
  revision: { name: 'Tên biến không nói lên vai trò', criterionKey: 'trinh_bay', predicate: null },
});
const unmeasured = rule({
  id: 'd',
  ruleKey: 'goi_ham_sort',
  checkedBy: 'model',
  revision: { name: 'Gọi hàm sắp xếp có sẵn', criterionKey: 'cai_dat', predicate: { kind: 'calls_function', name: 'sort' } },
});
const all = [machinePriced, machineUnpriced, words, unmeasured];

const ids = (rules: { id: string }[]) => rules.map((r) => r.id);

describe('filterRules (spec §3.1)', () => {
  it('"all" giữ mọi luật, kể cả luật máy chưa đo được', () => {
    expect(ids(filterRules(all, 'all', ''))).toEqual(['a', 'b', 'c', 'd']);
  });

  it('"unpriced" chỉ luật chưa có giá', () => {
    expect(ids(filterRules(all, 'unpriced', ''))).toEqual(['b']);
  });

  it('"machine" lọc theo checkedBy=machine — KHÔNG theo việc luật có predicate', () => {
    expect(ids(filterRules(all, 'machine', ''))).toEqual(['a', 'b']);
  });

  it('"words" chỉ luật không có predicate; luật máy chưa đo được CHỈ hiện ở "all"', () => {
    expect(ids(filterRules(all, 'words', ''))).toEqual(['c']);
    expect(ids(filterRules(all, 'machine', ''))).not.toContain('d');
    expect(ids(filterRules(all, 'unpriced', ''))).not.toContain('d');
  });

  it('tìm không phân biệt hoa/thường và không phân biệt dấu', () => {
    expect(ids(filterRules(all, 'all', 'TEN BIEN'))).toEqual(['c']);
    expect(ids(filterRules(all, 'all', 'tên biến'))).toEqual(['c']);
  });

  it('tìm theo khoá luật và theo khoá tiêu chí', () => {
    expect(ids(filterRules(all, 'all', 'goi_ham'))).toEqual(['d']);
    expect(ids(filterRules(all, 'all', 'trinh_bay'))).toEqual(['c']);
  });

  it('bộ lọc và ô tìm kết hợp (AND)', () => {
    expect(ids(filterRules(all, 'machine', 'chua_gia'))).toEqual(['b']);
    expect(ids(filterRules(all, 'words', 'chua_gia'))).toEqual([]);
  });

  it('ô tìm chỉ toàn khoảng trắng = không lọc', () => {
    expect(filterRules(all, 'all', '   ')).toHaveLength(4);
  });
});

describe('countByFilter', () => {
  it('đếm theo từng bộ lọc, bỏ qua ô tìm', () => {
    expect(countByFilter(all)).toEqual({ all: 4, unpriced: 1, machine: 2, words: 1 });
  });
  it('danh sách rỗng → toàn 0', () => {
    expect(countByFilter([])).toEqual({ all: 0, unpriced: 0, machine: 0, words: 0 });
  });
});

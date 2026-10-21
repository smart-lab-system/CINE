import { describe, expect, it } from 'vitest';
import { predicateText } from './predicate-text';

describe('predicateText (spec §5.8, mục 1)', () => {
  it('test_group_failed nêu đích danh nhóm', () => {
    expect(predicateText({ kind: 'test_group_failed', group: 'bien' })).toBe('Có ca kiểm thử thuộc nhóm “bien” không đạt');
  });

  it('calls_function nêu tên hàm', () => {
    expect(predicateText({ kind: 'calls_function', name: 'f' })).toBe('Bài gọi hàm “f”');
  });

  it('complexity_exceeds_required không cần tham số', () => {
    expect(predicateText({ kind: 'complexity_exceeds_required' })).toBe('Độ phức tạp đo được vượt mức đề yêu cầu');
  });

  it('no_recursion có và không có tên hàm', () => {
    expect(predicateText({ kind: 'no_recursion', functionName: 'fib' })).toBe('Bài không dùng đệ quy trong hàm “fib”');
    expect(predicateText({ kind: 'no_recursion' })).toBe('Bài không dùng đệ quy');
  });

  it('null là luật bằng lời, không có phép đo cụ thể', () => {
    expect(predicateText(null)).toBe('Quy tắc mô tả bằng lời; hệ thống đọc bài để xét, không có phép đo cụ thể');
  });
});

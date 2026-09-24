import { CheckerUnavailableError, compareOutput } from './comparators';

describe('compareOutput', () => {
  it('exact: bỏ qua CRLF và khoảng trắng cuối dòng, không bỏ qua thứ tự', () => {
    expect(compareOutput('1 2 3\n', '1 2 3 \r\n', { kind: 'exact' }).equal).toBe(true);
    const r = compareOutput('1 2 3\n4\n', '1 2 3\n5\n', { kind: 'exact' });
    expect(r.equal).toBe(false);
    expect(r.diff).toMatch(/dòng 2/);
  });

  it('exact: thiếu dòng cũng là lệch', () => {
    expect(compareOutput('a\nb\n', 'a\n', { kind: 'exact' }).equal).toBe(false);
  });

  it('unordered_lines: cùng tập dòng, khác thứ tự → bằng', () => {
    expect(compareOutput('a\nb\nc\n', 'c\na\nb\n', { kind: 'unordered_lines' }).equal).toBe(true);
    expect(compareOutput('a\nb\n', 'a\na\n', { kind: 'unordered_lines' }).equal).toBe(false);
  });

  it('float_tolerance: số lệch trong eps → bằng; chữ phải khớp đúng', () => {
    const c = { kind: 'float_tolerance' as const, eps: 1e-6 };
    expect(compareOutput('0.333333\n', '0.3333333\n', c).equal).toBe(true);
    expect(compareOutput('0.3\n', '0.31\n', c).equal).toBe(false);
    expect(compareOutput('YES 1.0\n', 'NO 1.0\n', c).equal).toBe(false);
  });

  it('checker → CheckerUnavailableError, để worker trả unavailable (Review Focus 2)', () => {
    expect(() => compareOutput('', '', { kind: 'checker', name: 'duong_di' })).toThrow(CheckerUnavailableError);
  });
});

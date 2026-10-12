import { describe, expect, it } from 'vitest';
import { deductionLabel, describeRecompute, formatDeductionString, parseDeductionInput } from './rules-vocab';

describe('formatDeductionString', () => {
  it('chuỗi thập phân → số kiểu Việt Nam, luôn mang dấu trừ', () => {
    expect(formatDeductionString('1.50')).toBe('−1,5');
    expect(formatDeductionString('0.25')).toBe('−0,25');
    expect(formatDeductionString('0.00')).toBe('0');
  });
  it('chưa có điểm trừ → "—"', () => {
    expect(formatDeductionString(null)).toBe('—');
  });
});

describe('deductionLabel', () => {
  it('dùng trong danh sách: số hoặc chữ "chưa có điểm trừ"', () => {
    expect(deductionLabel('2.00')).toBe('−2,0');
    expect(deductionLabel(null)).toBe('chưa có điểm trừ');
  });
});

describe('parseDeductionInput', () => {
  it('để trống = chưa có điểm trừ (null tường minh)', () => {
    expect(parseDeductionInput('')).toEqual({ ok: true, value: null });
    expect(parseDeductionInput('   ')).toEqual({ ok: true, value: null });
  });
  it('nhận dấu phẩy và trả CHUỖI (server từ chối số JSON)', () => {
    expect(parseDeductionInput('1,5')).toEqual({ ok: true, value: '1.5' });
    expect(parseDeductionInput('0')).toEqual({ ok: true, value: '0' });
    expect(parseDeductionInput('12.25')).toEqual({ ok: true, value: '12.25' });
  });
  it('từ chối chữ, số âm, quá hai chữ số lẻ, quá bốn chữ số nguyên', () => {
    for (const bad of ['abc', '-1', '1.234', '12345', '1,,5']) {
      expect(parseDeductionInput(bad)).toEqual({ ok: false, message: 'Điểm trừ: số không âm, tối đa hai chữ số lẻ.' });
    }
  });
});

describe('describeRecompute', () => {
  it('null = lỗi AI đọc bài không tính lại bài đã chấm (T-FAIR-1) — nói ra, không im lặng', () => {
    expect(describeRecompute(null)).toBe('Lỗi này không tính lại bài nào đã chấm — chỉ áp cho phiên chấm sau.');
  });
  it('không bài nào bị ảnh hưởng', () => {
    expect(describeRecompute({ recomputed: 0, promoted: 0, demoted: 0, belowFloor: 0 })).toBe('Không có bài nào bị ảnh hưởng.');
  });
  it('đọc kết quả bằng lời', () => {
    expect(describeRecompute({ recomputed: 9, promoted: 3, demoted: 1, belowFloor: 2 })).toBe(
      'Đã tính lại 9 bài: 3 bài đủ điều kiện tự quyết; 1 bài chuyển về "Cần bạn xem"; 2 bài chưa cho điểm được (dưới sàn).',
    );
    expect(describeRecompute({ recomputed: 4, promoted: 0, demoted: 0, belowFloor: 0 })).toBe('Đã tính lại 4 bài, không bài nào đổi nhóm.');
  });
});

import { describe, expect, it } from 'vitest';
import { parseStep } from './setup-steps';

describe('parseStep', () => {
  it('mở Đề & thư mục từ materials và từ folder', () => {
    expect(parseStep('materials')).toBe('materials');
    expect(parseStep('folder')).toBe('materials');
  });

  it('schedule và giá trị lạ về Thông tin chung', () => {
    expect(parseStep('schedule')).toBe('info');
    expect(parseStep(null)).toBe('info');
    expect(parseStep('nope')).toBe('info');
  });
});

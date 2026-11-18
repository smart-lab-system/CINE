import { describe, expect, it } from 'vitest';
import { parseStep, SETUP_STEPS } from './setup-steps';

describe('parseStep', () => {
  it('alias cũ materials/rubric về Đề thi & Rubric; folder là bước thật', () => {
    expect(parseStep('materials')).toBe('exam');
    expect(parseStep('rubric')).toBe('exam');
    expect(parseStep('folder')).toBe('folder');
    expect(parseStep('exam')).toBe('exam');
  });

  it('schedule và giá trị lạ về Thông tin chung', () => {
    expect(parseStep('schedule')).toBe('info');
    expect(parseStep(null)).toBe('info');
    expect(parseStep('nope')).toBe('info');
  });

  it('đủ 5 bước đúng nhãn', () => {
    expect(SETUP_STEPS.map((s) => s.label)).toEqual([
      'Thông tin chung',
      'Danh sách thí sinh',
      'Thư mục bài làm',
      'Đề thi & Rubric',
      'Xác nhận',
    ]);
  });
});

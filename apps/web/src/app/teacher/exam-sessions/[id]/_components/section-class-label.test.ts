import { describe, expect, it } from 'vitest';
import { formatSectionAndNominalClass } from './section-class-label';

describe('formatSectionAndNominalClass', () => {
  it('ghép mã lớp học phần và mã lớp danh nghĩa', () => {
    expect(
      formatSectionAndNominalClass('CTDL001', 'D21CQCN01 — Công nghệ thông tin'),
    ).toBe('CTDL001 - D21CQCN01');
  });

  it('lấy nguyên nhãn khi lớp danh nghĩa chỉ có mã', () => {
    expect(formatSectionAndNominalClass('CTDL001', 'D21CQCN01')).toBe('CTDL001 - D21CQCN01');
  });

  it('chỉ hiện mã học phần khi chưa gắn lớp danh nghĩa', () => {
    expect(formatSectionAndNominalClass('CTDL001', null)).toBe('CTDL001');
    expect(formatSectionAndNominalClass('CTDL001', '   ')).toBe('CTDL001');
  });

  it('trả null khi không có mã học phần', () => {
    expect(formatSectionAndNominalClass(null, 'D21CQCN01')).toBeNull();
    expect(formatSectionAndNominalClass('  ', null)).toBeNull();
  });
});

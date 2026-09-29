import { describe, expect, it } from 'vitest';
import { TEACHER_NAV } from './nav-config';

describe('TEACHER_NAV', () => {
  const labels = TEACHER_NAV.map((item) => item.label);

  it('có "Bảng lỗi" trỏ vào /teacher/rules, đứng ngay trước "Chấm điểm" (spec §1)', () => {
    const item = TEACHER_NAV.find((i) => i.label === 'Bảng lỗi');
    expect(item?.href).toBe('/teacher/rules');
    expect(labels.indexOf('Bảng lỗi')).toBe(labels.indexOf('Chấm điểm') - 1);
  });

  it('không còn "Trang kiến thức" (tên sai) hay "Rubric" (trang đã bị thay)', () => {
    expect(labels).not.toContain('Trang kiến thức');
    expect(labels).not.toContain('Rubric');
  });

  it('không mục nào trỏ vào trang không tồn tại /teacher/rubrics', () => {
    expect(TEACHER_NAV.map((i) => i.href)).not.toContain('/teacher/rubrics');
  });
});

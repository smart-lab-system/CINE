import { describe, expect, it } from 'vitest';
import { TEACHER_NAV } from './nav-config';

describe('TEACHER_NAV', () => {
  const labels = TEACHER_NAV.map((item) => item.label);

  it('có "Rubric" trỏ vào /teacher/rules, đứng ngay trước "Chấm điểm" (spec §1)', () => {
    const item = TEACHER_NAV.find((i) => i.label === 'Rubric');
    expect(item?.href).toBe('/teacher/rules');
    expect(labels.indexOf('Rubric')).toBe(labels.indexOf('Chấm điểm') - 1);
  });

  it('không còn "Trang kiến thức" (tên sai) hay "Bảng lỗi" (đã đổi tên nav)', () => {
    expect(labels).not.toContain('Trang kiến thức');
    expect(labels).not.toContain('Bảng lỗi');
  });

  it('không mục nào trỏ vào trang không tồn tại /teacher/rubrics', () => {
    expect(TEACHER_NAV.map((i) => i.href)).not.toContain('/teacher/rubrics');
  });
});

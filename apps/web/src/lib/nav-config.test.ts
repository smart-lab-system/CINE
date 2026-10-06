import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ADMIN_NAV, TEACHER_NAV } from './nav-config';

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

describe('ADMIN_NAV', () => {
  const labels = ADMIN_NAV.map((item) => item.label);

  it('có ba mục dữ liệu nền (Học kỳ, Phòng thi, Lớp) trỏ đúng trang', () => {
    expect(ADMIN_NAV.find((i) => i.label === 'Học kỳ')?.href).toBe('/admin/semesters');
    expect(ADMIN_NAV.find((i) => i.label === 'Phòng thi')?.href).toBe('/admin/rooms');
    expect(ADMIN_NAV.find((i) => i.label === 'Lớp')?.href).toBe('/admin/classes');
  });

  it('dữ liệu nền đứng ngay sau "Quản lý tài khoản" và trước cấu hình (nhóm "việc của admin" đi liền nhau)', () => {
    expect(labels.indexOf('Học kỳ')).toBe(labels.indexOf('Quản lý tài khoản') + 1);
    expect(labels.indexOf('Học kỳ')).toBeLessThan(labels.indexOf('Cấu hình AI'));
  });

  it('không có "Danh mục lớp danh nghĩa" làm mục menu: nó là hộp thoại trong trang Lớp (giảng viên và màn khác không bao giờ thấy "hai thứ")', () => {
    expect(labels.join('|')).not.toMatch(/danh nghĩa/i);
  });
});

/**
 * "Never a missing/dead nav entry" (chú thích đầu nav-config.ts) thành một bài test: ba trang dữ liệu nền từng bị xoá mà ba mục menu của
 * chúng ở lại (21/09), nên admin bấm vào là ra 404. Nhóm này ghim điều ngược lại cho MỌI mục của cả hai menu (Review Focus 7).
 */
describe('mọi mục menu đều có trang', () => {
  const APP_DIR = join(__dirname, '..', 'app');
  // Bộ ba [menu, nhãn, href] thay vì [menu, mục]: tiêu đề `it.each` đọc được ("ADMIN_NAV: Lớp → /admin/classes") thay vì "[object Object]".
  const cases: Array<[string, string, string]> = [
    ...ADMIN_NAV.map((item): [string, string, string] => ['ADMIN_NAV', item.label, item.href]),
    ...TEACHER_NAV.map((item): [string, string, string] => ['TEACHER_NAV', item.label, item.href]),
  ];

  it.each(cases)('%s: %s → %s', (_nav, label, href) => {
    const page = join(APP_DIR, ...href.split('/').filter(Boolean), 'page.tsx');
    expect(existsSync(page), `${label} → ${href} không có ${page}`).toBe(true);
  });
});

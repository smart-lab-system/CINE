import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ADMIN_NAV,
  TEACHER_NAV,
  flattenNavLeaves,
  isNavGroup,
} from './nav-config';

describe('TEACHER_NAV', () => {
  const labels = TEACHER_NAV.map((item) => item.label);
  const leaves = flattenNavLeaves(TEACHER_NAV);

  it('có nhóm Rubric accordion đứng ngay trước Chấm điểm', () => {
    const rubric = TEACHER_NAV.find((i) => i.label === 'Rubric');
    expect(rubric && isNavGroup(rubric)).toBe(true);
    expect(isNavGroup(rubric!) && rubric.children.map((c) => c.label)).toEqual([
      'Rubric chung',
      'Rubric theo câu hỏi',
      'Bảng lỗi',
    ]);
    expect(labels.indexOf('Rubric')).toBe(labels.indexOf('Chấm điểm') - 1);
  });

  it('Rubric children trỏ đúng đường dẫn', () => {
    const rubric = TEACHER_NAV.find((i) => i.label === 'Rubric');
    expect(isNavGroup(rubric!)).toBe(true);
    if (!isNavGroup(rubric!)) return;
    expect(rubric.children.find((c) => c.label === 'Rubric chung')?.href).toBe(
      '/teacher/rubrics/qa',
    );
    expect(rubric.children.find((c) => c.label === 'Rubric theo câu hỏi')?.href).toBe(
      '/teacher/rubrics',
    );
    expect(rubric.children.find((c) => c.label === 'Bảng lỗi')?.href).toBe('/teacher/rules');
  });

  it('không còn "Trang kiến thức" ở top-level', () => {
    expect(labels).not.toContain('Trang kiến thức');
  });

  it('mọi leaf teacher đều có trang thật', () => {
    for (const item of leaves) {
      const file = join(process.cwd(), 'src/app', item.href, 'page.tsx');
      expect(existsSync(file), item.href).toBe(true);
    }
  });
});

describe('ADMIN_NAV', () => {
  const leaves = flattenNavLeaves(ADMIN_NAV);
  const leafLabels = leaves.map((i) => i.label);
  const groups = ADMIN_NAV.filter(isNavGroup);

  it('hai nhóm accordion: Tổ chức học vụ + Cơ sở vật chất', () => {
    expect(groups.map((g) => g.label)).toEqual(['Tổ chức học vụ', 'Cơ sở vật chất']);
  });

  it('mục đơn top-level: Dashboard, Tiện ích IDE, Nhật ký thao tác', () => {
    const topSingles = ADMIN_NAV.filter((e) => !isNavGroup(e)).map((e) => e.label);
    expect(topSingles).toEqual(['Dashboard', 'Tiện ích IDE', 'Nhật ký thao tác']);
  });

  it('nhãn Giảng viên trỏ /admin/accounts; không còn "Quản lý tài khoản"', () => {
    expect(leafLabels).toContain('Giảng viên');
    expect(leafLabels).not.toContain('Quản lý tài khoản');
    expect(leaves.find((i) => i.label === 'Giảng viên')?.href).toBe('/admin/accounts');
  });

  it('Tổ chức học vụ gồm đúng chuỗi setup', () => {
    const hocVu = groups.find((g) => g.label === 'Tổ chức học vụ');
    expect(hocVu?.children.map((c) => c.label)).toEqual([
      'Giảng viên',
      'Sinh viên',
      'Năm học',
      'Môn học',
      'Lớp danh nghĩa',
      'Lớp học phần',
    ]);
  });

  it('Cơ sở vật chất: Phòng, Máy tính', () => {
    const csvc = groups.find((g) => g.label === 'Cơ sở vật chất');
    expect(csvc?.children.map((c) => c.label)).toEqual(['Phòng', 'Máy tính']);
  });

  // Quy tắc chung: không mục menu nào dẫn tới trang trống hay nhãn "cần backend".
  it('mọi leaf admin đều có trang thật, không dùng PlaceholderPage hay NeedsBackend', () => {
    for (const item of leaves) {
      const file = join(process.cwd(), 'src/app', item.href, 'page.tsx');
      expect(existsSync(file), item.href).toBe(true);
      const src = readFileSync(file, 'utf8');
      expect(src, item.href).not.toContain('PlaceholderPage');
      expect(src, item.href).not.toContain('NeedsBackend');
    }
  });
});

import { describe, expect, it } from 'vitest';
import { getRoleDisplay } from './account-roles';

describe('getRoleDisplay', () => {
  it('bốn role hợp lệ có nhãn tiếng Việt', () => {
    expect(getRoleDisplay('academic_affairs').label).toBe('Phòng Đào tạo');
    expect(getRoleDisplay('department_admin').label).toBe('Trưởng khoa');
    expect(getRoleDisplay('teacher').label).toBe('Giảng viên');
    expect(getRoleDisplay('admin').label).toBe('Quản trị');
  });

  it('role lạ KHÔNG được hiện như một vai trò hợp lệ', () => {
    // Đây là cơ chế thật khiến người dùng kết luận hệ thống có hai role riêng
    // biệt "Phòng Đào tạo" và "super_admin": một tab giữ bundle cũ, hoặc một
    // JWT phát trước migration rename, là đủ để badge in ra chuỗi enum thô
    // trong màu xám — nhìn y như một vai trò bình thường.
    const stale = getRoleDisplay('super_admin');
    expect(stale.label).not.toBe('super_admin');
    expect(stale.label).toMatch(/không xác định/i);
    // Vẫn phải in giá trị thô: đó là thứ duy nhất giúp chẩn đoán.
    expect(stale.label).toContain('super_admin');
    expect(stale.variant).toBe('destructive');
  });
});

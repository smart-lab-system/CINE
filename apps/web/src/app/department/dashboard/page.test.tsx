import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const counts = { semesters: 0, courses: 0, classes: 0 };

vi.mock('@/hooks/useDepartment', () => ({
  useSemesters: () => ({ data: new Array(counts.semesters).fill({}), isError: false }),
  useMyCourses: () => ({ data: new Array(counts.courses).fill({}), isError: false }),
  useMyClasses: () => ({ data: new Array(counts.classes).fill({}), isError: false }),
  useRooms: () => ({ data: [], isError: false }),
}));

const { default: DashboardPage } = await import('./page');

describe('dashboard Trưởng khoa', () => {
  beforeEach(() => {
    counts.semesters = 0;
    counts.courses = 0;
    counts.classes = 0;
  });

  it('khi chưa có học kỳ: KHÔNG có link, và nói đó là việc của Phòng Đào tạo', () => {
    render(<DashboardPage />);

    // /department/semesters đã bị xoá ở spec Học kỳ. Link tới nó là 404, và
    // "Tạo học kỳ ngay" là chỉ dẫn mà API trả 403 — Trưởng khoa không tạo được
    // học kỳ nữa. Một cái nút không làm được việc nó nói còn tệ hơn không nút.
    expect(screen.queryByRole('link', { name: /tạo học kỳ/i })).not.toBeInTheDocument();
    expect(document.body.textContent).toMatch(/Phòng Đào tạo/);
  });

  it('khi có học kỳ nhưng chưa có môn: vẫn có link tự tạo môn', () => {
    counts.semesters = 1;
    render(<DashboardPage />);

    // Trưởng khoa VẪN tự tạo được môn của khoa mình — Phòng Đào tạo chỉ thêm
    // một đường thứ hai để môn tới tay họ, không thay thế đường cũ.
    expect(screen.getByRole('link', { name: /tạo môn học/i })).toHaveAttribute(
      'href',
      '/department/courses',
    );
  });

  it('cả hai thẻ read-only đều nói rõ Phòng Đào tạo quản lý', () => {
    counts.semesters = 1;
    counts.courses = 1;
    counts.classes = 1;
    render(<DashboardPage />);

    // Hai thẻ: Học kỳ và Phòng thi. Trưởng khoa thấy con số nhưng không sửa
    // được cái nào — nói ra ở chỗ con số xuất hiện, chứ không để họ phát hiện
    // bằng cách đi tìm mục nav không tồn tại.
    // Khớp nguyên văn hint, không phải regex lỏng: mô tả ở đầu trang cũng nhắc
    // Phòng Đào tạo, và một assertion đếm được cả nó thì không còn nói về thẻ.
    expect(
      screen.getAllByText('Dùng chung toàn trường — Phòng Đào tạo quản lý'),
    ).toHaveLength(2);
  });
});

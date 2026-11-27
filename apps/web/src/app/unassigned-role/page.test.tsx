import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import UnassignedRolePage from './page';

vi.mock('@/components/layout/logout-button', () => ({ LogoutButton: () => null }));

describe('UnassignedRolePage', () => {
  it('đặt tiêu đề trang là h1, để trang có một tiêu đề đọc được cho công cụ hỗ trợ đọc màn hình', () => {
    render(<UnassignedRolePage />);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Tài khoản chưa được gán vai trò' }),
    ).toBeInTheDocument();
  });
});

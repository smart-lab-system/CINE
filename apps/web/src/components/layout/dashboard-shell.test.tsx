import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import {
  DashboardShell,
  SIDEBAR_HIDDEN_KEY,
} from '@/components/layout/dashboard-shell';

vi.mock('next/navigation', () => ({
  usePathname: () => '/accounts',
  useRouter: () => ({ push: vi.fn() }),
}));

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe('DashboardShell sidebar visibility', () => {
  it('shows the sidebar by default and can hide it', () => {
    render(
      <DashboardShell>
        <p>Nội dung trang</p>
      </DashboardShell>,
    );

    expect(
      screen.getByRole('navigation'),
    ).toBeInTheDocument();
    expect(screen.getByText('Lịch thi')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Kỳ thi' })).toHaveAttribute(
      'href',
      '/exam-events',
    );
    expect(screen.getByText('Nội dung trang')).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: /ẩn thanh điều hướng/i }),
    );

    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /hiện menu/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /đăng xuất/i })).toBeInTheDocument();
    expect(localStorage.getItem(SIDEBAR_HIDDEN_KEY)).toBe('1');
  });

  it('restores the sidebar after it has been hidden', () => {
    render(
      <DashboardShell>
        <p>Nội dung trang</p>
      </DashboardShell>,
    );

    fireEvent.click(
      screen.getByRole('button', { name: /ẩn thanh điều hướng/i }),
    );
    fireEvent.click(screen.getByRole('button', { name: /hiện menu/i }));

    expect(screen.getByRole('navigation')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /hiện menu/i }),
    ).not.toBeInTheDocument();
    expect(localStorage.getItem(SIDEBAR_HIDDEN_KEY)).toBe('0');
  });

  it('starts hidden when that preference was saved', () => {
    localStorage.setItem(SIDEBAR_HIDDEN_KEY, '1');

    render(
      <DashboardShell>
        <p>Nội dung trang</p>
      </DashboardShell>,
    );

    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /hiện menu/i }),
    ).toBeInTheDocument();
  });

  it('hides the sidebar when Escape is pressed', () => {
    render(
      <DashboardShell>
        <p>Nội dung trang</p>
      </DashboardShell>,
    );

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /hiện menu/i }),
    ).toBeInTheDocument();
  });
});

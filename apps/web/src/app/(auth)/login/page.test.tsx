import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import LoginPage from './page';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

function submit() {
  fireEvent.change(screen.getByLabelText(/email/i), {
    target: { value: 'someone@example.com' },
  });
  fireEvent.change(screen.getByLabelText(/mật khẩu/i), {
    target: { value: 'correct-horse-battery' },
  });
  fireEvent.click(screen.getByRole('button', { name: /đăng nhập/i }));
}

afterEach(() => {
  vi.restoreAllMocks();
  push.mockReset();
});

// Pins the fix for a real bug hit while following DEMO-RUNBOOK.md step 6:
// login used to send every role to /accounts, which is admin-only
// server-side (AccountsController's @Roles('admin')) — a teacher landed
// there anyway and saw a 403'd table sitting above a still-live "Tạo tài
// khoản mới" form with no explanation. Destinations updated for the
// role-scoped route rename (/admin/*, /teacher/*) — see the frontend
// rebuild design spec.
describe('LoginPage redirect', () => {
  it('sends a teacher to their dashboard, not the admin area', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ account: { id: '1', role: 'teacher' } }),
        { status: 200 },
      ),
    );

    render(<LoginPage />);
    submit();

    await waitFor(() => expect(push).toHaveBeenCalledWith('/teacher/dashboard'));
  });

  it('sends an admin to the admin dashboard', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ account: { id: '2', role: 'admin' } }),
        { status: 200 },
      ),
    );

    render(<LoginPage />);
    submit();

    await waitFor(() => expect(push).toHaveBeenCalledWith('/admin/dashboard'));
  });

  it('falls back to the admin dashboard when the response body has no usable role', async () => {
    // Same safe default as before this fix, for a shape the client didn't
    // expect (rather than crashing on `body.account.role`).
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('not json', { status: 200 }),
    );

    render(<LoginPage />);
    submit();

    await waitFor(() => expect(push).toHaveBeenCalledWith('/admin/dashboard'));
  });

  it('shows an error and does not redirect on invalid credentials', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 401 }),
    );

    render(<LoginPage />);
    submit();

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        /sai email hoặc mật khẩu/i,
      ),
    );
    expect(push).not.toHaveBeenCalled();
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { LogoutButton } from './logout-button';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

afterEach(() => {
  vi.restoreAllMocks();
  push.mockReset();
});

describe('LogoutButton', () => {
  it('clears the session cookies then redirects to the login page', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 200 }));

    render(<LogoutButton />);
    fireEvent.click(screen.getByRole('button', { name: /đăng xuất/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/login'));
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/logout', {
      method: 'POST',
    });
  });

  it('still redirects when the logout request itself fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));

    render(<LogoutButton />);
    fireEvent.click(screen.getByRole('button', { name: /đăng xuất/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/login'));
  });
});

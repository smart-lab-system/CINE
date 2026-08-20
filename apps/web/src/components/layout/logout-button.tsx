'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleLogout() {
    setPending(true);
    // Only the Route Handler can clear the tokens — they're in httpOnly
    // cookies the browser can't touch from here. It clears them
    // unconditionally, so even a failed request still ends the session
    // locally; redirect either way rather than trapping the user on a page
    // they no longer have a token for.
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    router.push('/login');
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleLogout}
      disabled={pending}
    >
      Đăng xuất
    </Button>
  );
}

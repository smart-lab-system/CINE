'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { clearAccessToken } from '@/lib/auth-token';

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

    // Cookie do Route Handler xoá, nhưng access token còn một bản trong bộ
    // nhớ tab (lib/auth-token.ts). Bỏ qua bước này thì sau khi "đăng xuất",
    // JS vẫn cầm một token còn hiệu lực tới 15 phút và mọi lời gọi API vẫn
    // đi lọt — đăng xuất chỉ là ảo giác trên giao diện.
    clearAccessToken();
    router.push('/login');
  }

  return (
    // Ghost, not outline: signing out is the least important action on
    // every screen it appears on, and it sits three inches from whatever
    // the page's real primary action is. It should be findable, not
    // competitive.
    <Button type="button" variant="ghost" size="sm" onClick={handleLogout} loading={pending}>
      {!pending && <LogOut className="h-4 w-4" aria-hidden="true" />}
      Đăng xuất
    </Button>
  );
}

'use client';

import { useEffect, useState } from 'react';

export interface CurrentAccount {
  name: string;
  email: string;
  role: string;
}

function readAccountCookie(): CurrentAccount | null {
  if (typeof document === 'undefined') return null;

  const match = document.cookie.match(/(?:^|; )account=([^;]*)/);
  if (!match) return null;

  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(match[1]));
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'name' in parsed &&
      'email' in parsed &&
      'role' in parsed
    ) {
      return parsed as CurrentAccount;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Reads the non-httpOnly `account` cookie set by `api/auth/login/route.ts`
 * — display-only ("who's logged in" in the Topbar), never a source of
 * authorization (see that route's comment). Not a TanStack Query hook:
 * there's no network call here, just a same-tick cookie read, so it's
 * plain `useState`/`useEffect` rather than `useQuery`.
 */
export function useCurrentAccount(): CurrentAccount | null {
  // Starts null even though readAccountCookie() could run synchronously —
  // avoids a server/client render mismatch, since the server render has no
  // `document` at all.
  const [account, setAccount] = useState<CurrentAccount | null>(null);

  useEffect(() => {
    setAccount(readAccountCookie());
  }, []);

  return account;
}

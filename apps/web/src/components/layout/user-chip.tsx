'use client';

import { Badge } from '@/components/ui/badge';
import { getRoleDisplay } from '@/lib/account-roles';
import type { CurrentAccount } from '@/hooks/useCurrentAccount';

/**
 * Two letters for the avatar: first letter of the first word plus first
 * letter of the last word, which gives "NA" for "Nguyễn Văn A" — the
 * initials a Vietnamese reader expects. Falls back to the local part of
 * the email for an account with no name, and to "?" rather than an empty
 * circle if both are blank.
 */
function initials(account: CurrentAccount): string {
  const source = account.name?.trim() || account.email.split('@')[0] || '';
  const words = source.split(/\s+/).filter(Boolean);

  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

export function UserChip({ account }: { account: CurrentAccount }) {
  const role = getRoleDisplay(account.role);
  const name = account.name || account.email;

  return (
    <div className="flex items-center gap-3">
      {/* The visible name is hidden below `sm`, where only the avatar
          remains — and initials read aloud are noise. So the identity is
          stated once, unconditionally, for assistive tech, and both visual
          pieces below are marked decorative. That way the announcement
          doesn't change with the viewport width. */}
      <span className="sr-only">
        Đang đăng nhập: {name}, vai trò {role.label}
      </span>

      <div
        className="hidden flex-col items-end gap-1 leading-none sm:flex"
        aria-hidden="true"
      >
        <span className="max-w-[14rem] truncate text-body font-semibold text-foreground">
          {name}
        </span>
        <Badge variant={role.variant}>{role.label}</Badge>
      </div>

      <span
        className="icon-chip h-9 w-9 select-none rounded-full bg-primary-subtle text-caption font-bold text-primary"
        aria-hidden="true"
        title={name}
      >
        {initials(account)}
      </span>
    </div>
  );
}

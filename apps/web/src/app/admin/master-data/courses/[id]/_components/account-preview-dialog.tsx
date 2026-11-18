'use client';

import { Mail, Shield, UserRound, CircleDot } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAccount } from '@/hooks/useAccounts';
import {
  ACCOUNT_ROLE_BADGE_VARIANT,
  ACCOUNT_ROLE_OPTIONS,
  getRoleDisplay,
  type AccountRoleOption,
} from '@/lib/account-roles';

function isKnownRole(role: string): role is AccountRoleOption {
  return (ACCOUNT_ROLE_OPTIONS as readonly string[]).includes(role);
}

function InfoCard({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof UserRound;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="border-border/80 bg-surface-2/40 shadow-none">
      <CardContent className="flex flex-col gap-2 p-4">
        <div className="flex items-center gap-2 text-caption text-muted-foreground">
          <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{label}</span>
        </div>
        <div className="min-w-0 text-body font-medium text-foreground break-words">
          {children}
        </div>
      </CardContent>
    </Card>
  );
}

export function AccountPreviewDialog({
  accountId,
  open,
  onOpenChange,
}: {
  accountId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const account = useAccount(open ? accountId ?? undefined : undefined);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Thông tin tài khoản</DialogTitle>
        </DialogHeader>

        {account.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : account.isError || !account.data ? (
          <p className="text-small text-muted-foreground">
            {account.error instanceof Error
              ? account.error.message
              : 'Không tải được tài khoản.'}
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <InfoCard icon={UserRound} label="Họ tên">
              {account.data.name}
            </InfoCard>
            <InfoCard icon={Mail} label="Email">
              <span className="break-all font-normal">{account.data.email}</span>
            </InfoCard>
            <InfoCard icon={Shield} label="Vai trò">
              <Badge
                variant={
                  isKnownRole(account.data.role)
                    ? ACCOUNT_ROLE_BADGE_VARIANT[account.data.role]
                    : 'default'
                }
              >
                {getRoleDisplay(account.data.role).label}
              </Badge>
            </InfoCard>
            <InfoCard icon={CircleDot} label="Trạng thái">
              {account.data.isActive ? (
                <Badge variant="success">Đang hoạt động</Badge>
              ) : (
                <Badge variant="default">Vô hiệu hoá</Badge>
              )}
            </InfoCard>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Nút tên trong ô bảng — dừng bubble để không mở hàng chi tiết. */
export function AccountNameButton({
  accountId,
  label,
  onOpen,
}: {
  accountId: string | null | undefined;
  label: string;
  onOpen: (accountId: string) => void;
}) {
  if (!accountId) {
    return <span>{label}</span>;
  }
  return (
    <button
      type="button"
      className="text-left text-accent-strong underline-offset-2 hover:underline"
      onClick={(e) => {
        e.stopPropagation();
        onOpen(accountId);
      }}
    >
      {label}
    </button>
  );
}

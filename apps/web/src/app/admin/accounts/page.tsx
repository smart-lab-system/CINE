'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Pencil, Plus, Search, Trash2, Users } from 'lucide-react';
import {
  useReactTable,
  getCoreRowModel,
  createColumnHelper,
  flexRender,
} from '@tanstack/react-table';
import { useAccounts, useCreateAccount, useUpdateAccount, useDeleteAccount } from '@/hooks/useAccounts';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import type { AccountView } from '@/lib/api/accounts';
import {
  ACCOUNT_ROLE_BADGE_VARIANT,
  ACCOUNT_ROLE_LABELS,
  ACCOUNT_ROLE_OPTIONS,
} from '@/lib/account-roles';
import { AccountForm, AccountFormValues } from '@/components/accounts/account-form';
import { EditAccountForm, EditAccountFormValues } from '@/components/accounts/edit-account-form';
import { EmptyState } from '@/components/layout/empty-state';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const PAGE_SIZE = 20;

const columnHelper = createColumnHelper<AccountView>();

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('vi-VN');
}

/**
 * List-only page (Phase 1 rebuild — was previously a list with a create
 * form wedged in below it). "Tạo tài khoản" and "Sửa" both open a Dialog
 * instead. Routed through hooks/useAccounts.ts + lib/api/accounts.ts
 * (CLAUDE.md's API-call-layering rule — the previous version of this page
 * called `apiClient` directly).
 *
 * No "Trạng thái" column: `account` has no status/soft-delete column in
 * this schema (a deliberate earlier design decision — see
 * apps/api/src/identity/entities/account.entity.ts) — there's nothing to
 * show.
 */
export default function AccountsPage() {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | (typeof ACCOUNT_ROLE_OPTIONS)[number]>('all');
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<AccountView | null>(null);
  // Was a native window.confirm(). A browser dialog can't be styled, can't
  // name the consequence, and looks like a page error rather than part of
  // the product — for a destructive action that's exactly the wrong tone.
  const [deletingAccount, setDeletingAccount] = useState<AccountView | null>(null);

  const debouncedSearch = useDebouncedValue(search, 300);

  /**
   * Chưa ai giữ vai trò Phòng Đào tạo thì KHÔNG AI đặt được kỳ hiện hành, và
   * mọi màn hình lọc theo học kỳ đứng im mà không nói vì sao. Hành vi đúng,
   * nhưng phải hiện ra — spec §7.3.
   *
   * Chỉ nhìn trang hiện tại của danh sách đã phân trang. Sai-âm ở trang 2 chỉ
   * làm mất một lời nhắc; gọi thêm một query đếm role chỉ để vẽ một dòng là
   * không đáng.
   */
  const { data, error, isLoading, refetch } = useAccounts({
    search: debouncedSearch || undefined,
    role: roleFilter === 'all' ? undefined : roleFilter,
    page,
    pageSize: PAGE_SIZE,
  });

  const createAccount = useCreateAccount();
  const updateAccount = useUpdateAccount();
  const deleteAccount = useDeleteAccount();

  function handleSearchChange(value: string) {
    setSearch(value);
    setPage(1);
  }

  function handleRoleFilterChange(value: string) {
    setRoleFilter(value as typeof roleFilter);
    setPage(1);
  }

  function handleCreate(values: AccountFormValues) {
    createAccount.mutate(values, {
      onSuccess: () => {
        toast.success('Đã tạo tài khoản');
        setCreateOpen(false);
      },
      onError: () => toast.error('Không tạo được tài khoản. Email có thể đã được dùng.'),
    });
  }

  function handleUpdate(values: EditAccountFormValues) {
    if (!editingAccount) return;
    updateAccount.mutate(
      { id: editingAccount.id, values },
      {
        onSuccess: () => {
          toast.success('Đã cập nhật tài khoản');
          setEditingAccount(null);
        },
        onError: () => toast.error('Không cập nhật được tài khoản.'),
      },
    );
  }

  function handleDelete() {
    if (!deletingAccount) return;
    deleteAccount.mutate(deletingAccount.id, {
      onSuccess: () => {
        toast.success('Đã xoá tài khoản');
        setDeletingAccount(null);
      },
      onError: () =>
        toast.error(
          'Không xoá được tài khoản — tài khoản này có thể đang sở hữu dữ liệu khác (phiên thi, lớp...).',
        ),
    });
  }

  const columns = [
    columnHelper.accessor('name', {
      header: 'Họ tên',
      cell: ({ getValue }) => <span className="font-medium text-foreground">{getValue()}</span>,
    }),
    columnHelper.accessor('email', {
      header: 'Email',
      cell: ({ getValue }) => <span className="text-muted-foreground">{getValue()}</span>,
    }),
    columnHelper.accessor('role', {
      header: 'Vai trò',
      cell: ({ getValue }) => {
        const role = getValue();
        const isKnownRole = (r: string): r is (typeof ACCOUNT_ROLE_OPTIONS)[number] =>
          (ACCOUNT_ROLE_OPTIONS as readonly string[]).includes(r);
        return (
          <Badge variant={isKnownRole(role) ? ACCOUNT_ROLE_BADGE_VARIANT[role] : 'default'}>
            {isKnownRole(role) ? ACCOUNT_ROLE_LABELS[role] : role}
          </Badge>
        );
      },
    }),
    columnHelper.accessor('createdAt', {
      header: 'Ngày tạo',
      cell: ({ getValue }) => (
        <span className="whitespace-nowrap text-muted-foreground">{formatDate(getValue())}</span>
      ),
    }),
    columnHelper.display({
      id: 'actions',
      header: 'Thao tác',
      cell: ({ row }) => (
        // Icon buttons with a per-row accessible name: "Sửa" repeated
        // twenty times down a column tells a screen-reader user nothing
        // about which row they're on.
        <div className="flex justify-end gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setEditingAccount(row.original)}
            aria-label={`Sửa tài khoản ${row.original.name}`}
            title="Sửa tài khoản"
          >
            <Pencil className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setDeletingAccount(row.original)}
            aria-label={`Xóa tài khoản ${row.original.name}`}
            title="Xóa tài khoản"
            className="hover:bg-danger-subtle hover:text-danger-strong"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      ),
    }),
  ];

  const table = useReactTable({
    data: data?.items ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasActiveFilters = search.trim() !== '' || roleFilter !== 'all';

  const hasAcademicAccount = (data?.items ?? []).some(
    (account) => account.role === 'academic_affairs',
  );

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Quản lý tài khoản"
        description="Cấp và thu hồi quyền truy cập ExamCollect cho giảng viên và quản trị viên."
        actions={
          /* Hidden (not just disabled) when the list query itself failed —
             AccountsController is @Roles('admin')-only, so if GET /accounts
             403'd, POST /accounts would too; showing a create button whose
             submit can only fail the same way is misleading busywork, not a
             usable admin screen. */
          !error && (
            <Button type="button" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Tạo tài khoản
            </Button>
          )
        }
      />

      {!isLoading && !error && !hasAcademicAccount && (
        <Alert variant="warning">
          <AlertDescription>
            Chưa có tài khoản Phòng Đào tạo nào. Không ai đặt được học kỳ hiện hành,
            nên mọi màn hình lọc theo học kỳ sẽ trống cho tới khi có một tài khoản
            mang vai trò này.
          </AlertDescription>
        </Alert>
      )}

      <div data-animate className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1 sm:max-w-xs">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              placeholder="Tìm theo tên hoặc email..."
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-9"
              aria-label="Tìm kiếm tài khoản"
            />
          </div>
          <Select value={roleFilter} onValueChange={handleRoleFilterChange}>
            <SelectTrigger className="sm:w-48" aria-label="Lọc theo vai trò">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả vai trò</SelectItem>
              {ACCOUNT_ROLE_OPTIONS.map((role) => (
                <SelectItem key={role} value={role}>
                  {ACCOUNT_ROLE_LABELS[role]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <Card>
            <CardContent className="flex flex-col gap-3 p-6">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </CardContent>
          </Card>
        ) : error ? (
          <Alert variant="destructive">
            <AlertDescription className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span>Không tải được danh sách tài khoản. Hãy thử lại.</span>
              <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>
                Thử lại
              </Button>
            </AlertDescription>
          </Alert>
        ) : table.getRowModel().rows.length === 0 ? (
          <Card>
            <EmptyState
              icon={Users}
              title={hasActiveFilters ? 'Không tìm thấy tài khoản phù hợp' : 'Chưa có tài khoản nào'}
              description={
                hasActiveFilters
                  ? 'Thử đổi từ khoá tìm kiếm hoặc bộ lọc vai trò.'
                  : 'Tạo tài khoản đầu tiên cho giáo viên hoặc quản trị viên khác.'
              }
              action={
                hasActiveFilters ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setSearch('');
                      setRoleFilter('all');
                      setPage(1);
                    }}
                  >
                    Xoá bộ lọc
                  </Button>
                ) : (
                  <Button type="button" onClick={() => setCreateOpen(true)}>
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Tạo tài khoản
                  </Button>
                )
              }
            />
          </Card>
        ) : (
          <>
            {/* overflow-hidden so the tinted header band is clipped by the
                card's own corner radius instead of squaring it off. */}
            <Card className="overflow-hidden">
              <Table>
                <TableHeader>
                  {table.getHeaderGroups().map((headerGroup) => (
                    <TableRow key={headerGroup.id} className="hover:bg-transparent">
                      {headerGroup.headers.map((header) => (
                        <TableHead
                          key={header.id}
                          className={header.column.id === 'actions' ? 'text-right' : undefined}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                        </TableHead>
                      ))}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody>
                  {table.getRowModel().rows.map((row) => (
                    <TableRow key={row.id}>
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>

            <div className="flex items-center justify-between gap-4 text-small text-muted-foreground">
              <span>
                Trang {page}/{totalPages} • {total} tài khoản
              </span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Trước
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Sau
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tạo tài khoản mới</DialogTitle>
            <DialogDescription>
              Tài khoản dùng được ngay sau khi tạo. Gửi mật khẩu cho người dùng qua kênh riêng.
            </DialogDescription>
          </DialogHeader>
          <AccountForm onSubmit={handleCreate} submitting={createAccount.isPending} />
        </DialogContent>
      </Dialog>

      <Dialog open={editingAccount !== null} onOpenChange={(open) => !open && setEditingAccount(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sửa tài khoản</DialogTitle>
            <DialogDescription>{editingAccount?.email}</DialogDescription>
          </DialogHeader>
          {editingAccount && (
            <EditAccountForm
              defaultValues={{
                name: editingAccount.name,
                role: editingAccount.role as EditAccountFormValues['role'],
              }}
              onSubmit={handleUpdate}
              onCancel={() => setEditingAccount(null)}
              submitting={updateAccount.isPending}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={deletingAccount !== null}
        onOpenChange={(open) => !open && setDeletingAccount(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Xóa tài khoản?</DialogTitle>
            <DialogDescription>
              <strong className="font-semibold text-foreground">{deletingAccount?.name}</strong> (
              {deletingAccount?.email}) sẽ mất quyền truy cập ExamCollect ngay lập tức. Không thể
              hoàn tác.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeletingAccount(null)}>
              Hủy
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              loading={deleteAccount.isPending}
            >
              {deleteAccount.isPending ? 'Đang xoá…' : 'Xóa tài khoản'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

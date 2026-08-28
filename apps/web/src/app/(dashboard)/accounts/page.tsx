'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  useReactTable,
  getCoreRowModel,
  createColumnHelper,
  flexRender,
} from '@tanstack/react-table';
import { apiClient } from '../../../lib/api-client';
import { PageHeader } from '@/components/layout/page-header';
import { PageShell } from '@/components/layout/page-shell';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface AccountRow {
  id: string;
  username: string;
  displayName: string;
  status: string;
  roles: string[];
  linkedProfile: {
    type: 'lecturer' | 'student';
    code: string;
    fullName: string;
  } | null;
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Chờ duyệt',
  active: 'Hoạt động',
  locked: 'Khóa',
  disabled: 'Vô hiệu',
};

const ROLE_LABELS: Record<string, string> = {
  admin: 'Quản trị',
  operator: 'Vận hành phòng máy',
  lecturer: 'Giảng viên',
  student: 'Sinh viên',
};

function formatLinkedProfile(
  profile: AccountRow['linkedProfile'],
): string {
  if (!profile) {
    return '—';
  }
  const label = profile.type === 'lecturer' ? 'GV' : 'SV';
  return `${label}: ${profile.code} — ${profile.fullName}`;
}

function formatRoles(roles: string[]): string {
  return roles.map((role) => ROLE_LABELS[role] ?? role).join(', ');
}

const columnHelper = createColumnHelper<AccountRow>();

export default function AccountsPage() {
  const [search, setSearch] = useState('');
  const queryClientInstance = useQueryClient();

  const { data, error, isLoading } = useQuery({
    queryKey: ['accounts', search],
    queryFn: async () => {
      const { data, error, response } = await apiClient.GET('/accounts', {
        params: { query: { search, page: 1, pageSize: 20 } },
      });
      if (error || !response.ok) {
        throw error ?? new Error(`Yêu cầu thất bại (HTTP ${response.status})`);
      }
      return data as unknown as { items: AccountRow[]; total: number };
    },
  });

  const deleteAccount = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await apiClient.DELETE('/accounts/{id}', {
        params: { path: { id } },
      });
      if (error) throw error;
    },
    onSuccess: () =>
      queryClientInstance.invalidateQueries({ queryKey: ['accounts'] }),
  });

  const columns = [
    columnHelper.accessor('username', { header: 'Tên đăng nhập' }),
    columnHelper.accessor('displayName', { header: 'Họ tên' }),
    columnHelper.accessor('linkedProfile', {
      header: 'Liên kết',
      cell: ({ getValue }) => formatLinkedProfile(getValue()),
    }),
    columnHelper.accessor('status', {
      header: 'Trạng thái',
      cell: ({ getValue }) => STATUS_LABELS[getValue()] ?? getValue(),
    }),
    columnHelper.accessor((row) => formatRoles(row.roles), { header: 'Vai trò' }),
    columnHelper.display({
      id: 'actions',
      header: 'Thao tác',
      cell: ({ row }) => (
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" asChild>
            <Link href={`/accounts/${row.original.id}/edit`}>Sửa</Link>
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => {
              if (window.confirm(`Xóa tài khoản "${row.original.username}"?`)) {
                deleteAccount.mutate(row.original.id);
              }
            }}
          >
            Xóa
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

  return (
    <PageShell>
      <PageHeader
        title="Tài khoản"
        description="Quản lý tài khoản đăng nhập hệ thống"
        actions={
          <Button asChild>
            <Link href="/accounts/new">Thêm mới</Link>
          </Button>
        }
      />

      <Input
        placeholder="Tìm kiếm..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-xs"
      />

      {isLoading ? (
        <Card>
          <p className="p-4 text-sm text-muted-foreground">Đang tải…</p>
        </Card>
      ) : error ? (
        <Card>
          <p role="alert" className="p-4 text-sm text-destructive">
            Không tải được danh sách tài khoản. Hãy tải lại trang hoặc đăng nhập
            lại.
          </p>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id}>
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
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
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </PageShell>
  );
}

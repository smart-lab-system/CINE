'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  useReactTable,
  getCoreRowModel,
  createColumnHelper,
  flexRender,
} from '@tanstack/react-table';
import { apiClient } from '../../../lib/api-client';
import { AccountForm, AccountFormValues } from '../../../components/accounts/account-form';
import {
  EditAccountForm,
  EditAccountFormValues,
} from '../../../components/accounts/edit-account-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  name: string;
  email: string;
  role: string;
}

const columnHelper = createColumnHelper<AccountRow>();

// The QueryClientProvider lives in (dashboard)/layout.tsx so every dashboard
// page shares one client — and so it's never constructed at module scope,
// which on the server would share a single cache across unrelated requests.
export default function AccountsPage() {
  const [search, setSearch] = useState('');
  const [editingAccount, setEditingAccount] = useState<AccountRow | null>(null);

  const { data, error, isLoading } = useQuery({
    queryKey: ['accounts', search],
    queryFn: async () => {
      const { data, error, response } = await apiClient.GET('/accounts', {
        params: { query: { search, page: 1, pageSize: 20 } },
      });
      // openapi-fetch only fills `error` from the response *body*, which some
      // failures leave empty — key off the status too so a 401 (expired
      // access_token that the middleware's existence-only check waved
      // through) can't be mistaken for an empty result set.
      if (error || !response.ok) {
        throw error ?? new Error(`Yêu cầu thất bại (HTTP ${response.status})`);
      }
      // See Task 7's note on this cast: AccountsController.search() has no
      // Swagger-decorated response type yet, so the generated response
      // schema is empty.
      return data as unknown as { items: AccountRow[]; total: number };
    },
  });

  const queryClientInstance = useQueryClient();

  const createAccount = useMutation({
    mutationFn: async (values: AccountFormValues) => {
      const { error } = await apiClient.POST('/accounts', { body: values });
      if (error) throw error;
    },
    onSuccess: () => queryClientInstance.invalidateQueries({ queryKey: ['accounts'] }),
  });

  const updateAccount = useMutation({
    mutationFn: async ({
      id,
      values,
    }: {
      id: string;
      values: EditAccountFormValues;
    }) => {
      const { error } = await apiClient.PATCH('/accounts/{id}', {
        params: { path: { id } },
        body: values,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClientInstance.invalidateQueries({ queryKey: ['accounts'] });
      setEditingAccount(null);
    },
  });

  const deleteAccount = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await apiClient.DELETE('/accounts/{id}', {
        params: { path: { id } },
      });
      if (error) throw error;
    },
    onSuccess: () => queryClientInstance.invalidateQueries({ queryKey: ['accounts'] }),
  });

  const columns = [
    columnHelper.accessor('name', { header: 'Họ tên' }),
    columnHelper.accessor('email', { header: 'Email' }),
    columnHelper.accessor('role', { header: 'Vai trò' }),
    columnHelper.display({
      id: 'actions',
      header: 'Thao tác',
      cell: ({ row }) => (
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setEditingAccount(row.original)}
          >
            Sửa
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => {
              if (window.confirm(`Xóa tài khoản "${row.original.name}"?`)) {
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
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold">Quản lý tài khoản</h1>

      <Input
        placeholder="Tìm kiếm..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-xs"
      />

      {/* Without these two branches a failed request (e.g. an expired
          access_token the middleware's existence-only check still lets
          through) renders an empty table that's indistinguishable from
          "no accounts yet". */}
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
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {editingAccount ? (
        <Card>
          <CardHeader>
            <CardTitle>Sửa tài khoản — {editingAccount.name}</CardTitle>
          </CardHeader>
          <CardContent>
            <EditAccountForm
              defaultValues={{
                name: editingAccount.name,
                role: editingAccount.role as EditAccountFormValues['role'],
              }}
              onSubmit={(values) => updateAccount.mutate({ id: editingAccount.id, values })}
              onCancel={() => setEditingAccount(null)}
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Tạo tài khoản mới</CardTitle>
          </CardHeader>
          <CardContent>
            <AccountForm onSubmit={(values) => createAccount.mutate(values)} />
          </CardContent>
        </Card>
      )}
    </main>
  );
}

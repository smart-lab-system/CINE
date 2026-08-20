'use client';

import { useState } from 'react';
import {
  useQuery,
  useMutation,
  useQueryClient,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import {
  useReactTable,
  getCoreRowModel,
  createColumnHelper,
  flexRender,
} from '@tanstack/react-table';
import { apiClient } from '../../../lib/api-client';
import { AccountForm, AccountFormValues } from '../../../components/accounts/account-form';
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
  username: string;
  displayName: string;
  status: string;
  roles: string[];
}

const columnHelper = createColumnHelper<AccountRow>();
const columns = [
  columnHelper.accessor('username', { header: 'Tên đăng nhập' }),
  columnHelper.accessor('displayName', { header: 'Họ tên' }),
  columnHelper.accessor('status', { header: 'Trạng thái' }),
  columnHelper.accessor((row) => row.roles.join(', '), { header: 'Vai trò' }),
];

const queryClient = new QueryClient();

function AccountsTable() {
  const [search, setSearch] = useState('');

  const { data } = useQuery({
    queryKey: ['accounts', search],
    queryFn: async () => {
      const { data, error } = await apiClient.GET('/accounts', {
        params: { query: { search, page: 1, pageSize: 20 } },
      });
      if (error) throw error;
      // AccountsController_search's return type is a plain interface
      // (`{ items: AccountView[]; total: number }`), not a class decorated
      // for Swagger, so the generated schema has no response body for this
      // operation and `data`'s inferred type is `undefined`. The cast below
      // documents that gap rather than hiding it behind `any`.
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

  const table = useReactTable({
    data: data?.items ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold">Quản lý tài khoản</h1>

      <Input
        placeholder="Tìm kiếm..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-xs"
      />

      <Card>
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
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

      <Card>
        <CardHeader>
          <CardTitle>Tạo tài khoản mới</CardTitle>
        </CardHeader>
        <CardContent>
          <AccountForm onSubmit={(values) => createAccount.mutate(values)} />
        </CardContent>
      </Card>
    </main>
  );
}

export default function AccountsPage() {
  return (
    <QueryClientProvider client={queryClient}>
      <AccountsTable />
    </QueryClientProvider>
  );
}

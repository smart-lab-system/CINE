'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../../../lib/api-client';
import {
  EditAccountForm,
  EditAccountFormValues,
} from '../../../../../components/accounts/edit-account-form';
import { PageHeader } from '@/components/layout/page-header';
import { PageShell } from '@/components/layout/page-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface AccountRow {
  id: string;
  username: string;
  displayName: string;
  status: string;
  roles: string[];
}

export default function EditAccountPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const accountQuery = useQuery({
    queryKey: ['accounts', params.id],
    queryFn: async () => {
      const { data, error, response } = await apiClient.GET('/accounts', {
        params: { query: { page: 1, pageSize: 100 } },
      });
      if (error || !response.ok) {
        throw error ?? new Error(`Yêu cầu thất bại (HTTP ${response.status})`);
      }
      const list = data as unknown as { items: AccountRow[] };
      const account = list.items.find((a) => a.id === params.id);
      if (!account) throw new Error('Không tìm thấy tài khoản');
      return account;
    },
  });

  const updateAccount = useMutation({
    mutationFn: async (values: EditAccountFormValues) => {
      const { error } = await apiClient.PATCH('/accounts/{id}', {
        params: { path: { id: params.id } },
        body: values,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['accounts'] });
      router.push('/accounts');
    },
  });

  return (
    <PageShell>
      <PageHeader
        title={
          accountQuery.data
            ? `Sửa tài khoản — ${accountQuery.data.username}`
            : 'Sửa tài khoản'
        }
        actions={
          <Button variant="outline" asChild>
            <Link href="/accounts">Quay lại</Link>
          </Button>
        }
      />
      {accountQuery.isLoading ? (
        <Card>
          <p className="p-4 text-sm text-muted-foreground">Đang tải…</p>
        </Card>
      ) : accountQuery.error || !accountQuery.data ? (
        <Card>
          <p role="alert" className="p-4 text-sm text-destructive">
            Không tải được thông tin tài khoản.
          </p>
        </Card>
      ) : (
        <Card className="max-w-lg">
          <CardContent className="pt-6">
            <EditAccountForm
              defaultValues={{
                displayName: accountQuery.data.displayName,
                status: accountQuery.data
                  .status as EditAccountFormValues['status'],
                roleCodes: accountQuery.data
                  .roles as EditAccountFormValues['roleCodes'],
              }}
              onSubmit={(values) => updateAccount.mutate(values)}
              onCancel={() => router.push('/accounts')}
            />
            {updateAccount.isError ? (
              <p role="alert" className="mt-3 text-sm text-destructive">
                Không cập nhật được tài khoản.
              </p>
            ) : null}
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}

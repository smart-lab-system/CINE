'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../../lib/api-client';
import {
  AccountForm,
  AccountFormValues,
} from '../../../../components/accounts/account-form';
import { PageHeader } from '@/components/layout/page-header';
import { PageShell } from '@/components/layout/page-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export default function NewAccountPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const createAccount = useMutation({
    mutationFn: async (values: AccountFormValues) => {
      const { error } = await apiClient.POST('/accounts', { body: values });
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
        title="Tạo tài khoản"
        actions={
          <Button variant="outline" asChild>
            <Link href="/accounts">Quay lại</Link>
          </Button>
        }
      />
      <Card className="max-w-lg">
        <CardContent className="pt-6">
          <AccountForm onSubmit={(values) => createAccount.mutate(values)} />
          {createAccount.isError ? (
            <p role="alert" className="mt-3 text-sm text-destructive">
              Không tạo được tài khoản. Kiểm tra lại dữ liệu.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </PageShell>
  );
}

'use client';

import { use } from 'react';
import Link from 'next/link';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useRules } from '@/hooks/useRules';
import { RuleForm } from '../_components/RuleForm';

/** Sửa một luật đang dùng (spec UI §3.2). Sửa tên, tiêu chí hay cách nhận ra sinh MỘT bản sửa mới (§14.1). */
export default function EditRulePage({ params }: { params: Promise<{ ruleId: string }> }) {
  const { ruleId } = use(params);
  const rules = useRules();
  const rule = rules.data?.find((r) => r.id === ruleId);

  if (rules.isLoading) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-small text-muted-foreground">Đang tải…</p>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (rules.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>Không tải được luật — {rules.error.message}. Thử tải lại trang.</AlertDescription>
      </Alert>
    );
  }
  if (!rule) {
    return (
      <Alert variant="warning">
        <AlertDescription>
          Không tìm thấy luật này — có thể nó đã bị gỡ.{' '}
          <Link href="/teacher/rules" className="font-semibold underline underline-offset-2">
            Về Bảng lỗi
          </Link>
        </AlertDescription>
      </Alert>
    );
  }

  return <RuleForm key={rule.id} rule={rule} />;
}

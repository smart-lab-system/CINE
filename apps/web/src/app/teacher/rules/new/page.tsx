'use client';

import { Suspense, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useMissingRules } from '@/hooks/useRules';
import type { Rule } from '@/lib/api/rules';
import { RuleForm } from '../_components/RuleForm';

/**
 * Tạo luật (spec UI §3.2). `?from=<id>` mở từ "Luật còn thiếu": điền sẵn điều agent đã quan sát.
 *
 * `useSearchParams` đòi một ranh giới Suspense khi build tĩnh, nên phần ruột tách ra.
 */
export default function NewRulePage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <NewRuleContent />
    </Suspense>
  );
}

function NewRuleContent() {
  const from = useSearchParams().get('from');
  const missing = useMissingRules();
  // Lưu xong, luật đề xuất được kích hoạt và RỜI danh sách "còn thiếu". Giữ bản đã tìm thấy: nếu không, lần
  // tải lại sau khi lưu sẽ thay form (và dòng "Đã lưu" trong nó) bằng "không tìm thấy".
  const captured = useRef<Rule | undefined>(undefined);
  const found = missing.data?.find((r) => r.id === from);
  if (found && !captured.current) captured.current = found;
  const proposed = captured.current ?? found;

  if (!from) return <RuleForm />;

  if (!proposed) {
    if (missing.isLoading) {
      return (
        <div className="flex flex-col gap-2">
          <p className="text-small text-muted-foreground">Đang tải…</p>
          <Skeleton className="h-64 w-full" />
        </div>
      );
    }
    if (missing.isError) {
      return (
        <Alert variant="destructive">
          <AlertDescription>Không tải được luật agent đề xuất — {missing.error.message}. Thử tải lại trang.</AlertDescription>
        </Alert>
      );
    }
    return (
      <Alert variant="warning">
        <AlertDescription>
          Không tìm thấy luật agent đề xuất này — có thể bạn đã xử lý nó rồi.{' '}
          <Link href="/teacher/rules/new" className="font-semibold underline underline-offset-2">
            Tạo luật mới từ đầu
          </Link>
        </AlertDescription>
      </Alert>
    );
  }

  return <RuleForm key={proposed.id} rule={proposed} />;
}

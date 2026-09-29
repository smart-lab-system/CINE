'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useRubrics, useSetSessionRubric } from '@/hooks/useGrading';
import { formatVnPoints } from '@/lib/format';

/**
 * Trần điểm của phiên (spec §3.7): rubric đã ghim — hoặc chỗ để ghim. Thay `SessionRubricCard`.
 *
 * `RubricPicker` (lúc tạo phiên) hứa "cứ tạo phiên thi và gắn sau", và đây là nơi "sau" xảy ra — bỏ thẻ cũ mà
 * không có chỗ này là bội ước. Hiện đúng BẢN ĐÃ GHIM (theo id), không phải bản mới nhất của rubric: phiên được
 * chấm bằng bản nó ghim. Đổi được khi phiên chưa có kết quả; nếu server từ chối (409) thì hiện nguyên văn.
 */
export function RubricRow({ sessionId, rubricId }: { sessionId: string; rubricId: string | null }) {
  const rubrics = useRubrics();
  const pin = useSetSessionRubric(sessionId);
  const [choice, setChoice] = useState('');

  const pinned = rubricId ? rubrics.data?.find((r) => r.id === rubricId) : undefined;
  const options = (rubrics.data ?? []).filter((r) => r.isActive);

  const body = () => {
    if (rubrics.isLoading) return <p className="text-small text-muted-foreground">Đang tải…</p>;
    if ((rubrics.data ?? []).length === 0) {
      return (
        <p className="text-small text-muted-foreground">
          Bạn chưa có rubric nào.{' '}
          <Link href="/teacher/rules" className="font-semibold underline underline-offset-2">
            Tạo rubric ở Bảng lỗi
          </Link>{' '}
          rồi quay lại.
        </p>
      );
    }
    return (
      <div className="flex flex-col gap-3">
        {pinned ? (
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="flex flex-col">
              <span className="text-small font-semibold">
                {pinned.name} — phiên bản {pinned.version}
              </span>
              <span className="text-caption text-muted-foreground">
                {formatVnPoints(pinned.totalPoints)} điểm, {pinned.criteria.length} tiêu chí
              </span>
            </div>
            <Link href="/teacher/rules" className="text-small font-semibold text-accent-strong hover:underline">
              Sửa trần ở Bảng lỗi
            </Link>
          </div>
        ) : (
          <p className="text-small text-warning-strong">
            {rubricId ? 'Không tìm thấy rubric đã gắn cho phiên này.' : 'Phiên này chưa gắn rubric — chưa chấm được.'}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Chọn rubric"
            value={choice}
            onChange={(e) => setChoice(e.target.value)}
            className="h-10 min-w-[220px] rounded-md border border-input bg-surface px-3 text-body"
          >
            <option value="">{pinned ? 'Đổi sang rubric khác…' : 'Chọn rubric…'}</option>
            {options.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} — bản {r.version}, {formatVnPoints(r.totalPoints)} điểm
              </option>
            ))}
          </select>
          <Button
            type="button"
            variant={pinned ? 'outline' : 'default'}
            disabled={choice === '' || choice === rubricId || pin.isPending}
            loading={pin.isPending}
            onClick={() => pin.mutate(choice, { onSuccess: () => setChoice('') })}
          >
            {pinned ? 'Đổi rubric' : 'Gắn rubric'}
          </Button>
        </div>

        {pin.isError && (
          <Alert variant="destructive">
            <AlertDescription>{pin.error.message}</AlertDescription>
          </Alert>
        )}
      </div>
    );
  };

  return (
    <section aria-label="Trần điểm" className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <h2 className="text-h3">Trần điểm</h2>
      {body()}
    </section>
  );
}

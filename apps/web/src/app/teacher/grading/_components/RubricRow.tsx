'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useRubrics, useSetSessionRubric } from '@/hooks/useGrading';
import { formatVnPoints } from '@/lib/format';
import { isQsRubric, qsRubricCaption } from '@/lib/qs-rubric-display';
import { rulesHref } from '@/lib/rules-links';

/**
 * Rubric của phiên (spec §3.7): bản đã ghim - hoặc chỗ để ghim. Thay `SessionRubricCard`.
 *
 * `RubricPicker` (lúc tạo phiên) hứa "cứ tạo phiên thi và gắn sau", và đây là nơi "sau" xảy ra - bỏ thẻ cũ mà
 * không có chỗ này là bội ước. Hiện đúng BẢN ĐÃ GHIM (theo id), không phải bản mới nhất của rubric: phiên được
 * chấm bằng bản nó ghim. Đổi được khi phiên chưa có kết quả; nếu server từ chối (409) thì hiện nguyên văn.
 */
export function RubricRow({
  sessionId,
  rubricId,
  readOnly = false,
  persist = 'immediate',
  choice: choiceProp,
  onChoiceChange,
  heading = true,
  hidePicker = false,
}: {
  sessionId: string;
  rubricId: string | null;
  /** Xem lại sau khi đã chấm: không đổi rubric của phiên. */
  readOnly?: boolean;
  /** `draft`: hub giữ lựa chọn trong nháp, không gọi PATCH từ nút này. */
  persist?: 'immediate' | 'draft';
  choice?: string;
  onChoiceChange?: (choice: string) => void;
  heading?: boolean;
  /** Ẩn select gắn rubric (dùng modal thiết lập riêng). */
  hidePicker?: boolean;
}) {
  const rubrics = useRubrics();
  const pin = useSetSessionRubric(sessionId);
  const [choice, setChoice] = useState('');

  const selected = persist === 'draft' ? (choiceProp || rubricId || '') : choice;
  const showPicker = !readOnly && !hidePicker;
  const displayedId = persist === 'draft' ? selected || null : rubricId;
  const pinned = displayedId ? rubrics.data?.find((r) => r.id === displayedId) : undefined;
  const options = (rubrics.data ?? []).filter((r) => r.isActive && !r.isArchived);

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
            <div className="flex flex-col gap-1">
              <span className="flex flex-wrap items-center gap-2 text-small font-semibold">
                {pinned.name} - phiên bản {pinned.version}
                {isQsRubric(pinned) ? <Badge variant="accent">QS</Badge> : null}
              </span>
              <span className="text-caption text-muted-foreground">
                {isQsRubric(pinned)
                  ? qsRubricCaption(pinned)
                  : `${formatVnPoints(pinned.totalPoints)} điểm, ${pinned.criteria.length} tiêu chí`}
              </span>
              {isQsRubric(pinned) ? (
                <span className="text-caption text-muted-foreground">
                  AI chọn đúng một cách giải lúc chấm - không chọn trước trên màn này.
                </span>
              ) : null}
            </div>
            <Link href={rulesHref(pinned.name)} className="text-small font-semibold text-accent-strong hover:underline">
              {isQsRubric(pinned)
                ? readOnly
                  ? 'Xem cấu trúc QS'
                  : 'Sửa cách giải & bước'
                : readOnly
                  ? 'Xem bảng lỗi'
                  : 'Sửa Rubric'}
            </Link>
          </div>
        ) : (
          <p className="text-small text-warning-strong">
            {displayedId ? 'Không tìm thấy rubric đã gắn cho phiên này.' : 'Phiên này chưa gắn rubric - chưa chấm được.'}
          </p>
        )}

        {showPicker && <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Chọn rubric"
            value={selected}
            onChange={(e) => {
              if (persist === 'draft') onChoiceChange?.(e.target.value);
              else setChoice(e.target.value);
            }}
            className="h-10 min-w-[220px] rounded-md border border-input bg-surface px-3 text-body"
          >
            <option value="">{pinned ? 'Đổi sang rubric khác…' : 'Chọn rubric…'}</option>
            {options.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} - {isQsRubric(r) ? 'QS' : 'QA'} · bản {r.version},{' '}
                {formatVnPoints(r.totalPoints)} điểm
              </option>
            ))}
          </select>
          {persist === 'immediate' && (
            <Button
              type="button"
              variant={pinned ? 'outline' : 'default'}
              disabled={selected === '' || selected === rubricId || pin.isPending}
              loading={pin.isPending}
              onClick={() => pin.mutate(selected, { onSuccess: () => setChoice('') })}
            >
              {pinned ? 'Đổi rubric' : 'Gắn rubric'}
            </Button>
          )}
        </div>}

        {!readOnly && pin.isError && (
          <Alert variant="destructive">
            <AlertDescription>{pin.error.message}</AlertDescription>
          </Alert>
        )}
      </div>
    );
  };

  return (
    <section aria-label="Rubric" className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      {heading ? <h2 className="text-h3">Rubric</h2> : null}
      {body()}
    </section>
  );
}

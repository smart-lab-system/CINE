'use client';

import { Badge } from '@/components/ui/badge';
import type { ReviewCriterion } from '@/lib/api/grading';

/**
 * Một tiêu chí khi AI KHÔNG chấm được bài (xem `ungradableReason` ở
 * `page.tsx`) — khác `CriterionCard` ở chỗ không có gì của AI để hiện:
 * không verdict, không trích dẫn, không độ tin cậy. Hiện những thứ đó
 * bằng dữ liệu bịa (`verdict: 'not_met'` mặc định của bản nháp ban đầu)
 * sẽ là đúng loại lời nói dối mà `ungradableReason` sinh ra để chặn —
 * một phán đoán TRÔNG NHƯ của AI mà AI chưa từng đưa ra.
 *
 * KHÔNG có `AdvocatePanel`: ý kiến phản biện chỉ sinh ra SAU khi Grader
 * chấm xong (`runAdvocate` ở `grading.service.ts` được gọi sau bước
 * chấm điểm) — nó không bao giờ chạy cho một bài AI chấm hỏng ngay từ
 * bước đầu. Hiện panel ở đây chỉ là "không có ý kiến" vẽ lại nhiều lần,
 * không mang thêm thông tin.
 */
export function ManualCriterionCard({
  index,
  description,
  maxPoints,
  draft,
  active,
  onActivate,
  onChange,
}: {
  index: number;
  description: string;
  maxPoints: number;
  draft: ReviewCriterion;
  active: boolean;
  onActivate: () => void;
  onChange: (next: Partial<ReviewCriterion>) => void;
}) {
  const steps = Array.from(new Set([0, Math.round(maxPoints * 50) / 100, maxPoints]));

  return (
    <article
      data-active={active}
      data-index={index}
      className={[
        'overflow-hidden rounded-lg border bg-surface transition-[border-color,box-shadow] duration-200 ease-smooth',
        active ? 'border-primary/50 shadow-[0_0_0_3px_hsl(var(--primary)/0.12)]' : 'border-border',
      ].join(' ')}
    >
      <button
        type="button"
        onClick={onActivate}
        className="flex w-full items-start gap-3 border-l-[3px] border-l-warning px-4 py-3.5 text-left hover:bg-surface-2"
      >
        <span className="min-w-0">
          <span className="block text-body font-semibold">{description}</span>
          <span className="mt-0.5 block text-caption text-muted-foreground">
            Tối đa {maxPoints} điểm · bấm để xem bài làm
          </span>
        </span>
        <span className="ml-auto shrink-0 text-right">
          <b className="text-h2 tabular-nums">{draft.points}</b>
          <span className="text-caption text-muted-foreground"> / {maxPoints}</span>
        </span>
      </button>

      <div className="flex flex-col gap-3.5 px-4 pb-4">
        <Badge variant="warning">AI chưa chấm tiêu chí này</Badge>

        <div className="flex flex-col gap-2">
          <span className="section-label">Chấm tay</span>
          <div className="flex flex-wrap items-center gap-2">
            {steps.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={draft.points === value}
                onClick={() =>
                  onChange({
                    points: value,
                    verdict: value === maxPoints ? 'met' : value === 0 ? 'not_met' : 'partially_met',
                  })
                }
                className={[
                  'h-8 rounded-sm border px-3.5 text-small font-semibold tabular-nums transition-colors',
                  draft.points === value
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-surface hover:bg-surface-2',
                ].join(' ')}
              >
                {value}
              </button>
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}

'use client';

import { Badge } from '@/components/ui/badge';
import type { GradingResult, ReviewCriterion } from '@/lib/api/grading';
import { HIGH_CONFIDENCE } from '@/lib/grading-triage';
import { hueFor } from './AnswerPane';

type Criterion = GradingResult['criterionResults'][number];
type Verdict = ReviewCriterion['verdict'];

const VERDICT_LABEL: Record<Verdict, string> = {
  met: 'Đạt',
  partially_met: 'Đạt một phần',
  not_met: 'Chưa đạt',
};

const VERDICT_VARIANT: Record<Verdict, 'success' | 'warning' | 'destructive'> = {
  met: 'success',
  partially_met: 'warning',
  not_met: 'destructive',
};

/**
 * Trích dẫn đã được đối chiếu tới đâu.
 *
 * BỐN trạng thái, không ba: `null`/thiếu nghĩa là bài được chấm TRƯỚC khi hệ
 * thống ghi lại phép đối chiếu. Gộp nó vào `'ok'` làm mọi bài cũ trông như
 * đã được kiểm — đúng loại lời nói dối mà guard này sinh ra để chặn.
 */
function checkBadge(check: Criterion['check']) {
  if (check === 'ok') return { variant: 'success' as const, label: 'trích dẫn khớp từng chữ' };
  if (check === 'unverified')
    return { variant: 'destructive' as const, label: 'không có trong bài làm' };
  if (check === 'empty')
    return { variant: 'default' as const, label: 'AI không đưa trích dẫn nào' };
  return { variant: 'default' as const, label: 'chưa đối chiếu' };
}

function confidenceColor(value: number): string {
  if (value >= HIGH_CONFIDENCE) return 'hsl(var(--success))';
  if (value >= 0.45) return 'hsl(var(--warning))';
  return 'hsl(var(--danger))';
}

/**
 * Một tiêu chí: AI chấm gì, dựa vào đâu, và bạn quyết gì.
 *
 * Thanh độ tin cậy được gắn nhãn là PHÉP ĐO, không phải "AI tự tin bao
 * nhiêu" — `confidence` do guard tính bằng đối chiếu trích dẫn với bài làm,
 * còn provider chỉ được đặt trần. Vẽ nó như model tự chấm là nói sai bản
 * chất kiến trúc, và đó lại là thứ đáng trình ra nhất khi bảo vệ.
 */
export function CriterionCard({
  criterion,
  index,
  description,
  maxPoints,
  confidence,
  draft,
  active,
  onActivate,
  onChange,
  children,
}: {
  criterion: Criterion;
  index: number;
  description: string;
  maxPoints: number;
  confidence: number | null;
  draft: ReviewCriterion;
  active: boolean;
  onActivate: () => void;
  onChange: (next: Partial<ReviewCriterion>) => void;
  children?: React.ReactNode;
}) {
  const badge = checkBadge(criterion.check);
  const steps = Array.from(new Set([0, Math.round(maxPoints * 50) / 100, maxPoints]));

  return (
    <article
      data-active={active}
      className={[
        'overflow-hidden rounded-lg border bg-surface transition-[border-color,box-shadow] duration-200 ease-smooth',
        active ? 'border-primary/50 shadow-[0_0_0_3px_hsl(var(--primary)/0.12)]' : 'border-border',
      ].join(' ')}
    >
      <button
        type="button"
        onClick={onActivate}
        style={{ borderLeftColor: `hsl(${hueFor(index)})` }}
        className="flex w-full items-start gap-3 border-l-[3px] px-4 py-3.5 text-left hover:bg-surface-2"
      >
        <span className="min-w-0">
          <span className="block text-body font-semibold">{description}</span>
          <span className="mt-0.5 block text-caption text-muted-foreground">
            Tối đa {maxPoints} điểm · bấm để xem trích dẫn trong bài làm
          </span>
        </span>
        <span className="ml-auto shrink-0 text-right">
          <b className="text-h2 tabular-nums">{draft.points}</b>
          <span className="text-caption text-muted-foreground"> / {maxPoints}</span>
        </span>
      </button>

      <div className="flex flex-col gap-3.5 px-4 pb-4">
        <div className="flex flex-wrap gap-1.5">
          <Badge variant={VERDICT_VARIANT[criterion.verdict]}>
            {VERDICT_LABEL[criterion.verdict]}
          </Badge>
          <Badge variant={badge.variant}>{badge.label}</Badge>
        </div>

        {confidence !== null && (
          <div className="flex items-center gap-2.5">
            <span className="section-label shrink-0">độ tin cậy</span>
            <span
              role="meter"
              aria-label="độ tin cậy"
              aria-valuenow={confidence}
              aria-valuemin={0}
              aria-valuemax={1}
              className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2"
            >
              <span
                className="block h-full rounded-full"
                style={{
                  width: `${confidence * 100}%`,
                  backgroundColor: confidenceColor(confidence),
                }}
              />
            </span>
            <span className="text-caption font-semibold tabular-nums">
              {confidence.toFixed(2).replace('.', ',')}
            </span>
          </div>
        )}
        <p className="text-caption text-muted-foreground">
          Đo bằng cách đối chiếu trích dẫn với bài làm — không phải AI tự chấm.
        </p>

        <div>
          <span className="section-label mb-1 block">Trích dẫn từ bài làm</span>
          <div
            style={{ borderLeftColor: `hsl(${hueFor(index)})` }}
            className="rounded-r-sm border-l-[3px] bg-surface-2 px-3 py-2 text-small leading-relaxed"
          >
            {criterion.evidence ? `„${criterion.evidence}”` : 'AI không đưa trích dẫn nào.'}
            {criterion.check === 'unverified' && (
              <p className="mt-1.5 text-caption font-semibold text-danger-strong">
                Đối chiếu từng chữ: câu này không có trong bài làm. AI đã diễn giải lại thay vì
                trích nguyên văn.
              </p>
            )}
          </div>
        </div>

        {children}

        <div className="flex flex-col gap-2">
          <span className="section-label">Cho điểm lại</span>
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

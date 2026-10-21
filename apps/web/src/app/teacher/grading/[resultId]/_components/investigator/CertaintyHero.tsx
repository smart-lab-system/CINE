'use client';

import { Badge } from '@/components/ui/badge';
import { SOURCE_LABEL } from '@/lib/grading-vocab';
import type { Agreement, ConfidenceTerm } from '@/lib/api/grading';
import { percentOf } from './ConfidenceBreakdown';

/**
 * Khoảng trên ngưỡng θ mà từ đó bài được gọi là "đạt ngưỡng" rõ ràng; trong [θ, θ + khoảng) là "vừa đủ ngưỡng". Đây là
 * cách trình bày cho giảng viên, KHÔNG phải luật tự chốt: luật vẫn là confidence ≥ θ ở backend.
 */
const COMFORT_MARGIN = 0.05;

export type CertaintyState = 'reached' | 'borderline' | 'below' | 'unmeasured' | 'paused';

/**
 * Trạng thái của hero (§5.8b). Bài không có lỗi nào, hoặc thuộc loại đã tạm dừng tự chốt, KHÔNG có số %: giá trị nội
 * bộ 1,0 của bài sạch chỉ nói về độ phủ, không phải mức chắc chắn để đưa cho giảng viên.
 */
export function certaintyState(input: {
  confidence: number | null;
  theta: number;
  hasPricedErrors: boolean;
  paused: boolean;
}): CertaintyState {
  if (input.paused) return 'paused';
  if (!input.hasPricedErrors || input.confidence === null) return 'unmeasured';
  if (input.confidence >= input.theta + COMFORT_MARGIN) return 'reached';
  if (input.confidence >= input.theta) return 'borderline';
  return 'below';
}

/** Cộng dồn độ khớp của các quy tắc trong bài: "Bạn đồng ý N/M lần" (§5.8b). */
export function sumAgreement(parts: Agreement[]): Agreement {
  return parts.reduce<Agreement>(
    (sum, p) => ({ n: sum.n + p.n, disagreements: sum.disagreements + p.disagreements, paused: sum.paused || p.paused }),
    { n: 0, disagreements: 0, paused: false },
  );
}

const CHIP: Record<CertaintyState, { label: string; variant: 'success' | 'info' | 'warning' | 'outline' | 'destructive' }> = {
  reached: { label: 'Đạt ngưỡng', variant: 'success' },
  borderline: { label: 'Vừa đủ ngưỡng', variant: 'info' },
  below: { label: 'Chưa đạt ngưỡng', variant: 'warning' },
  unmeasured: { label: 'Bài không có lỗi nào', variant: 'outline' },
  paused: { label: 'Đã tạm dừng tự chốt cho loại bài này', variant: 'destructive' },
};

/**
 * Hero đầu khối quyết định (§5.8b): số % lớn, thanh có vạch ngưỡng θ, chip bằng chữ (không chỉ dựa vào màu), dòng nêu
 * lỗi kéo mức thấp nhất, và độ khớp với giảng viên đặt cạnh số %.
 */
export function CertaintyHero({
  confidence,
  theta,
  terms,
  agreement,
}: {
  confidence: number | null;
  theta: number;
  terms: ConfidenceTerm[];
  agreement: Agreement;
}) {
  const state = certaintyState({ confidence, theta, hasPricedErrors: terms.length > 0, paused: agreement.paused });
  const unmeasured = state === 'unmeasured' || state === 'paused';
  const lowest = terms.reduce<ConfidenceTerm | null>((min, t) => (min === null || t.cap < min.cap ? t : min), null);
  const shortBy = state === 'below' && confidence !== null ? Math.round((theta - confidence) * 100) : null;
  const chip = CHIP[state];
  const agreed = agreement.n - agreement.disagreements;

  return (
    <section aria-label="Mức chắc chắn của bài" className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        {unmeasured ? (
          <span className="text-h2 font-semibold text-muted-foreground">Chưa đo được</span>
        ) : (
          <span className="text-[56px] font-semibold leading-none tabular-nums">{percentOf(confidence!)}</span>
        )}
        <Badge variant={chip.variant}>
          {chip.label}
          {shortBy !== null && ` · thiếu ${shortBy} điểm phần trăm`}
        </Badge>
      </div>

      <div
        role="img"
        aria-label={unmeasured ? 'Chưa đo được' : `Mức chắc chắn ${percentOf(confidence!)}, ngưỡng ${percentOf(theta)}`}
        className={`relative h-3 w-full rounded-full ${unmeasured ? 'border border-dashed border-border' : 'bg-muted'}`}
      >
        {!unmeasured && (
          <div className="h-full rounded-full bg-accent" style={{ width: `${Math.round(confidence! * 100)}%` }} />
        )}
        {!unmeasured && (
          <div
            aria-hidden="true"
            data-testid="threshold-marker"
            className="absolute top-[-4px] h-5 w-0.5 bg-foreground"
            style={{ left: `${Math.round(theta * 100)}%` }}
          />
        )}
      </div>

      {state === 'unmeasured' && (
        <p className="text-small text-warning-strong">Không thấy lỗi không có nghĩa là bài đúng.</p>
      )}
      {lowest && !unmeasured && (
        <p className="text-small text-muted-foreground">
          Lỗi kéo mức thấp nhất: <span className="font-medium text-foreground">{lowest.ruleKey}</span> (
          {SOURCE_LABEL[lowest.source].label}, trần {percentOf(lowest.cap)})
        </p>
      )}
      <p className="text-small">
        <span className="font-medium">Độ khớp với bạn: </span>
        {agreement.n === 0 ? 'chưa có bài kiểm tra ngẫu nhiên nào' : `bạn đồng ý ${agreed}/${agreement.n} lần`}
      </p>
    </section>
  );
}

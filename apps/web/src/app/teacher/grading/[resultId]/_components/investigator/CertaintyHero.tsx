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
 * Trạng thái của hero (§5.8b). Mọi bài có confidence đều hiện số %, kể cả bài không có lỗi nào (quyết định của chủ dự án
 * 27/11/2026: số % là minh chứng cho độ chính xác của hệ thống). Chỉ bài thuộc loại đã tạm dừng tự chốt, hoặc chưa có
 * confidence, mới là "chưa đo được".
 */
export function certaintyState(input: {
  confidence: number | null;
  theta: number;
  paused: boolean;
}): CertaintyState {
  if (input.paused) return 'paused';
  if (input.confidence === null) return 'unmeasured';
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
  unmeasured: { label: 'Chưa có mức chắc chắn', variant: 'outline' },
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
  const state = certaintyState({ confidence, theta, paused: agreement.paused });
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

      {terms.length === 0 && !unmeasured && (
        <p className="text-small text-muted-foreground">
          Bài không có lỗi nào: mức này đến từ mức kiểm tra bài (độ phủ), không phải từ một lỗi cụ thể.
        </p>
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

'use client';

import { Badge, type BadgeProps } from '@/components/ui/badge';
import type { ResultDetail, ResultDetailError } from '@/lib/api/grading';

const SOURCE_LABEL: Record<ResultDetailError['source'], { label: string; variant: BadgeProps['variant'] }> = {
  deterministic: { label: 'Máy quyết', variant: 'accent' },
  llm_with_tools: { label: 'Model + công cụ', variant: 'info' },
  llm_only: { label: 'Chỉ model', variant: 'warning' },
};

export function DiagnosedErrorList({ breakdown }: { breakdown: NonNullable<ResultDetail['breakdown']> }) {
  const flagsByRule = new Map(breakdown.errorFlags.map((f) => [f.ruleKey, f.code]));
  return (
    <section className="flex flex-col gap-2">
      <h3 className="section-label">Lỗi chẩn đoán ({breakdown.errors.length})</h3>
      <ul className="flex flex-col gap-2">
        {breakdown.errors.map((error) => (
          <li key={error.ruleId} className="rounded-md border border-border bg-surface p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{error.ruleKey}</span>
              <span className="text-caption text-muted-foreground">{error.ruleName}</span>
              <Badge variant={SOURCE_LABEL[error.source].variant}>{SOURCE_LABEL[error.source].label}</Badge>
              {error.counted === 'excluded' && <Badge variant="outline">Đã bỏ cho bài này</Badge>}
              {flagsByRule.get(error.ruleKey) === 'unpriced' && <Badge variant="warning">chưa có giá</Badge>}
            </div>
            <p className="mt-1 text-caption text-muted-foreground">
              Tiêu chí {error.criterionKey}
              {error.deductionHundredths !== null && ` · trừ ${(error.deductionHundredths / 100).toFixed(2)}`}
            </p>
          </li>
        ))}
      </ul>
      {breakdown.mismatchedRules.length > 0 && (
        <p className="border-l-2 border-warning pl-2.5 text-caption text-warning-strong">
          {breakdown.mismatchedRules.length} luật trỏ tiêu chí không có trong rubric của bài này — xem lại ở Trang
          kiến thức.
        </p>
      )}
    </section>
  );
}

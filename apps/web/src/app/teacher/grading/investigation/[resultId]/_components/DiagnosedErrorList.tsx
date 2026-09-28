'use client';

import { Badge, type BadgeProps } from '@/components/ui/badge';
import type { ChallengeVerdict, ResultDetail, ResultDetailError } from '@/lib/api/grading';
import { lensLabel } from './lens-labels';

const SOURCE_LABEL: Record<ResultDetailError['source'], { label: string; variant: BadgeProps['variant'] }> = {
  deterministic: { label: 'Máy quyết', variant: 'accent' },
  llm_with_tools: { label: 'Model + công cụ', variant: 'info' },
  llm_only: { label: 'Chỉ model', variant: 'warning' },
};

const VERDICT_LABEL: Record<ChallengeVerdict['status'], { label: string; variant: BadgeProps['variant'] }> = {
  confirmed: { label: 'xác nhận', variant: 'success' },
  refuted: { label: 'bác bỏ', variant: 'destructive' },
  unverified: { label: 'chưa xác minh', variant: 'warning' },
};

function LensVerdicts({ verdicts }: { verdicts: ChallengeVerdict[] }) {
  if (verdicts.length === 0) return null;
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      <span className="text-caption text-muted-foreground">Phản biện:</span>
      {verdicts.map((v) => (
        <Badge key={v.lens} variant={VERDICT_LABEL[v.status].variant} title={v.reason ?? undefined}>
          {`${lensLabel(v.lens)}: ${VERDICT_LABEL[v.status].label}`}
        </Badge>
      ))}
    </div>
  );
}

export function DiagnosedErrorList({
  breakdown,
  verdicts = [],
}: {
  breakdown: NonNullable<ResultDetail['breakdown']>;
  verdicts?: ChallengeVerdict[];
}) {
  const flagsByRule = new Map<string, Set<string>>();
  for (const f of breakdown.errorFlags) {
    const codes = flagsByRule.get(f.ruleKey) ?? new Set<string>();
    codes.add(f.code);
    flagsByRule.set(f.ruleKey, codes);
  }
  const verdictsByRule = new Map<string, ChallengeVerdict[]>();
  for (const v of verdicts) verdictsByRule.set(v.ruleKey, [...(verdictsByRule.get(v.ruleKey) ?? []), v]);
  const challengeRan = verdicts.length > 0;
  return (
    <section className="flex flex-col gap-2">
      <h3 className="section-label">Lỗi chẩn đoán ({breakdown.errors.length})</h3>
      <ul className="flex flex-col gap-2">
        {breakdown.errors.map((error) => (
          <li
            key={error.ruleId}
            className={`rounded-md border border-border bg-surface p-3 ${error.counted === 'refuted' ? 'opacity-60' : ''}`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className={`font-medium ${error.counted === 'refuted' ? 'line-through' : ''}`}>{error.ruleKey}</span>
              <span className="text-caption text-muted-foreground">{error.ruleName}</span>
              <Badge variant={SOURCE_LABEL[error.source].variant}>{SOURCE_LABEL[error.source].label}</Badge>
              {error.counted === 'excluded' && <Badge variant="outline">Đã bỏ cho bài này</Badge>}
              {error.counted === 'refuted' && (
                <Badge variant="destructive" title="Chỉ cần một lăng kính bác bỏ (có tự chạy thử) là lỗi bị loại khỏi điểm, dù lăng kính khác xác nhận. Lỗi vẫn giữ trong hồ sơ.">
                  Bị bác bỏ (phản biện)
                </Badge>
              )}
              {flagsByRule.get(error.ruleKey)?.has('unpriced') && <Badge variant="warning">chưa có giá</Badge>}
              {flagsByRule.get(error.ruleKey)?.has('unverified') && (
                <Badge variant="warning" title="Không lăng kính nào kết luận được về lỗi này. Lỗi vẫn bị trừ, nhưng bài không được tự duyệt.">
                  Chưa xác minh
                </Badge>
              )}
            </div>
            <p className="mt-1 text-caption text-muted-foreground">
              Tiêu chí {error.criterionKey}
              {error.deductionHundredths !== null && ` · trừ ${(error.deductionHundredths / 100).toFixed(2)}`}
            </p>
            {error.source === 'deterministic' && challengeRan && (
              <p className="mt-1 text-caption text-muted-foreground">
                Không đưa phản biện — lỗi máy quyết, đo từ lần chạy thật, không do model phán.
              </p>
            )}
            <LensVerdicts verdicts={verdictsByRule.get(error.ruleKey) ?? []} />
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

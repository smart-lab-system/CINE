'use client';

import { Badge } from '@/components/ui/badge';
import type { ResultDetail } from '@/lib/api/grading';

export function ScoreSummary({ detail }: { detail: ResultDetail }) {
  if (detail.ungradableClass) {
    return (
      <section className="rounded-lg border border-destructive/60 bg-destructive/5 p-4">
        <p className="text-small font-semibold text-destructive">Không chấm được — {detail.ungradableClass}</p>
        <p className="mt-1 text-small text-muted-foreground">{detail.ungradableReason}</p>
      </section>
    );
  }
  return (
    <section className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-surface p-4">
      <span className="text-3xl font-semibold tabular-nums">
        {detail.currentScore === null ? '—' : detail.currentScore}
      </span>
      {/* Nguồn thật: manual | review | finalized | computation | ai | none (§14.2, CurrentScore.source). */}
      <Badge variant={detail.currentScoreSource === 'computation' ? 'accent' : 'info'}>
        {detail.currentScoreSource}
      </Badge>
      {detail.breakdown?.perCriterion.map((c) => (
        <span key={c.key} className="text-caption text-muted-foreground">
          {c.key}: {(c.deductedHundredths / 100).toFixed(2)}/{(c.maxHundredths / 100).toFixed(2)}
          {c.capped && ' (chạm trần)'}
        </span>
      ))}
    </section>
  );
}

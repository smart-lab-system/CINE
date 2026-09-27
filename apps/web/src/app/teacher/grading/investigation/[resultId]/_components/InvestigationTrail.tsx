'use client';

import type { ResultDetail } from '@/lib/api/grading';

export function InvestigationTrail({ investigation }: { investigation: NonNullable<ResultDetail['investigation']> }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="section-label">Đường điều tra</h3>
      <p className="rounded-md border-l-2 border-primary bg-surface p-3 text-small">{investigation.summary}</p>
      <ul className="flex flex-col gap-1.5">
        {investigation.investigation.toolCalls.map((call) => (
          <li key={call.id} className="flex items-center gap-2 rounded-md border border-border p-2 text-small">
            <span className="font-mono text-caption text-muted-foreground">{call.id}</span>
            <span className="font-medium">{call.tool}</span>
            <span className="text-caption text-muted-foreground">
              {call.status} · {call.wallMs}ms
            </span>
            {call.injectionSuspected && (
              <span className="text-caption font-semibold text-destructive">nghi ngờ injection</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

'use client';

import { useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { toolActionLabel } from '@/lib/grading-vocab';
import type { ResultDetail } from '@/lib/api/grading';

export function InvestigationTrail({ investigation }: { investigation: NonNullable<ResultDetail['investigation']> }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const calls = investigation.investigation.toolCalls;

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <h2 className="section-label">Đường điều tra</h2>
        <span className="text-caption text-muted-foreground">{calls.length} lời gọi</span>
      </div>
      <p className="rounded-md border-l-2 border-primary bg-surface p-3 text-small">{investigation.summary}</p>
      <ol className="flex flex-col gap-1.5">
        {calls.map((call) => {
          const ok = call.status === 'ok';
          const open = openId === call.id;
          return (
            <li key={call.id} className="rounded-md border border-border">
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpenId(open ? null : call.id)}
                className="flex w-full items-center gap-2 p-2 text-left text-small"
              >
                <span className="w-6 text-caption text-muted-foreground">#{call.id.replace('tc-', '')}</span>
                <span className="flex-grow font-medium">{toolActionLabel(call.tool)}</span>
                <span className="font-mono text-caption text-muted-foreground">{call.tool}</span>
                {ok ? (
                  <CheckCircle2 className="h-4 w-4 text-success-strong" aria-hidden="true" />
                ) : (
                  <XCircle className="h-4 w-4 text-danger-strong" aria-hidden="true" />
                )}
                <span className="w-14 text-right text-caption text-muted-foreground">{call.wallMs}ms</span>
              </button>
              {open && (
                <div className="border-t border-border p-2.5 pl-10">
                  <pre className="max-h-64 overflow-y-auto rounded-md bg-foreground p-2.5 font-mono text-caption text-background">
                    {call.output}
                  </pre>
                  <p className="mt-1.5 text-caption text-muted-foreground">Đầu ra cắt tối đa 8 KB mỗi lời gọi.</p>
                  {call.injectionSuspected && (
                    <p className="mt-1 text-caption font-semibold text-destructive">Nghi ngờ chỉ thị nhắm vào AI chấm.</p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

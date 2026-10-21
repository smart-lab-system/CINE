'use client';

import { useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { toolActionLabel, toolCallStatusLabel } from '@/lib/grading-vocab';
import type { ResultDetail } from '@/lib/api/grading';

/**
 * Đường điều tra (§2.1). Mỗi bước có neo `id` ổn định (`tc-N`) để thẻ lỗi cuộn tới đúng dòng; `citedBy` ghi ngược lại
 * bước này là bằng chứng của lỗi nào. Không hiện tên công cụ nội bộ — chỉ hiện việc đã làm.
 */
export function InvestigationTrail({
  investigation,
  citedBy = {},
}: {
  investigation: NonNullable<ResultDetail['investigation']>;
  citedBy?: Record<string, string[]>;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const calls = investigation.investigation.toolCalls;

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <h2 className="section-label">Các bước hệ thống đã làm</h2>
        <span className="text-caption text-muted-foreground">{calls.length} bước</span>
      </div>
      <p className="rounded-md border-l-2 border-primary bg-surface p-3 text-small">{investigation.summary}</p>
      <ol className="flex flex-col gap-1.5">
        {calls.map((call) => {
          const ok = call.status === 'ok';
          const open = openId === call.id;
          const evidenceFor = citedBy[call.id] ?? [];
          return (
            <li key={call.id} id={call.id} className="scroll-mt-20 rounded-md border border-border">
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpenId(open ? null : call.id)}
                className="flex w-full items-center gap-2 p-2 text-left text-small"
              >
                <span className="w-6 text-caption text-muted-foreground">#{call.id.replace('tc-', '')}</span>
                <span className="flex-grow font-medium">{toolActionLabel(call.tool)}</span>
                {evidenceFor.length > 0 && (
                  <span className="text-caption text-muted-foreground">bằng chứng cho {evidenceFor.join(', ')}</span>
                )}
                {ok ? (
                  <CheckCircle2 className="h-4 w-4 text-success-strong" aria-hidden="true" />
                ) : (
                  <XCircle className="h-4 w-4 text-danger-strong" aria-hidden="true" />
                )}
                <span className={`text-caption font-medium ${ok ? 'text-success-strong' : 'text-danger-strong'}`}>
                  {toolCallStatusLabel(call.status)}
                </span>
                <span className="w-14 text-right text-caption text-muted-foreground">{call.wallMs}ms</span>
              </button>
              {open && (
                <div className="border-t border-border p-2.5 pl-10">
                  <pre className="max-h-64 overflow-y-auto rounded-md bg-foreground p-2.5 font-mono text-caption text-background">
                    {call.output}
                  </pre>
                  <p className="mt-1.5 text-caption text-muted-foreground">Đầu ra cắt tối đa 8 KB mỗi bước.</p>
                  {call.injectionSuspected && (
                    <p className="mt-1 text-caption font-semibold text-destructive">
                      Bài có chỗ giống lời dặn gửi cho hệ thống chấm.
                    </p>
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

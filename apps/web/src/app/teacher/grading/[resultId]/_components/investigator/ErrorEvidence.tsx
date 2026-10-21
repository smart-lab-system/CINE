'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SOURCE_LABEL, VERDICT_LABEL, lensLabel, toolActionLabel, toolCallStatusLabel } from '@/lib/grading-vocab';
import { predicateText } from '@/lib/predicate-text';
import type { ChallengeVerdict, ResultDetailError, StructuredRunTests, ToolCallView } from '@/lib/api/grading';

/** Một đoạn mã có vị trí trong bài (E2, §5.9). Hồ sơ trước E2 không có. */
export interface ErrorEvidenceItem {
  file: string;
  startLine: number | null;
  endLine: number | null;
  quote: string;
  verified: boolean;
}

/** Số dòng tối đa được hiện nguyên; đoạn dài hơn thì chỉ hiện đầu và cuối (§5.8, mục 3). */
const FOLD_AFTER = 6;

const CASE_STATUS_TEXT: Record<string, string> = {
  pass: 'Đạt',
  fail: 'Không đạt',
  timeout: 'Hết giờ',
  ran: 'Chưa có đáp án để đối chiếu',
};

const callNumber = (id: string) => id.replace('tc-', '');
const failing = (status: string) => status !== 'pass';

/**
 * Phần "Vì sao lỗi này" của một thẻ lỗi (§5.8): luật và điều kiện đo, cách phát hiện với mức chắc chắn, bằng chứng
 * theo thứ tự có thì hiện (ca kiểm thử, lời gọi, đoạn mã), và kết luận của các góc kiểm lại. Chỉ hiển thị.
 */
export function ErrorEvidence({
  error,
  toolCalls,
  structuredResults,
  verdicts,
  note,
  evidence,
}: {
  error: ResultDetailError;
  toolCalls: ToolCallView[];
  structuredResults?: Record<string, { kind: string } | StructuredRunTests>;
  verdicts: ChallengeVerdict[];
  note: string | null;
  evidence?: ErrorEvidenceItem[];
}) {
  const source = SOURCE_LABEL[error.source];
  const calls = error.toolCallIds.map((id) => ({ id, call: toolCalls.find((c) => c.id === id) }));
  const hasEvidence = calls.length > 0 || (evidence?.length ?? 0) > 0;

  return (
    <div className="flex flex-col gap-3 text-small">
      <div className="flex flex-col gap-0.5">
        <p>
          <span className="font-medium">Điều kiện:</span> {predicateText(error.predicate)}
        </p>
        {error.ruleDescription && <p className="text-muted-foreground">{error.ruleDescription}</p>}
      </div>

      <p>
        <span className="font-medium">Cách phát hiện:</span> {source.explain}
      </p>

      <section aria-label="Bằng chứng" className="flex flex-col gap-2">
        {!hasEvidence && (
          <p className="text-caption text-muted-foreground">
            Chưa có bằng chứng kèm theo; đây mới là nhận định của hệ thống.
          </p>
        )}
        {calls.map(({ id, call }) =>
          call ? (
            <CallEvidence
              key={id}
              call={call}
              structured={call.structuredRef ? structuredResults?.[call.structuredRef] : undefined}
            />
          ) : (
            <p key={id} className="text-caption text-warning-strong">
              Bước #{callNumber(id)} không còn trong hồ sơ.
            </p>
          ),
        )}
        {(evidence ?? []).map((item, i) => (
          <CodeEvidence key={`${item.file}-${i}`} item={item} />
        ))}
      </section>

      {verdicts.map((v) => (
        <div key={`${v.lens}-${v.ruleKey}`} className={`flex flex-col gap-1 rounded-md p-2 ${VERDICT_LABEL[v.status].tintClass}`}>
          <p>
            <span className="font-medium">Hệ thống kiểm lại: “{lensLabel(v.lens)}”</span>{' '}
            <Badge variant={VERDICT_LABEL[v.status].variant}>{VERDICT_LABEL[v.status].label}</Badge>
          </p>
          <p className="text-muted-foreground">{v.reason ?? 'Chưa có lý do kèm theo'}</p>
          {v.toolCallIds.length > 0 && (
            <p className="text-caption">
              Căn cứ:{' '}
              {v.toolCallIds.map((id) => (
                <a key={id} href={`#${id}`} className="mr-2 font-medium text-accent-strong hover:underline">
                  #{callNumber(id)}
                </a>
              ))}
            </p>
          )}
        </div>
      ))}

      {note && <p className="text-muted-foreground">{note}</p>}
    </div>
  );
}

/** Một lời gọi công cụ làm căn cứ. Với `run_tests`, liệt kê ca: ca không đạt đứng trước (§5.8, mục 3). */
function CallEvidence({ call, structured }: { call: ToolCallView; structured?: { kind: string } | StructuredRunTests }) {
  const cases = structured?.kind === 'run_tests' ? [...(structured as StructuredRunTests).cases].sort((a, b) => Number(failing(b.status)) - Number(failing(a.status))) : null;

  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-border p-2">
      <p>
        <a href={`#${call.id}`} className="font-medium text-accent-strong hover:underline">
          #{callNumber(call.id)}
        </a>{' '}
        <span className="font-medium">{toolActionLabel(call.tool)}</span>{' '}
        <span className="text-caption text-muted-foreground">· {toolCallStatusLabel(call.status)}</span>
      </p>
      {cases && cases.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {cases.map((c) => (
            <li key={c.name} className={failing(c.status) ? 'font-medium text-danger-strong' : 'text-muted-foreground'}>
              {c.name}
              {c.group ? ` · nhóm ${c.group}` : ''} · {CASE_STATUS_TEXT[c.status] ?? c.status}
              {c.diff && <pre className="mt-1 max-h-24 overflow-hidden rounded bg-muted p-1.5 font-mono text-caption">{c.diff.slice(0, 200)}</pre>}
            </li>
          ))}
        </ul>
      ) : (
        call.output && (
          <pre className="max-h-24 overflow-hidden rounded bg-muted p-1.5 font-mono text-caption">{call.output.slice(0, 240)}</pre>
        )
      )}
    </div>
  );
}

/** Một đoạn mã làm bằng chứng. Đoạn dài thì gấp phần giữa; đã/chưa đối chiếu được với bài hiện ngay dưới (E2). */
function CodeEvidence({ item }: { item: ErrorEvidenceItem }) {
  const [open, setOpen] = useState(false);
  const lines = item.quote.split('\n');
  const folded = !open && lines.length > FOLD_AFTER;
  const hidden = lines.length - 5;
  const shown = folded ? [...lines.slice(0, 3), `… còn ${hidden} dòng ẩn …`, ...lines.slice(-2)] : lines;
  const where =
    item.startLine === null
      ? item.file
      : `${item.file}:${item.startLine}${item.endLine !== null && item.endLine !== item.startLine ? `–${item.endLine}` : ''}`;

  return (
    <div className="flex flex-col gap-1 rounded-md border border-border p-2">
      <p className="font-mono text-caption text-muted-foreground">{where}</p>
      <pre className="overflow-x-auto rounded bg-muted p-1.5 font-mono text-caption">{shown.join('\n')}</pre>
      {lines.length > FOLD_AFTER && (
        <Button variant="link" className="h-auto justify-start p-0" onClick={() => setOpen(!open)}>
          {open ? 'Thu gọn' : `Hiện cả đoạn: còn ${hidden} dòng ẩn`}
        </Button>
      )}
      {item.verified ? (
        <p className="text-caption text-success-strong">Đã đối chiếu: đoạn này đúng là có trong bài.</p>
      ) : (
        <p className="text-caption text-warning-strong">
          Chưa đối chiếu được: không tìm thấy đoạn này trong bài, nên không dùng làm bằng chứng.
        </p>
      )}
    </div>
  );
}

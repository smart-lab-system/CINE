'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useSetErrorException } from '@/hooks/useGrading';
import { SOURCE_LABEL } from '@/lib/grading-vocab';
import { formatVnPoints } from '@/lib/format';
import type { ResultDetailError, ChallengeVerdict, StructuredRunTests, ToolCallView } from '@/lib/api/grading';
import { RULES_PATH } from '@/lib/rules-links';
import { ErrorEvidence } from './ErrorEvidence';
import { percentOf } from './ConfidenceBreakdown';

/** Trạng thái mà một lỗi vẫn sửa được (§4.3 EDITABLE, review/error-exception.service.ts). */
const EDITABLE = new Set(['auto_approved', 'flagged_for_review', 'teacher_reviewed']);

export function ErrorList({
  resultId,
  sessionId,
  status,
  errors,
  errorFlags,
  verdicts,
  investigationNotes,
  toolCalls = [],
  structuredResults,
  rulesHref = RULES_PATH,
}: {
  resultId: string;
  sessionId: string;
  status: string;
  errors: ResultDetailError[];
  errorFlags: { ruleKey: string; code: string }[];
  verdicts: ChallengeVerdict[];
  investigationNotes: { ruleKey: string; toolCallIds: string[]; note: string | null }[];
  /** Đường điều tra; rỗng khi bài không có điều tra (bằng chứng chỉ hiện khi có). */
  toolCalls?: ToolCallView[];
  structuredResults?: Record<string, { kind: string } | StructuredRunTests>;
  rulesHref?: string;
}) {
  const setException = useSetErrorException(sessionId);
  const editable = EDITABLE.has(status);
  // "Vì sao bị trừ điểm" mở sẵn khi bài đang chờ giảng viên xem; ở trạng thái khác thì đóng, bấm mới mở (§5.8).
  const flagged = status === 'flagged_for_review';

  const verdictsByRule = new Map<string, ChallengeVerdict[]>();
  for (const v of verdicts) verdictsByRule.set(v.ruleKey, [...(verdictsByRule.get(v.ruleKey) ?? []), v]);
  const unverifiedByRule = new Set(errorFlags.filter((f) => f.code === 'unverified').map((f) => f.ruleKey));

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <h2 className="section-label">Lỗi chẩn đoán được</h2>
        <span className="text-caption text-muted-foreground">
          {errors.filter((e) => e.counted === 'counted').length} lỗi đã trừ
          {errors.some((e) => e.counted === 'refuted') && ` · ${errors.filter((e) => e.counted === 'refuted').length} bị bác bỏ`}
          {errors.some((e) => e.counted === 'excluded') && ` · ${errors.filter((e) => e.counted === 'excluded').length} đã bỏ cho bài này`}
          {errors.some((e) => e.counted === 'unpriced') && ` · ${errors.filter((e) => e.counted === 'unpriced').length} chờ giá`}
        </span>
      </div>

      {setException.isError && (
        <Alert variant="destructive">
          <AlertDescription>{setException.error.message}</AlertDescription>
        </Alert>
      )}

      <ul className="flex flex-col gap-2">
        {errors.map((error) => {
          const source = SOURCE_LABEL[error.source];
          const rowVerdicts = verdictsByRule.get(error.ruleKey) ?? [];
          const refuted = error.counted === 'refuted';
          const excluded = error.counted === 'excluded';
          const unpriced = error.counted === 'unpriced';
          const notCounted = refuted || excluded;
          const busy = setException.isPending;
          const unverified = unverifiedByRule.has(error.ruleKey);
          const note = investigationNotes.find((n) => n.ruleKey === error.ruleKey)?.note ?? null;

          return (
            <li
              key={error.ruleId}
              className={`flex flex-col gap-1.5 rounded-md border border-border bg-surface p-3 ${notCounted ? 'opacity-70' : ''}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className={`font-medium ${notCounted ? 'line-through' : ''}`}>{error.ruleKey}</span>
                <span className="text-caption text-muted-foreground">
                  {error.ruleName} · {error.criterionKey}
                </span>
                <Badge variant={source.variant}>{source.label}</Badge>
                <span className="text-caption text-muted-foreground">Chắc chắn {percentOf(source.certaintyPercent / 100)}</span>
                {unpriced && <Badge variant="warning">Chờ giá — chưa trừ</Badge>}
                {unverified && !notCounted && (
                  <Badge variant="warning">Chưa xác minh — vẫn bị trừ, nhưng bài không được tự duyệt</Badge>
                )}
                {excluded && <Badge variant="outline">Đã bỏ cho bài này</Badge>}
                <span className="ml-auto font-semibold tabular-nums">
                  {notCounted ? '0' : unpriced ? '—' : formatVnPoints(-error.deductionHundredths! / 100)}
                </span>
              </div>

              <details open={flagged} className="group">
                <summary className="cursor-pointer text-small font-medium text-accent-strong">Vì sao bị trừ điểm</summary>
                <div className="mt-2">
                  <ErrorEvidence
                    error={error}
                    toolCalls={toolCalls}
                    structuredResults={structuredResults}
                    verdicts={rowVerdicts}
                    note={note}
                  />
                </div>
              </details>

              {editable && (
                <div className="flex flex-wrap items-center gap-3 text-small">
                  {refuted && (
                    <>
                      <Button
                        variant="link"
                        className="h-auto p-0"
                        disabled={busy}
                        onClick={() => setException.mutate({ resultId, ruleId: error.ruleId, direction: 'exclude' })}
                      >
                        Đồng ý bác bỏ
                      </Button>
                      <Button
                        variant="link"
                        className="h-auto p-0"
                        disabled={busy}
                        onClick={() => setException.mutate({ resultId, ruleId: error.ruleId, direction: 'include' })}
                      >
                        Không đồng ý — giữ lỗi này cho riêng bài này
                      </Button>
                      <span className="text-caption text-muted-foreground">
                        Quyết định này chỉ áp cho bài này và được ghi lại; sau đó chỉ đổi được chiều, không quay về
                        kết luận của hệ thống.
                      </span>
                    </>
                  )}
                  {excluded && (
                    <Button
                      variant="link"
                      className="h-auto p-0"
                      disabled={busy}
                      onClick={() => setException.mutate({ resultId, ruleId: error.ruleId, direction: 'include' })}
                    >
                      Giữ lại lỗi này
                    </Button>
                  )}
                  {!notCounted && unverified && (
                    <Button
                      variant="link"
                      className="h-auto p-0"
                      disabled={busy}
                      onClick={() => setException.mutate({ resultId, ruleId: error.ruleId, direction: 'exclude' })}
                    >
                      Bỏ lỗi cho riêng bài này
                    </Button>
                  )}
                  {!notCounted && !unverified && (
                    <>
                      <Link href={rulesHref} className="font-medium text-accent-strong hover:underline">
                        Sửa luật này
                      </Link>
                      <Button
                        variant="link"
                        className="h-auto p-0"
                        disabled={busy}
                        onClick={() => setException.mutate({ resultId, ruleId: error.ruleId, direction: 'exclude' })}
                      >
                        Bỏ lỗi này cho riêng bài này
                      </Button>
                    </>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

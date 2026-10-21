'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useGradingResults, useRubrics } from '@/hooks/useGrading';
import {
  useAutoBreakers,
  useConfirmReviewGroup,
  useOpenedResults,
  useResetAutoBreaker,
  useReviewGroups,
} from '@/hooks/useReviewGroups';
import type { GradingResult } from '@/lib/api/grading';
import { ApiStatusError } from '@/lib/api/error';
import type { ConfirmOutcome, ConfirmSkipReason, OpenAutoBreaker, ReviewGroup } from '@/lib/api/review-groups';
import { formatVnPoints } from '@/lib/format';

/**
 * Chữ cho giảng viên theo nguồn lỗi (spec §5.8a). Con số là trần độ chắc chắn của nguồn đó.
 * Giữ ở đây thay vì dùng `grading-vocab`: bảng đó còn mang nhãn cũ cho tới khi giao diện chi tiết được làm lại.
 */
const SOURCE: Record<string, { label: string; pct: number }> = {
  deterministic: { label: 'Chạy bài kiểm tra', pct: 100 },
  llm_with_tools: { label: 'Đọc code + chạy thử', pct: 85 },
  llm_only: { label: 'Đọc code, nhận định', pct: 50 },
};

const SKIP_TEXT: Record<ConfirmSkipReason, string> = {
  has_manual: 'bạn đã chấm tay bài này',
  not_flagged: 'bài không còn ở trạng thái cần xem',
  ungradable: 'hệ thống không chấm được bài này',
  no_computation: 'chưa có kết quả chấm',
  not_investigator: 'không thuộc luồng điều tra',
};

const MULTI_TITLE = 'Nhiều lỗi khác nhau';
const NONE_TITLE = 'Hệ thống không thấy lỗi nhưng vẫn cần bạn xem';

type OpenDialog = { kind: 'confirm'; group: ReviewGroup } | { kind: 'reset'; breaker: OpenAutoBreaker } | null;

/** Khoá nhóm `single` là `${rubricVersionId}:${ruleId}`. Chỉ tách để HIỂN THỊ tên thang chấm; khoá gửi đi vẫn nguyên văn. */
function rubricVersionOf(group: ReviewGroup): string | null {
  return group.kind === 'single' ? (group.key.split(':')[0] ?? null) : null;
}

function certainty(group: ReviewGroup): string {
  const pcts = group.sources.map((s) => SOURCE[s]?.pct).filter((p): p is number => p !== undefined);
  if (pcts.length === 0) return 'Chưa đo được';
  const lo = Math.min(...pcts);
  const hi = Math.max(...pcts);
  return lo === hi ? `${hi}% chắc chắn` : `${lo}% đến ${hi}% chắc chắn`;
}

function sourceLabels(group: ReviewGroup): string {
  return group.sources
    .map((s) => SOURCE[s]?.label)
    .filter((label): label is string => label !== undefined)
    .join(' + ');
}

/** Số bài trong nhóm có từng loại cờ đáng ngờ. Chỉ đọc trường đã có trong triage của bài. */
function flagReasons(results: GradingResult[]): string[] {
  let injection = 0;
  let challenge = 0;
  for (const r of results) {
    const flags = r.triage?.caseFlags ?? [];
    if (flags.some((f) => f.code === 'investigation_flag' && f.detail.includes('injection_suspected'))) injection++;
    if (flags.some((f) => f.code === 'challenge_suspected')) challenge++;
  }
  const out: string[] = [];
  if (injection > 0) out.push(`bài có chỗ giống lời dặn gửi cho hệ thống chấm × ${injection}`);
  if (challenge > 0) out.push(`bước kiểm tra lại thấy đáng ngờ × ${challenge}`);
  return out;
}

function summarize(outcome: ConfirmOutcome, byId: Map<string, GradingResult>): string {
  const parts = [`Đã duyệt ${outcome.confirmed} bài.`];
  for (const s of outcome.skipped) {
    parts.push(`1 bài bỏ qua — ${SKIP_TEXT[s.reason]}: ${byId.get(s.resultId)?.studentName ?? s.resultId}`);
  }
  return parts.join(' ');
}

function scopeName(b: OpenAutoBreaker): string {
  return b.scope === 'rule' ? `lỗi ${b.ruleKey ?? b.ruleId ?? ''}` : 'bài không có lỗi';
}

function Modal({ titleId, title, children }: { titleId: string; title: string; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="flex w-full max-w-lg flex-col gap-4 rounded-xl border border-border bg-surface p-5 shadow-lg">
        <h3 id={titleId} className="font-semibold">{title}</h3>
        {children}
      </div>
    </div>
  );
}

function GroupRow({
  group,
  sessionId,
  byId,
  openedIds,
  paused,
  rubricLabel,
  onConfirm,
}: {
  group: ReviewGroup;
  sessionId: string;
  byId: Map<string, GradingResult>;
  openedIds: ReadonlySet<string>;
  paused: boolean;
  rubricLabel: string | null;
  onConfirm: (group: ReviewGroup) => void;
}) {
  const isSingle = group.kind === 'single';
  const title = isSingle ? group.label : group.kind === 'multi' ? MULTI_TITLE : NONE_TITLE;
  const total = group.resultIds.length;
  const openedHere = group.resultIds.filter((id) => openedIds.has(id)).length;
  const reasons = group.kind === 'none' ? flagReasons(group.resultIds.map((id) => byId.get(id)).filter((r): r is GradingResult => r !== undefined)) : [];
  const pausedText = group.kind === 'none' ? 'Đã tạm dừng tự chốt cho loại bài này' : 'Đã tạm dừng tự chốt';

  return (
    <article className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="font-semibold">{title}</h3>
          {group.description && <p className="text-small text-muted-foreground">{group.description}</p>}
          <p className="text-small">
            {sourceLabels(group)}
            {sourceLabels(group) && ' · '}
            {certainty(group)}
          </p>
          {rubricLabel && <p className="text-small text-muted-foreground">{rubricLabel}</p>}
          <p className="text-small text-muted-foreground">đã xem {openedHere}/{total}</p>
          {paused && <span className="w-fit rounded-md bg-danger-soft px-2 py-0.5 text-caption font-medium text-danger-strong">{pausedText}</span>}
        </div>
        <p className="flex items-baseline gap-1 text-2xl font-semibold tabular-nums">
          <span data-testid="group-count">{total}</span>
          <span className="text-small font-normal text-muted-foreground">bài</span>
        </p>
      </div>

      {group.kind === 'none' && (
        <div className="flex flex-col gap-2 text-small">
          <p>Hệ thống không thấy lỗi nào, nhưng vẫn gắn cờ nên chưa tự chốt. Với nhóm này, kết luận “không có lỗi” là kết luận khó chắc chắn nhất.</p>
          {reasons.length > 0 && <ul className="list-disc pl-5">{reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 text-small">
        {isSingle ? (
          group.sampleResultIds.map((id) => (
            <Link key={id} href={`/teacher/grading/${id}?sessionId=${sessionId}`} className="font-medium text-accent-strong hover:underline">
              {byId.get(id)?.studentMssv ?? id}
            </Link>
          ))
        ) : group.sampleResultIds[0] ? (
          <Link href={`/teacher/grading/${group.sampleResultIds[0]}?sessionId=${sessionId}`} className="font-medium text-accent-strong hover:underline">
            Xem từng bài
          </Link>
        ) : null}
        {isSingle && (
          <Button variant="default" onClick={() => onConfirm(group)}>
            Duyệt {total} bài…
          </Button>
        )}
      </div>
    </article>
  );
}

/**
 * Bài cần xem của phiên, gom theo lỗi, và các phạm vi đang tạm dừng tự chốt (spec duyệt nhanh §5.3–§5.4).
 * Không có nhóm nào và không có phạm vi nào tạm dừng thì không hiện gì.
 */
export function ReviewGroupsPanel({ sessionId }: { sessionId: string }) {
  const groups = useReviewGroups(sessionId);
  const breakers = useAutoBreakers();
  const results = useGradingResults(sessionId);
  const rubrics = useRubrics();
  const openedIds = useOpenedResults();
  const confirm = useConfirmReviewGroup(sessionId);
  const resetBreaker = useResetAutoBreaker();
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const groupList = groups.data ?? [];
  const breakerList = breakers.data ?? [];
  if (groupList.length === 0 && breakerList.length === 0) return null;

  const byId = new Map((results.data ?? []).map((r) => [r.id, r] as const));
  const noErrorPaused = breakerList.some((b) => b.scope === 'no_error');

  const rubricLabel = (versionId: string) => {
    const rubric = (rubrics.data ?? []).find((r) => r.id === versionId);
    return rubric ? `Thang chấm ${rubric.name} (bản ${rubric.version})` : `Thang chấm mã ${versionId.slice(0, 8)}`;
  };

  function openConfirm(group: ReviewGroup) {
    setDialogError(null);
    setDialog({ kind: 'confirm', group });
  }

  function runConfirm(group: ReviewGroup) {
    setDialogError(null);
    confirm.mutate(
      { key: group.key, resultIds: group.resultIds },
      {
        onSuccess: (outcome: ConfirmOutcome) => {
          setDialog(null);
          setStatus(summarize(outcome, byId));
        },
        onError: (e: Error) => {
          groups.refetch();
          if (e instanceof ApiStatusError && e.status === 404) {
            setDialog(null);
            setStatus('Nhóm này không còn bài nào cần duyệt; danh sách đã được tải lại.');
            return;
          }
          setDialogError(e.message);
        },
      },
    );
  }

  function runReset(b: OpenAutoBreaker) {
    setDialogError(null);
    resetBreaker.mutate(b.id, {
      onSuccess: () => {
        setDialog(null);
        setStatus(`Đã bật lại tự chốt cho ${scopeName(b)}.`);
      },
      onError: (e: Error) => {
        breakers.refetch();
        if (e instanceof ApiStatusError && e.status === 409) {
          setDialog(null);
          setStatus('Phạm vi này đã được bật lại trước đó; danh sách đã được tải lại.');
          return;
        }
        setDialogError(e.message);
      },
    });
  }

  const close = () => {
    setDialog(null);
    setDialogError(null);
  };

  return (
    <section aria-label="Bài cần bạn xem" className="flex flex-col gap-4">
      {groupList.length > 0 && (
        <div className="flex flex-col gap-3">
          <div>
            <h2 className="section-label">Bài cần bạn xem, gom theo lỗi</h2>
            <p className="text-small text-muted-foreground">
              Những bài cần xem được gom theo lỗi giống nhau. Hãy mở vài bài mẫu trước khi duyệt cả nhóm. Chỉ nhóm có đúng một
              loại lỗi mới duyệt hàng loạt được.
            </p>
          </div>
          {groupList.map((g) => {
            const versionId = rubricVersionOf(g);
            return (
              <GroupRow
                key={g.key}
                group={g}
                sessionId={sessionId}
                byId={byId}
                openedIds={openedIds}
                paused={g.kind === 'none' ? noErrorPaused : breakerList.some((b) => b.scope === 'rule' && b.ruleId === g.ruleId)}
                rubricLabel={versionId ? rubricLabel(versionId) : null}
                onConfirm={openConfirm}
              />
            );
          })}
        </div>
      )}

      {breakerList.length > 0 && (
        <section aria-labelledby="auto-paused-title" className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
          <h3 id="auto-paused-title" className="section-label">Tự chốt đang tạm dừng</h3>
          <p className="text-small text-muted-foreground">
            Hệ thống tạm ngừng tự chốt khi bạn không đồng ý với nó quá nhiều ở các bài kiểm tra ngẫu nhiên. Bạn bật lại khi thấy ổn.
          </p>
          <ul className="flex flex-col gap-2">
            {breakerList.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-col gap-0.5">
                  <p className="font-medium">
                    {b.scope === 'rule' ? (
                      <>
                        Lỗi <code className="font-mono">{b.ruleKey ?? b.ruleId}</code>
                      </>
                    ) : (
                      'Bài hệ thống cho là không có lỗi'
                    )}
                  </p>
                  <p className="text-small text-muted-foreground">
                    {b.disagreements}/{b.n} bài kiểm tra ngẫu nhiên không khớp với hệ thống.
                  </p>
                </div>
                <Button
                  variant="outline"
                  aria-label={`Bật lại tự chốt cho ${scopeName(b)}`}
                  onClick={() => {
                    setDialogError(null);
                    setDialog({ kind: 'reset', breaker: b });
                  }}
                >
                  Bật lại
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {status && (
        <p role="status" className="rounded-md bg-surface p-3 text-small">
          {status}
        </p>
      )}

      {dialog?.kind === 'confirm' && (
        <ConfirmDialog
          group={dialog.group}
          byId={byId}
          openedIds={openedIds}
          pending={confirm.isPending}
          error={dialogError}
          onCancel={close}
          onConfirm={() => runConfirm(dialog.group)}
        />
      )}

      {dialog?.kind === 'reset' && (
        <Modal titleId="reset-title" title={`Bật lại tự chốt cho ${scopeName(dialog.breaker)}?`}>
          <p className="text-small">Không tính lại bài nào. Các bài chưa chốt thuộc loại này sẽ tiếp tục đi qua duyệt; bài đã chốt điểm không đổi.</p>
          {dialogError && <p role="alert" className="text-small text-danger-strong">{dialogError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={close}>Huỷ</Button>
            <Button onClick={() => runReset(dialog.breaker)} disabled={resetBreaker.isPending}>Bật lại</Button>
          </div>
        </Modal>
      )}
    </section>
  );
}

function ConfirmDialog({
  group,
  byId,
  openedIds,
  pending,
  error,
  onCancel,
  onConfirm,
}: {
  group: ReviewGroup;
  byId: Map<string, GradingResult>;
  openedIds: ReadonlySet<string>;
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const total = group.resultIds.length;
  const openedHere = group.resultIds.filter((id) => openedIds.has(id)).length;
  return (
    <Modal titleId="confirm-title" title={`Duyệt ${total} bài cùng lỗi ${group.label}?`}>
      <p className="text-small">{group.description ?? ''}</p>
      {openedHere === 0 && (
        <p className="rounded-md border border-border p-3 text-small">
          Bạn chưa mở bài nào trong {total} bài này. Nên xem ít nhất một bài mẫu trước khi duyệt; bạn vẫn có thể duyệt ngay.
        </p>
      )}
      <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
        {group.resultIds.map((id) => (
          <li key={id} className="flex flex-wrap justify-between gap-2 text-small">
            <span className="font-medium">{byId.get(id)?.studentMssv ?? id}</span>
            <span>Điểm hệ thống {formatVnPoints(byId.get(id)?.currentScore ?? null)}</span>
            <span className="text-muted-foreground">{openedIds.has(id) ? 'Đã xem' : 'Chưa xem'}</span>
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="text-small text-danger-strong">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>Huỷ</Button>
        <Button onClick={onConfirm} disabled={pending}>Duyệt {total} bài</Button>
      </div>
    </Modal>
  );
}

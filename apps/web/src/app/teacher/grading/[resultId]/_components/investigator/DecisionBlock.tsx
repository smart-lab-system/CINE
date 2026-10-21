'use client';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useConfirmReviewGroup, useReviewGroups } from '@/hooks/useReviewGroups';
import { formatVnPoints } from '@/lib/format';
import type { ConfirmSkipReason } from '@/lib/api/review-groups';

/** Trạng thái mà bài đã được giảng viên ghi nhận — không còn quyết định nào để đưa ra. */
const RECORDED = new Set(['teacher_reviewed', 'finalized', 'exported']);

const SKIP_TEXT: Record<ConfirmSkipReason, string> = {
  not_flagged: 'bài không còn cờ cần duyệt',
  has_manual: 'bài đã được chấm tay',
  ungradable: 'bài không chấm được',
  no_computation: 'bài chưa có lượt tính điểm',
  not_investigator: 'bài không thuộc luồng điều tra',
};

/**
 * Khối "Quyết định của bạn" (§5.8, mục 7), dính khi cuộn cột phải. "Chấp nhận" đi qua cùng endpoint xác nhận của
 * nhóm (§5.4) với đúng một bài; bài không nằm trong nhóm duyệt nhanh nào thì không có nút đó.
 */
export function DecisionBlock({
  sessionId,
  resultId,
  status,
  currentScore,
  onOpenManualScore,
}: {
  sessionId: string;
  resultId: string;
  status: string;
  currentScore: number | null;
  onOpenManualScore: () => void;
}) {
  const groups = useReviewGroups(sessionId);
  const confirm = useConfirmReviewGroup(sessionId);
  const group = groups.data?.find((g) => g.resultIds.includes(resultId));
  const recorded = RECORDED.has(status);
  const outcome = confirm.data;
  const skipped = outcome?.skipped[0]?.reason;

  return (
    <aside
      aria-label="Quyết định của bạn"
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 lg:sticky lg:top-4"
    >
      <h2 className="section-label">Quyết định của bạn</h2>

      {recorded && <p className="text-small">Bạn đã ghi nhận bài này.</p>}

      {!recorded && currentScore !== null && group && (
        <Button disabled={confirm.isPending} onClick={() => confirm.mutate({ key: group.key, resultIds: [resultId] })}>
          Chấp nhận điểm {formatVnPoints(currentScore)}
        </Button>
      )}

      {!recorded && !group && groups.isSuccess && (
        <p className="text-caption text-muted-foreground">
          Bài này không nằm trong nhóm duyệt nhanh nào. Muốn đổi điểm thì chấm tay.
        </p>
      )}

      <Button variant="outline" onClick={onOpenManualScore}>
        Chấm tay…
      </Button>

      {confirm.isError && (
        <Alert variant="destructive">
          <AlertDescription>{confirm.error.message}</AlertDescription>
        </Alert>
      )}
      {outcome && outcome.confirmed > 0 && <p className="text-caption">Đã ghi nhận bài này.</p>}
      {outcome && outcome.confirmed === 0 && skipped && (
        <p className="text-caption text-warning-strong">Chưa ghi nhận: {SKIP_TEXT[skipped]}.</p>
      )}
    </aside>
  );
}

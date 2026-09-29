'use client';

import { useMemo, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useBulkReview } from '@/hooks/useGrading';
import type { BulkReviewOutcome, GradingResult, SkipReason } from '@/lib/api/grading';

/** Lý do bỏ qua, viết cho giảng viên đọc — không phải mã của server. */
const SKIP_LABEL: Record<SkipReason, string> = {
  not_reviewable: 'đang được chấm lại',
  no_advocate: 'chưa có ý kiến phản biện',
  unchanged: 'không có gì thay đổi',
};

/**
 * Duyệt hàng loạt bài TỰ LUẬN (spec §3.11): bài tự luận không bao giờ tự quyết (§0.3), nên để giảng viên không
 * phải bấm từng bài, danh sách cho duyệt cả loạt — nhưng TƯỜNG MINH: hộp xác nhận nói đúng số bài, và mỗi bài
 * được ghi một dòng duyệt hàng loạt.
 *
 * Chỉ bài tự luận đang chờ VÀ có điểm để nhận (bài tự luận không chấm được thì không có gì để "giữ điểm").
 * Luật gửi là `keep_ai` — giữ điểm lượt chấm — kèm danh sách id tường minh.
 */
export function BulkAcceptEssays({ sessionId, results }: { sessionId: string; results: GradingResult[] }) {
  const bulk = useBulkReview(sessionId);
  const [confirming, setConfirming] = useState(false);
  const [outcome, setOutcome] = useState<BulkReviewOutcome | null>(null);

  const essays = useMemo(
    () =>
      results.filter(
        (r) => r.pipeline === 'one_shot' && r.status === 'flagged_for_review' && r.ungradableReason === null,
      ),
    [results],
  );

  if (essays.length === 0 && outcome === null) return null;

  const nameOf = (resultId: string) => results.find((r) => r.id === resultId)?.studentName ?? resultId;
  const byReason = new Map<SkipReason, string[]>();
  for (const skip of outcome?.skipped ?? []) {
    byReason.set(skip.reason, [...(byReason.get(skip.reason) ?? []), nameOf(skip.resultId)]);
  }

  return (
    <div className="flex flex-col gap-3">
      {outcome && (
        <Alert variant="success" role="status">
          <AlertDescription>
            <span className="block">
              Đã duyệt <strong>{outcome.applied} bài</strong>.
            </span>
            {outcome.audited > 0 && (
              <span className="block">{outcome.audited} bài đã công bố — mỗi bài một dòng nhật ký.</span>
            )}
            {[...byReason.entries()].map(([reason, names]) => (
              <span key={reason} className="block">
                {names.length} bài bỏ qua: {names.join(', ')} — {SKIP_LABEL[reason]}.
              </span>
            ))}
          </AlertDescription>
        </Alert>
      )}

      {essays.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3">
          <p className="flex-1 text-small text-muted-foreground">
            Bài tự luận luôn do bạn duyệt. Nếu đã đồng ý với điểm hệ thống đề xuất, duyệt cả loạt thay vì mở từng bài.
          </p>
          <Button type="button" variant="outline" size="sm" onClick={() => setConfirming(true)}>
            Duyệt hàng loạt {essays.length} bài tự luận
          </Button>
        </div>
      )}

      <Dialog open={confirming} onOpenChange={(open) => !open && setConfirming(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Duyệt hàng loạt {essays.length} bài tự luận?</DialogTitle>
            <DialogDescription>
              Bạn sắp duyệt {essays.length} bài tự luận theo đúng điểm hệ thống đề xuất mà chưa mở xem. Mỗi bài được ghi
              một dòng duyệt hàng loạt mang tên bạn — vì bài tự luận không bao giờ tự quyết.
            </DialogDescription>
          </DialogHeader>
          {bulk.isError && (
            <Alert variant="destructive">
              <AlertDescription>{bulk.error.message}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirming(false)}>
              Huỷ
            </Button>
            <Button
              type="button"
              loading={bulk.isPending}
              onClick={() =>
                bulk.mutate(
                  { resultIds: essays.map((r) => r.id), rule: { kind: 'keep_ai' } },
                  {
                    onSuccess: (data) => {
                      setOutcome(data);
                      setConfirming(false);
                    },
                  },
                )
              }
            >
              Duyệt {essays.length} bài
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

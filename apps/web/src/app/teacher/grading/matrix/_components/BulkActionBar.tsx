'use client';

import { Button } from '@/components/ui/button';
import type { BulkReviewOutcome, BulkRule, GradingResult, SkipReason } from '@/lib/api/grading';

/** Lý do bỏ qua, viết cho giảng viên đọc — không phải mã của server. */
const SKIP_LABEL: Record<SkipReason, string> = {
  not_reviewable: 'đang được chấm lại',
  no_advocate: 'chưa có ý kiến phản biện',
  unchanged: 'không có gì thay đổi',
};

/**
 * Thanh hành động hàng loạt — HAI nút, không ba.
 *
 * "Lấy mức cao hơn" của bản mẫu không phải một thao tác riêng: luật áp kiến
 * nghị phản biện đã lấy mức cao hơn trên TỪNG tiêu chí, nên hai nút gộp làm
 * một. Nhãn nói ra điều đó, vì kết quả là một tổ hợp mà không lượt nào từng
 * đề xuất nguyên vẹn — giảng viên phải biết mình đang xác nhận cái gì.
 */
export function BulkActionBar({
  selectedIds,
  results,
  outcome,
  pending,
  onApply,
}: {
  selectedIds: string[];
  results: GradingResult[];
  outcome: BulkReviewOutcome | undefined;
  pending: boolean;
  onApply: (rule: BulkRule) => void;
}) {
  if (selectedIds.length === 0) {
    return null;
  }

  const nameOf = (resultId: string) =>
    results.find((row) => row.id === resultId)?.studentName ?? resultId;

  // Gom theo lý do: ba bài cùng bị bỏ qua vì một nguyên nhân là MỘT câu, không
  // phải ba dòng.
  const byReason = new Map<SkipReason, string[]>();
  for (const skip of outcome?.skipped ?? []) {
    byReason.set(skip.reason, [...(byReason.get(skip.reason) ?? []), nameOf(skip.resultId)]);
  }

  return (
    <div className="sticky bottom-0 z-10 flex flex-col gap-2 rounded-lg border border-border bg-primary p-4 text-primary-foreground shadow-lg">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-small font-semibold">Đã chọn {selectedIds.length} bài</span>

        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => onApply({ kind: 'keep_ai' })}
        >
          Giữ điểm lượt chấm
        </Button>

        <Button size="sm" disabled={pending} onClick={() => onApply({ kind: 'apply_advocate' })}>
          Áp kiến nghị phản biện — lấy mức cao hơn trên từng tiêu chí
        </Button>
      </div>

      {outcome && (
        <div className="flex flex-col gap-1 border-t border-primary-foreground/20 pt-2 text-caption leading-relaxed">
          <p>
            Đã áp cho <span className="font-semibold">{outcome.applied} bài</span>.
            {outcome.audited > 0 && (
              <>
                {' '}
                Trong đó{' '}
                <span className="font-semibold">
                  {outcome.audited} bài đã công bố — mỗi bài một dòng nhật ký
                </span>
                .
              </>
            )}
          </p>
          {[...byReason.entries()].map(([reason, names]) => (
            <p key={reason}>
              <span className="font-semibold">{names.length} bài bỏ qua</span>: {names.join(', ')} —{' '}
              {SKIP_LABEL[reason]}.
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

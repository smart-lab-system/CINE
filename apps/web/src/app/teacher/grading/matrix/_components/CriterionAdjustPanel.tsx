'use client';

import { Button } from '@/components/ui/button';
import type { BulkRule, GradingResult, Rubric } from '@/lib/api/grading';

/** Cộng bù bao nhiêu. Một con số, nói ra ở nhãn, không phải ô nhập tự do. */
const BONUS_POINTS = 1;

/**
 * Can thiệp ở mức TIÊU CHÍ — khi cả lớp cùng mất điểm vì một câu hỏi tồi.
 *
 * Bản mẫu gọi thao tác này là "huỷ tiêu chí — chia đều trọng số sang các tiêu
 * chí còn lại". Chia trọng số là BẤT KHẢ: `validateAndTotal` từ chối mọi tiêu
 * chí có `points > maxPoints`, nên một tiêu chí bị huỷ không thể đẩy điểm của
 * nó sang tiêu chí khác. Thứ làm được và có cùng tác dụng với sinh viên là
 * cho điểm tối đa tiêu chí ấy — và nhãn nói đúng thứ nó làm.
 */
export function CriterionAdjustPanel({
  results,
  rubric,
  pending,
  onApply,
}: {
  results: GradingResult[];
  rubric: Rubric | undefined;
  pending: boolean;
  onApply: (rule: BulkRule) => void;
}) {
  const criteria = rubric?.criteria ?? [];
  if (criteria.length === 0) {
    return null;
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-small font-semibold">Can thiệp theo tiêu chí</h3>
        <p className="text-caption text-muted-foreground">
          Áp cho <span className="font-semibold text-foreground">mọi bài trong phiên, không chỉ nhóm đang lọc</span>{' '}
          — dùng khi cả lớp cùng mất điểm ở một tiêu chí vì đề ra không rõ.
        </p>
      </div>

      <div className="flex flex-col gap-2.5">
        {criteria.map((criterion) => {
          const lost = results.filter((row) =>
            row.criterionResults.some(
              (entry) => entry.criterionId === criterion.id && entry.points < criterion.maxPoints,
            ),
          ).length;
          const ratio = results.length === 0 ? 0 : lost / results.length;

          return (
            <div
              key={criterion.id}
              className="flex flex-wrap items-center gap-3 rounded-md border border-border px-3 py-2.5"
            >
              <div className="flex min-w-[14rem] flex-1 flex-col gap-1">
                <span className="text-small font-medium">{criterion.description}</span>
                <span className="text-caption text-muted-foreground">
                  {lost}/{results.length} bài mất điểm · thang {criterion.maxPoints} điểm
                </span>
                <div
                  className="h-1 w-full overflow-hidden rounded-full bg-border"
                  role="presentation"
                >
                  <div
                    className="h-full rounded-full bg-warning"
                    style={{ width: `${Math.round(ratio * 100)}%` }}
                  />
                </div>
              </div>

              <div className="flex flex-col items-end gap-1">
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      onApply({
                        kind: 'criterion_bonus',
                        criterionId: criterion.id,
                        points: BONUS_POINTS,
                      })
                    }
                  >
                    Cộng bù
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      onApply({ kind: 'criterion_full_marks', criterionId: criterion.id })
                    }
                  >
                    Cho điểm tối đa cho cả lớp
                  </Button>
                </div>
                {/* Trần nói ra ở nhãn: bài đang ở điểm tối đa nhận "cộng bù"
                    sẽ dừng ở trần, và im lặng về điều đó là một bất ngờ. */}
                <span className="text-caption text-muted-foreground">
                  Cộng bù: tối đa +{BONUS_POINTS} điểm, không vượt thang
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

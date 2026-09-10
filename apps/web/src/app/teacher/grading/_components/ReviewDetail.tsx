'use client';

import { useMemo, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useSubmitReview } from '@/hooks/useGrading';
import type { GradingResult, ReviewCriterion } from '@/lib/api/grading';

const VERDICTS: { value: ReviewCriterion['verdict']; label: string }[] = [
  { value: 'met', label: 'Đạt' },
  { value: 'partially_met', label: 'Đạt một phần' },
  { value: 'not_met', label: 'Chưa đạt' },
];

/** Điểm đã CÔNG BỐ — sửa từ đây trở đi để lại dấu vết trong nhật ký. */
const PUBLISHED = ['finalized', 'exported'];
/** AI còn đang làm việc — chưa duyệt được. */
const IN_PROGRESS = ['ai_grading', 'ai_graded'];

/**
 * Duyệt MỘT bài: từng tiêu chí một, kèm bằng chứng AI đưa ra.
 *
 * Việc của giảng viên là kiểm tra lập luận, không phải gõ lại một con số —
 * nên mỗi tiêu chí có ô điểm riêng đặt cạnh đúng đoạn bằng chứng của nó.
 */
export function ReviewDetail({
  examSessionId,
  result,
}: {
  examSessionId: string;
  result: GradingResult;
}) {
  const submit = useSubmitReview(examSessionId);

  // Điểm khởi đầu: bản giảng viên đã sửa nếu có, chưa thì bản AI đề xuất.
  const initial = useMemo<ReviewCriterion[]>(
    () =>
      result.editedCriteria ??
      result.criterionResults.map((criterion) => ({
        criterionId: criterion.criterionId,
        verdict: criterion.verdict,
        points: criterion.points,
      })),
    [result.editedCriteria, result.criterionResults],
  );
  const [draft, setDraft] = useState<ReviewCriterion[] | null>(null);
  const rows = draft ?? initial;

  // Tổng LUÔN tính từ các ô, không cho nhập tay — khớp với việc server cũng
  // tính bằng tổng và bỏ qua mọi tổng client gửi lên.
  const total = Math.round(rows.reduce((sum, row) => sum + row.points, 0) * 100) / 100;

  const readOnly = IN_PROGRESS.includes(result.status);
  const published = PUBLISHED.includes(result.status);

  function update(index: number, patch: Partial<ReviewCriterion>) {
    setDraft(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-h3">{result.studentName}</p>
        <p className="font-mono text-caption text-muted-foreground">{result.studentMssv}</p>
      </div>

      {readOnly && (
        <Alert variant="info">
          <AlertDescription>
            AI đang chấm bài này — chưa duyệt được. Tải lại sau ít phút.
          </AlertDescription>
        </Alert>
      )}

      {rows.map((row, index) => {
        const evidence = result.criterionResults.find(
          (criterion) => criterion.criterionId === row.criterionId,
        )?.evidence;
        return (
          <div
            key={row.criterionId}
            className="flex flex-col gap-2 rounded-md border border-border p-3"
          >
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-1 flex-col gap-1.5">
                <Label htmlFor={`verdict-${row.criterionId}`}>Đánh giá</Label>
                <Select
                  value={row.verdict}
                  disabled={readOnly}
                  onValueChange={(value) =>
                    update(index, { verdict: value as ReviewCriterion['verdict'] })
                  }
                >
                  <SelectTrigger id={`verdict-${row.criterionId}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VERDICTS.map((verdict) => (
                      <SelectItem key={verdict.value} value={verdict.value}>
                        {verdict.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex w-28 flex-col gap-1.5">
                <Label htmlFor={`points-${row.criterionId}`}>Điểm</Label>
                <Input
                  id={`points-${row.criterionId}`}
                  type="number"
                  min={0}
                  step={0.25}
                  disabled={readOnly}
                  value={row.points}
                  onChange={(event) =>
                    update(index, { points: Number(event.target.value) || 0 })
                  }
                />
              </div>
            </div>
            {evidence && <p className="text-caption text-muted-foreground">{evidence}</p>}
          </div>
        );
      })}

      {published && (
        <Alert variant="warning">
          <AlertDescription>
            Điểm đã chốt — thay đổi này sẽ được ghi vào nhật ký.
          </AlertDescription>
        </Alert>
      )}

      {submit.isError && (
        <Alert variant="destructive">
          <AlertDescription>{submit.error.message}</AlertDescription>
        </Alert>
      )}

      {!readOnly && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-small">
            Tổng: <span className="font-semibold tabular-nums">{total}</span>
          </p>
          <Button
            type="button"
            loading={submit.isPending}
            onClick={() =>
              submit.mutate(
                { gradingResultId: result.id, criteria: rows },
                { onSuccess: () => setDraft(null) },
              )
            }
          >
            {published ? 'Lưu và ghi nhật ký' : 'Lưu duyệt'}
          </Button>
        </div>
      )}
    </div>
  );
}

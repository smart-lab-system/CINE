'use client';

import { useState } from 'react';
import { Lock } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useFinalizeGrades } from '@/hooks/useGrading';
import { groupOf } from '@/lib/grading-groups';
import type { GradingResult } from '@/lib/api/grading';

/**
 * Chốt điểm cả phiên — mốc CÔNG BỐ, không phải một thao tác lưu.
 *
 * Hộp xác nhận nói đúng hai con số, vì việc chấp nhận hàng loạt phải TƯỜNG
 * MINH: bấm nút mà không biết mình vừa nhận N bài chưa đọc là câu trả lời tệ
 * khi có sinh viên khiếu nại.
 */
export function FinalizeGradesButton({
  examSessionId,
  results,
}: {
  examSessionId: string;
  results: GradingResult[];
}) {
  const finalize = useFinalizeGrades(examSessionId);
  const [confirming, setConfirming] = useState(false);

  const count = (group: string) =>
    results.filter((result) => groupOf(result.status) === group).length;
  const needsReview = count('needsReview');
  const inProgress = count('grading');
  const reviewed = count('reviewed');
  const autoApproved = count('autoApproved');

  if (results.length === 0) {
    return null;
  }

  if (results.every((result) => groupOf(result.status) === 'finalised')) {
    return (
      <p className="text-small text-muted-foreground">
        Điểm của phiên thi này đã chốt. Sửa điểm từ giờ sẽ được ghi vào nhật ký.
      </p>
    );
  }

  const remaining = needsReview + inProgress;
  const blocked = remaining > 0;

  return (
    <div className="flex flex-col gap-3">
      {confirming ? (
        <Alert variant="warning">
          <AlertDescription className="flex flex-col gap-3">
            <span>
              Bạn đang chốt <strong>{autoApproved} bài</strong> theo đúng điểm AI đề
              xuất mà chưa mở xem, và <strong>{reviewed} bài</strong> bạn đã duyệt.
            </span>
            <span className="flex gap-2">
              <Button
                type="button"
                size="sm"
                loading={finalize.isPending}
                onClick={() =>
                  finalize.mutate(undefined, { onSuccess: () => setConfirming(false) })
                }
              >
                Chốt điểm
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setConfirming(false)}
              >
                Huỷ
              </Button>
            </span>
          </AlertDescription>
        </Alert>
      ) : (
        <Button
          type="button"
          className="self-start"
          disabled={blocked}
          // Tắt kèm LÝ DO, không tắt câm.
          title={
            blocked
              ? `Còn ${remaining} bài chưa duyệt xong — duyệt hết rồi mới chốt được.`
              : undefined
          }
          onClick={() => setConfirming(true)}
        >
          <Lock className="h-4 w-4" aria-hidden="true" />
          Chốt điểm cả phiên
        </Button>
      )}

      {blocked && (
        <p className="text-caption text-muted-foreground">
          Còn {remaining} bài chưa duyệt xong.
        </p>
      )}

      {finalize.isError && (
        <Alert variant="destructive">
          <AlertDescription>{finalize.error.message}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}

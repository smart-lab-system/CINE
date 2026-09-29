'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useSubmissionText } from '@/hooks/useGrading';
import { AnswerPane } from '../AnswerPane';

/**
 * "Mở bài nộp" — dùng lại `AnswerPane` ở chế độ chỉ xem: không tiêu chí
 * nào đang chọn nên không có gì để tô màu, nhưng cùng một khối hiển thị
 * bài làm mà hồ sơ theo tiêu chí đã dùng (spec §4: rà AnswerPane trước
 * khi xoá — đây là chỗ dùng lại).
 */
export function SubmissionDialog({
  resultId,
  open,
  onOpenChange,
}: {
  resultId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const text = useSubmissionText(open ? resultId : undefined);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Bài nộp</DialogTitle>
        </DialogHeader>
        {text.isLoading || !text.data ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <AnswerPane
            text={text.data}
            criterionIndexOf={() => -1}
            activeCriterionId={null}
            onSelectCriterion={() => undefined}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

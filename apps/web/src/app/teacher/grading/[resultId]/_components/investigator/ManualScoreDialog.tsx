'use client';

import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { useSetManualScore } from '@/hooks/useGrading';
import { formatVnPoints } from '@/lib/format';

/** Cùng tập PUBLISHED của server (review/error-exception.service.ts): điểm đã công bố đổi thì ghi nhật ký. */
const PUBLISHED = new Set(['finalized', 'exported']);

/** "7,5" — điểm hiện trên trang theo kiểu Việt Nam, ô nhập cũng vậy để người dùng gõ đúng thứ họ đang đọc. */
function seedFrom(score: number | null): string {
  return score === null ? '' : String(Number(score.toFixed(2))).replace('.', ',');
}

/**
 * Chấm tay bài này (§2.2 ngoại lệ cấp bài) — điền sẵn điểm hệ thống (T-UI-25), gửi CHUỖI thập phân
 * (server 400 nếu gửi số). Sau khi lưu, điểm này KHÔNG đổi theo luật hay giá nữa — câu này hiện luôn,
 * không chỉ lúc lỗi, vì đây là hệ quả người bấm nút cần biết TRƯỚC khi bấm.
 *
 * Phần ruột là ManualScoreForm, nằm TRONG DialogContent: Radix gỡ nó khi đóng, nên mỗi lần mở là một lần
 * mount mới — điểm điền sẵn là điểm HIỆN TẠI, không phải điểm lúc trang vừa tải (review I3), và lỗi/giá trị
 * dang dở của lần mở trước không sống sót.
 *
 * maxTotal là null khi chưa biết rubric của phiên: không bịa trần (review I6), để server quyết.
 */
export function ManualScoreDialog({
  resultId,
  sessionId,
  currentScore,
  maxTotal,
  status,
  open,
  onOpenChange,
}: {
  resultId: string;
  sessionId: string;
  currentScore: number | null;
  maxTotal: number | null;
  status: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <ManualScoreForm
          resultId={resultId}
          sessionId={sessionId}
          currentScore={currentScore}
          maxTotal={maxTotal}
          published={PUBLISHED.has(status)}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function ManualScoreForm({
  resultId,
  sessionId,
  currentScore,
  maxTotal,
  published,
  onClose,
}: {
  resultId: string;
  sessionId: string;
  currentScore: number | null;
  maxTotal: number | null;
  published: boolean;
  onClose: () => void;
}) {
  const [score, setScore] = useState(() => seedFrom(currentScore));
  const [clientError, setClientError] = useState<string | null>(null);
  const setManualScore = useSetManualScore(sessionId);

  function submit() {
    setClientError(null);
    // Nhận cả "7,5" (kiểu trang đang hiện) lẫn "7.5"; server chỉ nhận dấu chấm.
    const text = score.trim().replace(',', '.');
    if (!/^\d{1,4}(\.\d{1,2})?$/.test(text)) {
      setClientError('Điểm: số không âm, tối đa hai chữ số lẻ (ví dụ 7,5).');
      return;
    }
    if (maxTotal !== null && Number(text) > maxTotal) {
      setClientError(`Điểm vượt trần của rubric (${formatVnPoints(maxTotal)}).`);
      return;
    }
    setManualScore.mutate({ resultId, score: text }, { onSuccess: onClose });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Chấm tay bài này</DialogTitle>
      </DialogHeader>
      <p className="text-caption text-muted-foreground">
        Từ lúc lưu, điểm bài này không đổi theo luật hay giá nữa — kể cả khi bạn sửa Bảng lỗi sau đó.
      </p>
      {published && (
        <Alert variant="warning">
          <AlertDescription>Điểm đã chốt — thay đổi này sẽ được ghi vào nhật ký.</AlertDescription>
        </Alert>
      )}
      <FormField id="manual-score" label="Điểm">
        <Input id="manual-score" value={score} onChange={(e) => setScore(e.target.value)} placeholder="Ví dụ: 7,5" />
      </FormField>
      {clientError && (
        <Alert variant="destructive">
          <AlertDescription>{clientError}</AlertDescription>
        </Alert>
      )}
      {setManualScore.isError && (
        <Alert variant="destructive">
          <AlertDescription>{setManualScore.error.message}</AlertDescription>
        </Alert>
      )}
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Huỷ
        </Button>
        <Button loading={setManualScore.isPending} onClick={submit}>
          {published ? 'Chấm tay và ghi nhật ký' : 'Chấm tay'}
        </Button>
      </DialogFooter>
    </>
  );
}

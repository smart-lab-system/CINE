'use client';

import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { useSetManualScore } from '@/hooks/useGrading';

/**
 * Chấm tay bài này (§2.2 ngoại lệ cấp bài) — điền sẵn điểm hệ thống
 * (T-UI-25), gửi CHUỖI thập phân (server 400 nếu gửi số). Sau khi lưu,
 * điểm này KHÔNG đổi theo luật hay giá nữa — câu này hiện luôn, không chỉ
 * lúc lỗi, vì đây là hệ quả người bấm nút cần biết TRƯỚC khi bấm.
 */
export function ManualScoreDialog({
  resultId,
  sessionId,
  currentScore,
  maxTotal,
  open,
  onOpenChange,
}: {
  resultId: string;
  sessionId: string;
  currentScore: number | null;
  maxTotal: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [score, setScore] = useState(currentScore !== null ? String(currentScore) : '');
  const [clientError, setClientError] = useState<string | null>(null);
  const setManualScore = useSetManualScore(sessionId);

  function submit() {
    setClientError(null);
    const parsed = Number(score.replace(',', '.'));
    if (!/^\d{1,4}(\.\d{1,2})?$/.test(score.trim())) {
      setClientError('Điểm: chuỗi thập phân tối đa hai chữ số lẻ, không âm.');
      return;
    }
    if (parsed > maxTotal) {
      setClientError(`Điểm vượt trần của rubric (${maxTotal.toFixed(2)}).`);
      return;
    }
    setManualScore.mutate({ resultId, score: score.trim() }, { onSuccess: () => onOpenChange(false) });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Chấm tay bài này</DialogTitle>
        </DialogHeader>
        <p className="text-caption text-muted-foreground">
          Từ lúc lưu, điểm bài này không đổi theo luật hay giá nữa — kể cả khi bạn sửa Bảng lỗi sau đó.
        </p>
        <FormField id="manual-score" label="Điểm">
          <Input id="manual-score" value={score} onChange={(e) => setScore(e.target.value)} placeholder="Ví dụ: 7.5" />
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
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Huỷ
          </Button>
          <Button loading={setManualScore.isPending} onClick={submit}>
            Chấm tay
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Play } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  createPlaygroundRunFromGradingResult,
  PlaygroundHttpError,
} from '@/lib/api/playground';

/**
 * Nút trên header chi tiết bài: nạp bài nộp vào playground rồi mở trang chạy thử.
 */
export function PlaygroundFromSubmissionButton({
  resultId,
  sessionId,
}: {
  resultId: string;
  sessionId?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const onClick = async () => {
    setBusy(true);
    try {
      const run = await createPlaygroundRunFromGradingResult(resultId);
      const qs = new URLSearchParams({ runId: run.id });
      qs.set('resultId', resultId);
      if (sessionId) qs.set('sessionId', sessionId);
      router.push(`/teacher/playground?${qs.toString()}`);
    } catch (e) {
      const message =
        e instanceof PlaygroundHttpError
          ? e.message
          : e instanceof Error
            ? e.message
            : 'Không tạo được lượt chạy thử';
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button type="button" variant="outline" size="sm" loading={busy} onClick={() => void onClick()}>
      <Play className="h-4 w-4" aria-hidden="true" />
      Chạy thử
    </Button>
  );
}

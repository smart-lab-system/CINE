'use client';

import { useEffect, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { gradingInProgressMessage } from '@/lib/grading-elapsed';

/**
 * Alert hồ sơ đang chấm: đồng hồ sống từ `gradingTriggeredAt` (lúc xếp hàng).
 * Không poll API chỉ vì đồng hồ - `setInterval` 1s trên client.
 */
export function GradingInProgressAlert({
  gradingTriggeredAt,
  status,
}: {
  gradingTriggeredAt?: string | null;
  /** `ai_grading` (mặc định) hoặc `ai_graded`: hai trạng thái có hai câu khác nhau. */
  status?: string;
}) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!gradingTriggeredAt) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [gradingTriggeredAt]);

  return (
    <Alert variant="info">
      <AlertDescription>{gradingInProgressMessage(gradingTriggeredAt, nowMs, status)}</AlertDescription>
    </Alert>
  );
}

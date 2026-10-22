'use client';

import { useEffect, useState } from 'react';

/**
 * Mốc thời gian để nhãn phiên tự chuyển "Đang diễn ra" → "Đang thi"
 * đúng lúc tới giờ bắt đầu, không cần tải lại trang.
 */
export function useStatusClock(
  sessions: ReadonlyArray<{ status: string; startTime: string } | null | undefined>,
): number {
  const [now, setNow] = useState(() => Date.now());
  const signature = sessions
    .filter((session): session is { status: string; startTime: string } => session != null)
    .map((session) => `${session.status}\t${session.startTime}`)
    .join('\n');

  useEffect(() => {
    const at = Date.now();
    let soonest: number | null = null;
    for (const line of signature.split('\n')) {
      if (!line) continue;
      const tab = line.indexOf('\t');
      if (tab < 0 || line.slice(0, tab) !== 'active') continue;
      const start = Date.parse(line.slice(tab + 1));
      if (!Number.isFinite(start) || start <= at) continue;
      if (soonest === null || start < soonest) soonest = start;
    }
    if (soonest === null) return;
    const timer = window.setTimeout(() => setNow(Date.now()), Math.max(0, soonest - Date.now()));
    return () => window.clearTimeout(timer);
  }, [signature]);

  return now;
}

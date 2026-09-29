'use client';

import { AlertTriangle } from 'lucide-react';
import type { ChallengeNote } from '@/lib/api/grading';
import { lensLabel } from '@/lib/grading-vocab';

/**
 * Ghi chú của hai góc kiểm CẤP BÀI (Bỏ sót, Gian lận, §6.1) — không gắn với một lỗi cụ thể
 * nên không vào được `ErrorList`. Ghi chú NGHI NGỜ nổi thành cảnh báo; ghi chú "không
 * thấy vấn đề" nằm trong mục thu gọn — không đòi giảng viên đọc, nhưng vẫn cho thấy góc kiểm
 * đã chạy và đã thử gì (hay vì sao không kết luận được) — spec §3.5.
 *
 * Từ "lăng kính" là tên nội bộ; giảng viên đọc "góc kiểm" (spec §2.2).
 */
export function ChallengeNotes({ notes }: { notes: ChallengeNote[] }) {
  const suspected = notes.filter((n) => n.suspected);
  const clear = notes.filter((n) => !n.suspected);
  if (notes.length === 0) return null;
  return (
    <>
      {suspected.length > 0 && (
        <section className="flex flex-col gap-2 rounded-md border border-warning bg-warning/5 p-3">
          <h3 className="flex items-center gap-2 section-label text-warning-strong">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            Góc kiểm phản biện nghi ngờ
          </h3>
          <ul className="flex flex-col gap-1.5">
            {suspected.map((n, i) => (
              <li key={i} className="text-small text-muted-foreground">
                <span className="font-medium text-foreground">{lensLabel(n.lens)}</span> — {n.note}
              </li>
            ))}
          </ul>
        </section>
      )}
      {clear.length > 0 && (
        <details className="rounded-md border border-border bg-surface p-3">
          <summary className="cursor-pointer text-small text-muted-foreground">
            Góc kiểm cấp bài đã kiểm, không thấy vấn đề ({clear.length})
          </summary>
          <ul className="mt-2 flex flex-col gap-1.5">
            {clear.map((n, i) => (
              <li key={i} className="text-small text-muted-foreground">
                <span className="font-medium text-foreground">{lensLabel(n.lens)}</span> — {n.note}
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

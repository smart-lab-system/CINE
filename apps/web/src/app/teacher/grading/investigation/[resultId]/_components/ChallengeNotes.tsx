'use client';

import { AlertTriangle } from 'lucide-react';
import type { ChallengeNote } from '@/lib/api/grading';

/**
 * Ghi chú của hai lăng kính CẤP BÀI (Bỏ sót, Gian lận, §6.1) — không gắn với một lỗi cụ thể
 * nên không vào được `DiagnosedErrorList`. Chỉ hiện ghi chú NGHI NGỜ: một lăng kính nói "không
 * thấy gì bất thường" không phải thông tin giảng viên cần đọc, nó chỉ nói lăng kính đã chạy.
 */
export function ChallengeNotes({ notes }: { notes: ChallengeNote[] }) {
  const suspected = notes.filter((n) => n.suspected);
  if (suspected.length === 0) return null;
  return (
    <section className="flex flex-col gap-2 rounded-md border border-warning bg-warning/5 p-3">
      <h3 className="flex items-center gap-2 section-label text-warning-strong">
        <AlertTriangle className="h-4 w-4" aria-hidden="true" />
        Lăng kính phản biện nghi ngờ
      </h3>
      <ul className="flex flex-col gap-1.5">
        {suspected.map((n, i) => (
          <li key={i} className="text-small text-muted-foreground">
            <span className="font-medium text-foreground">{n.lens}</span> — {n.note}
          </li>
        ))}
      </ul>
    </section>
  );
}

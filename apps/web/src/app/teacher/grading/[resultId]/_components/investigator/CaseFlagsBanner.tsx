'use client';

import Link from 'next/link';
import { TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { caseFlagLabel } from '@/lib/grading-vocab';

/** Mã cờ có lối gỡ Ở TẦNG LUẬT (đưa sang Bảng lỗi) thay vì cần chấm tay. */
const RULE_FIXABLE = new Set(['criterion_without_rules']);

export function CaseFlagsBanner({
  caseFlags,
  errorFlags,
  onManualScore,
}: {
  caseFlags: { code: string; detail: string }[];
  errorFlags: { ruleKey: string; code: string }[];
  onManualScore: () => void;
}) {
  const unpriced = errorFlags.filter((f) => f.code === 'unpriced');
  if (caseFlags.length === 0 && unpriced.length === 0) return null;

  return (
    <section role="status" className="flex flex-col gap-2.5 rounded-lg border border-warning bg-warning/5 p-4">
      <h2 className="flex items-center gap-2 text-small font-semibold text-warning-strong">
        <TriangleAlert className="h-4 w-4" aria-hidden="true" />
        Cần bạn xem
      </h2>
      <ul className="flex flex-col gap-2">
        {unpriced.map((f) => (
          <li key={f.ruleKey} className="flex flex-wrap items-center justify-between gap-2 text-small">
            <span>
              Luật <span className="font-mono">{f.ruleKey}</span> chưa có giá
            </span>
            <Link href="/teacher/rules">
              <Button size="sm" variant="outline">
                Đặt giá
              </Button>
            </Link>
          </li>
        ))}
        {caseFlags.map((flag, i) => (
          <li key={i} className="flex flex-col gap-0.5 text-small">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>{caseFlagLabel(flag.code, flag.detail)}</span>
              {RULE_FIXABLE.has(flag.code) ? (
                <Link href="/teacher/rules">
                  <Button size="sm" variant="outline">
                    Tạo luật cho tiêu chí này
                  </Button>
                </Link>
              ) : (
                <Button size="sm" variant="outline" onClick={onManualScore}>
                  Chấm tay bài này
                </Button>
              )}
            </div>
            <span className="font-mono text-caption text-muted-foreground">{flag.detail}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

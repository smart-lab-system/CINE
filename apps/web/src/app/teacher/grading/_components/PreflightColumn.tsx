import Link from 'next/link';
import { CheckCircle2, CircleX, TriangleAlert } from 'lucide-react';
import { NeedsBackend } from '@/components/needs-backend';
import type { PreflightRow, PreflightStatus } from '@/lib/preflight';

const STATUS: Record<PreflightStatus, { word: string; icon: typeof CheckCircle2; tone: string }> = {
  ok: { word: 'Ổn', icon: CheckCircle2, tone: 'text-success-strong' },
  warn: { word: 'Lưu ý', icon: TriangleAlert, tone: 'text-warning-strong' },
  block: { word: 'Chặn', icon: CircleX, tone: 'text-danger-strong' },
};

/** Cột "Trước khi bắt đầu" (spec §3.7): mỗi dòng có biểu tượng VÀ chữ — không truyền tin chỉ bằng màu. */
export function PreflightColumn({ rows }: { rows: PreflightRow[] }) {
  return (
    <ul aria-label="Trước khi bắt đầu" className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface">
      {rows.map((row) => {
        const { word, icon: Icon, tone } = STATUS[row.status];
        return (
          <li key={row.key} className="flex flex-col gap-1 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Icon className={`h-4 w-4 ${tone}`} aria-hidden="true" />
              <span className="text-small font-semibold">{row.label}</span>
              <span className={`text-caption font-semibold ${tone}`}>{word}</span>
              {row.needsBackend && <NeedsBackend />}
            </div>
            <p className="text-caption text-muted-foreground">{row.text}</p>
            {row.link && (
              <Link href={row.link.href} className="text-caption font-semibold text-accent-strong hover:underline">
                {row.link.label}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}

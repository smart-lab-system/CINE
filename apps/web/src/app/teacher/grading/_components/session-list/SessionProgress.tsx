import { progressCaption, progressLabel, type SessionRow } from '@/lib/session-list';
import { cn } from '@/lib/utils';

/**
 * Thanh tiến độ của một phiên. Màu chỉ để nhìn nhanh (spec UI §2.1 luật 1): cả thanh được đọc ra bằng ĐỦ
 * các con số (`aria-label`), và chú thích bên dưới nói bằng chữ. Đoạn nào 0 bài thì không vẽ.
 */
export function SessionProgress({ row }: { row: SessionRow }) {
  if (row.status === null) return <span className="text-caption text-muted-foreground">—</span>;
  const c = row.counts;
  const segments = [
    { key: 'attn', n: c.needsYou + c.audit + c.ungradable, className: 'bg-warning' },
    { key: 'run', n: c.grading, className: 'bg-info bg-stripes' },
    { key: 'ok', n: c.auto + c.reviewed, className: 'bg-success' },
    { key: 'fin', n: c.finalised, className: 'bg-primary/60' },
  ].filter((s) => s.n > 0);

  return (
    <div className="flex flex-col gap-1.5 group-data-[density=compact]:flex-row group-data-[density=compact]:items-center group-data-[density=compact]:gap-2">
      <div
        role="img"
        aria-label={progressLabel(row)}
        className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full bg-border group-data-[density=compact]:w-14 group-data-[density=compact]:shrink-0"
      >
        {segments.map((s) => (
          <span key={s.key} data-segment={s.key} className={cn('block min-w-1', s.className)} style={{ flexGrow: s.n, flexBasis: 0 }} />
        ))}
      </div>
      <span
        className={cn(
          'truncate text-caption tabular-nums',
          row.status === 'attention' ? 'font-semibold text-warning-strong' : 'text-muted-foreground',
        )}
      >
        {progressCaption(row)}
      </span>
    </div>
  );
}

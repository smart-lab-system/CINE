import Link from 'next/link';
import { Button } from '@/components/ui/button';

/**
 * Dòng nhắc đòn bẩy (spec §3.3) — điểm khác cốt lõi so với UI cũ: MỘT thao tác ở tầng luật gỡ được nhiều bài
 * một lúc. Chỉ hiện khi có (`leverage` là `null` cho tới khi mọi hồ sơ cần xem đã tải — xem `leverageOf`).
 */
export function LeverageLine({
  leverage,
}: {
  leverage: { waiting: number; total: number; ruleKeys: string[] } | null;
}) {
  if (leverage === null) return null;
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-accent/40 bg-accent-subtle p-4"
    >
      <div className="flex flex-col gap-1">
        <p className="text-small font-semibold">
          {leverage.waiting} trong {leverage.total} bài cần xem chỉ chờ bạn đặt giá cho {leverage.ruleKeys.length} luật
        </p>
        <p className="text-caption text-muted-foreground">
          Luật chưa có giá:{' '}
          {leverage.ruleKeys.map((key, i) => (
            <span key={key}>
              {i > 0 && ', '}
              <span className="font-mono">{key}</span>
            </span>
          ))}
        </p>
      </div>
      <Button asChild size="sm">
        <Link href="/teacher/rules">Đặt giá ở Bảng lỗi</Link>
      </Button>
    </div>
  );
}

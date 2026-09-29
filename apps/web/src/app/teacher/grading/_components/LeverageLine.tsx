import Link from 'next/link';
import { Button } from '@/components/ui/button';

/**
 * Dòng nhắc đòn bẩy (spec §3.3) — điểm khác cốt lõi so với UI cũ: MỘT thao tác ở tầng luật gỡ được nhiều bài
 * một lúc. Chỉ hiện khi có (`leverage` là `null` cho tới khi mọi hồ sơ cần xem đã tải — xem `leverageOf`).
 *
 * Lời là "đang chờ", KHÔNG phải "chỉ chờ" như mockup. Kiểm trên API thật: đặt giá cho luật cuối cùng làm cờ
 * "chưa có giá" biến mất nhưng LỘ RA cờ `low_confidence` mà `decide()` giấu khi còn cờ khác (decide.ts:188) — bài
 * vẫn cần xem. Nên dòng này nói đúng phần chứng minh được (giá là lý do hiện có) và nói thẳng rằng còn lý do
 * khác thì sẽ hiện sau khi tính lại.
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
          {leverage.waiting} trong {leverage.total} bài cần xem đang chờ bạn đặt giá cho {leverage.ruleKeys.length} luật
        </p>
        <p className="text-caption text-muted-foreground">
          Đặt giá gỡ lý do này. Bài nào còn lý do khác (ví dụ độ tin dưới ngưỡng) sẽ hiện lý do đó sau khi tính lại.
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

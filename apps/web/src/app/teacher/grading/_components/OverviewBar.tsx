import { CheckCircle2, CircleMinus, Lock, RefreshCw, Repeat, TriangleAlert } from 'lucide-react';
import { STATE_LABEL, STATE_ORDER, type SessionState } from '@/lib/session-triage';

const ICON: Record<SessionState, typeof CheckCircle2> = {
  needsYou: TriangleAlert,
  audit: Repeat,
  ungradable: CircleMinus,
  grading: RefreshCw,
  auto: CheckCircle2,
  reviewed: CheckCircle2,
  finalised: Lock,
};

/** Màu chỉ để nhìn nhanh — mỗi đoạn và mỗi con số còn có biểu tượng và chữ (spec §2.1 luật 1). */
const SEGMENT: Record<SessionState, string> = {
  needsYou: 'bg-warning',
  audit: 'bg-primary',
  ungradable: 'bg-muted-foreground',
  grading: 'bg-info',
  auto: 'bg-success',
  reviewed: 'bg-accent',
  finalised: 'bg-primary/60',
};

/** Năm con số của spec §3.3 luôn hiện (kể cả 0: "trống thì nói là trống"); hai trạng thái còn lại khi có. */
const ALWAYS: SessionState[] = ['auto', 'audit', 'needsYou', 'ungradable', 'grading'];

/**
 * Thanh tổng quan của danh sách bài (spec §3.3): một dải tỉ lệ kèm các con số có biểu tượng. Đoạn nào 0 bài thì
 * không vẽ; cả dải được đọc ra cho trình đọc màn hình bằng ĐỦ các con số.
 */
export function OverviewBar({ counts }: { counts: Record<SessionState, number> }) {
  const total = STATE_ORDER.reduce((sum, s) => sum + counts[s], 0);
  if (total === 0) return null;

  const present = STATE_ORDER.filter((s) => counts[s] > 0);
  const summary = present.map((s) => `${counts[s]} ${STATE_LABEL[s]}`).join(', ');
  const chips = STATE_ORDER.filter((s) => ALWAYS.includes(s) || counts[s] > 0);

  return (
    <section aria-label="Tổng quan phiên" className="flex flex-col gap-3">
      <div
        role="img"
        aria-label={`Tổng quan ${total} bài: ${summary}`}
        className="flex h-3 w-full overflow-hidden rounded-full bg-border"
      >
        {present.map((s) => (
          <span
            key={s}
            data-segment={s}
            title={`${STATE_LABEL[s]}: ${counts[s]}`}
            className={SEGMENT[s]}
            style={{ width: `${(counts[s] / total) * 100}%` }}
          />
        ))}
      </div>
      <ul aria-label="Số bài theo trạng thái" className="flex flex-wrap gap-x-6 gap-y-2">
        {chips.map((s) => {
          const Icon = ICON[s];
          return (
            <li key={s} className="flex items-center gap-2 text-small">
              <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <span>{STATE_LABEL[s]}</span>
              <span className="font-semibold tabular-nums">{counts[s]}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

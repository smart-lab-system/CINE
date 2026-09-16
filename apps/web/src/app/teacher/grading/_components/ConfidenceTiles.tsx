'use client';

import { countBuckets, type Bucket } from '@/lib/grading-triage';
import type { GradingResult } from '@/lib/api/grading';

const TILES: { key: Bucket; tone: string; label: string; hint: string }[] = [
  {
    key: 'high',
    tone: 'success',
    label: 'Tin cậy cao',
    hint: 'Mọi trích dẫn đều tìm thấy trong bài làm.',
  },
  {
    key: 'low',
    tone: 'warning',
    label: 'Tin cậy thấp',
    hint: 'Một phần trích dẫn không đối chiếu được.',
  },
  {
    key: 'flagged',
    tone: 'danger',
    label: 'Cần bạn duyệt',
    hint: 'Lượt phản biện không đồng ý, hoặc trích dẫn chưa đối chiếu được.',
  },
  {
    key: 'stuck',
    tone: 'muted-foreground',
    label: 'Treo',
    hint: 'Quá hạn xử lý — chấm lại được ngay.',
  },
];

/**
 * Bốn ô phân loại, bấm để lọc danh sách bên dưới.
 *
 * Dòng giải thích dưới lưới KHÔNG phải chú thích thừa. Ngưỡng tự duyệt là
 * 0.85 còn trần tin cậy của bậc model đang chạy là 0.5, nên ở cấu hình hiện
 * tại không bài nào tự duyệt — con số ở ô "Cần bạn duyệt" vì thế luôn cao.
 * Không nói ra điều đó thì giảng viên đọc nó thành "AI chấm kém" và mất niềm
 * tin vào một hệ thống đang chạy đúng thiết kế.
 */
export function ConfidenceTiles({
  results,
  queueActive,
  active,
  onChange,
}: {
  results: GradingResult[];
  queueActive: number;
  active: Bucket;
  onChange: (bucket: Bucket) => void;
}) {
  const counts = countBuckets(results, queueActive);

  return (
    <section className="flex flex-col gap-2">
      <p className="section-label">Phân loại độ tin cậy · bấm để lọc</p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {TILES.map((tile) => (
          <button
            key={tile.key}
            type="button"
            aria-pressed={active === tile.key}
            onClick={() => onChange(tile.key)}
            style={{ borderLeftColor: `hsl(var(--${tile.tone}))` }}
            className={[
              'flex flex-col gap-1 rounded-lg border border-l-[3px] border-border bg-surface p-4',
              'text-left shadow-sm transition-[box-shadow,transform,background-color] duration-200 ease-smooth',
              'hover:-translate-y-0.5 hover:shadow-md',
              active === tile.key ? 'border-primary/40 bg-primary/[0.06]' : '',
            ].join(' ')}
          >
            <span className="text-display tabular-nums">{counts[tile.key]}</span>
            <span className="text-small font-semibold">{tile.label}</span>
            <span className="text-caption text-muted-foreground">{tile.hint}</span>
          </button>
        ))}
      </div>

      <p className="border-l-2 border-border pl-2.5 text-caption leading-relaxed text-muted-foreground">
        <span className="font-semibold text-foreground">
          {counts.flagged} bài được giữ lại để bạn duyệt — đây không phải lỗi.
        </span>{' '}
        Ở cấu hình hiện tại, hệ thống <span className="font-semibold">không tự duyệt bài nào</span>:
        mọi đề xuất điểm đều phải qua mắt người trước khi trở thành điểm thật. Toàn bộ bài có
        điểm trừ được chuyển sang đây để bạn bảo đảm công bằng cho sinh viên.
      </p>
    </section>
  );
}

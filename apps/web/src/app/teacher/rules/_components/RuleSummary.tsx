import { TriangleAlert } from 'lucide-react';
import type { Rule } from '@/lib/api/rules';

function Card({
  label,
  value,
  note,
  tone = 'default',
}: {
  label: string;
  value: string;
  note: string;
  tone?: 'default' | 'warning';
}) {
  return (
    <div
      className={`flex flex-col gap-1 rounded-lg border p-4 ${
        tone === 'warning' ? 'border-warning bg-warning/5' : 'border-border bg-surface'
      }`}
    >
      <span className="flex items-center gap-1.5 text-caption font-semibold text-muted-foreground">
        {tone === 'warning' && <TriangleAlert className="h-3.5 w-3.5 text-warning-strong" aria-hidden="true" />}
        {label}
      </span>
      <span className="text-h2 font-bold tabular-nums">{value}</span>
      <span className="text-caption text-muted-foreground">{note}</span>
    </div>
  );
}

/**
 * Bốn ô tổng quan của Bảng lỗi (spec §3.1).
 *
 * Hai điều KHÔNG làm, cố ý:
 * - Ô 2 không nói "N bài chờ" như mockup: cộng `appliedTo.results` của các luật chưa giá sẽ đếm hai lần một
 *   bài dính hai luật, và API không có số bài phân biệt. Một con số sai trông y hệt một con số đúng.
 * - Ô 4 (tỉ lệ mức trừ do máy quyết) chưa có route — hiện nhãn "cần backend", không hiện phần trăm bịa.
 */
export function RuleSummary({ rules, missingCount }: { rules: Rule[]; missingCount: number }) {
  const priced = rules.filter((r) => r.deduction !== null).length;
  const unpriced = rules.length - priced;

  return (
    <section aria-label="Tổng quan" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card
        label="Luật đã có giá"
        value={`${priced} / ${rules.length} luật`}
        note="Chỉ bài dính toàn luật có giá mới được tự quyết"
      />
      <Card
        label="Chưa có giá — đang chặn"
        value={`${unpriced} luật`}
        note="Bài dính luật chưa có giá thì không tự quyết được"
        tone={unpriced > 0 ? 'warning' : 'default'}
      />
      <Card
        label="Luật còn thiếu"
        value={`${missingCount} lỗi chưa có luật`}
        note="Agent gặp, nhưng bảng chưa có dòng nào khớp"
      />
      <div className="relative flex flex-col gap-1 rounded-lg border border-dashed border-border bg-surface p-4">
        <span className="absolute -top-2.5 right-3 rounded-sm border border-dashed border-border bg-background px-1.5 text-[0.625rem] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
          cần backend
        </span>
        <span className="text-caption font-semibold text-muted-foreground">Mức trừ do máy quyết</span>
        <span className="text-h2 font-bold text-muted-foreground">—</span>
        <span className="text-caption text-muted-foreground">
          Cần thống kê điểm trừ theo nguồn gốc trên các bài đã chấm — hệ thống chưa có route cho việc này.
        </span>
      </div>
    </section>
  );
}

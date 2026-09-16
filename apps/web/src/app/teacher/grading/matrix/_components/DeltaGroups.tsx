'use client';

import { useMemo } from 'react';
import { deltaGroupOf, type DeltaGroup } from '@/lib/grading-triage';
import type { GradingResult, Rubric } from '@/lib/api/grading';

const GROUPS: { key: DeltaGroup; tone: string; label: string; hint: string }[] = [
  {
    key: 'large',
    tone: 'danger',
    label: 'Lệch trên 1,5 điểm — cần đọc kỹ',
    hint: 'Chỉ nhóm này mới đáng mở bàn chấm chi tiết từng bài.',
  },
  {
    key: 'small',
    tone: 'warning',
    label: 'Lệch tới 1,5 điểm',
    hint: 'Chốt nhanh theo mức cao hơn cho cả nhóm.',
  },
  {
    key: 'zero',
    tone: 'success',
    label: 'Không lệch — hai lượt đồng thuận',
    hint: 'Giữ lại vì lý do kỹ thuật, không phải vì hai bên bất đồng về điểm.',
  },
  {
    key: 'no-advocate',
    tone: 'muted-foreground',
    label: 'Chưa có ý kiến phản biện',
    hint: 'Lượt phản biện không chạy cho những bài này — xác nhận điểm lượt chấm là đủ.',
  },
];

/**
 * Bốn nhóm theo khoảng cách giữa hai lượt, bấm để lọc bảng bên dưới.
 *
 * Nhóm thứ tư không có trong bản mẫu. Nó tồn tại vì bài không có ý kiến phản
 * biện thì KHÔNG tính được khoảng cách, và gộp nó vào "không lệch" là nói
 * dối — hai lượt không hề đồng thuận, chỉ có một lượt lên tiếng.
 */
export function DeltaGroups({
  results,
  rubric,
  active,
  onChange,
}: {
  results: GradingResult[];
  rubric: Rubric | undefined;
  active: DeltaGroup;
  onChange: (group: DeltaGroup) => void;
}) {
  const counts = useMemo(() => {
    const maxByCriterion = new Map(
      (rubric?.criteria ?? []).map((criterion) => [criterion.id, criterion.maxPoints]),
    );
    const out: Record<DeltaGroup, number> = { zero: 0, small: 0, large: 0, 'no-advocate': 0 };
    for (const result of results) {
      out[deltaGroupOf(result, maxByCriterion)] += 1;
    }
    return out;
  }, [results, rubric]);

  return (
    <section className="flex flex-col gap-2">
      <p className="section-label">Mức lệch giữa hai lượt · bấm để lọc</p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {GROUPS.map((group) => (
          <button
            key={group.key}
            type="button"
            aria-pressed={active === group.key}
            onClick={() => onChange(group.key)}
            style={{ borderLeftColor: `hsl(var(--${group.tone}))` }}
            className={[
              'flex flex-col gap-1 rounded-lg border border-l-[3px] border-border bg-surface p-4',
              'text-left shadow-sm transition-[box-shadow,transform,background-color] duration-200 ease-smooth',
              'hover:-translate-y-0.5 hover:shadow-md',
              active === group.key ? 'border-primary/40 bg-primary/[0.06]' : '',
            ].join(' ')}
          >
            <span className="text-display tabular-nums">{counts[group.key]}</span>
            <span className="text-small font-semibold">{group.label}</span>
            <span className="text-caption text-muted-foreground">{group.hint}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

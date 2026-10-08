'use client';

import { Pencil } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { RubricOverview } from '@/lib/api/rubric-errors';
import { formatVnPoints } from '@/lib/format';

const SHOWN = 3;

/** Dòng thông tin dưới ô chọn rubric: điểm tổng, số tiêu chí, nơi dùng, và lối sửa tiêu chí. */
export function RubricMeta({ overview, onEdit }: { overview: RubricOverview; onEdit: () => void }) {
  const shown = overview.sessions.slice(0, SHOWN);
  const more = overview.sessions.length - shown.length;
  return (
    <div className="mt-3.5 flex flex-wrap items-center gap-x-3.5 gap-y-1 px-0.5 text-small text-muted-foreground">
      <span>
        <b className="text-foreground">{formatVnPoints(overview.totalPoints)}</b> điểm · {overview.criteria.length} tiêu chí
      </span>
      <span className="flex flex-wrap items-center gap-x-1.5">
        Dùng ở:
        {shown.length === 0 && <span>chưa gắn phiên thi nào</span>}
        {shown.map((s, i) => (
          <span key={s.id} className="inline-flex items-center gap-1.5">
            {i > 0 && <span aria-hidden="true">·</span>}
            {s.name}
            {s.state === 'grading' && <Badge variant="primary">đang chấm</Badge>}
            {s.state === 'finalized' && <Badge>đã chốt</Badge>}
          </span>
        ))}
        {more > 0 && <span>và {more} phiên khác</span>}
      </span>
      <Button type="button" variant="ghost" size="sm" className="text-primary hover:text-primary" onClick={onEdit}>
        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
        Sửa tiêu chí &amp; điểm tối đa
      </Button>
    </div>
  );
}

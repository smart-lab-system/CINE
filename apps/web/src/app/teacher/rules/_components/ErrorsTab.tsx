'use client';

import { useEffect, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import type { OverviewCriterion, RubricErrorItem, RubricOverview } from '@/lib/api/rubric-errors';
import { CriterionGroup } from './CriterionGroup';
import { DetectionBadge } from './DetectionBadge';
import { MoveErrorDialog, RemoveErrorDialog } from './ErrorDialogs';
import { ErrorRow } from './ErrorRow';

/** Khoá của nhóm "Chưa có tiêu chí" (lỗi mồ côi) — dùng để cuộn tới nó (`focus`). */
export const DANGLING_KEY = '__dangling';

/**
 * Tab "Lỗi theo tiêu chí": một nhóm cho mỗi tiêu chí của rubric, và — nếu có — một nhóm "Chưa có tiêu chí" ở cuối
 * cho lỗi gắn tiêu chí đã bị xoá (spec 2.3.4). Một lỗi có khoá KHÔNG có trong tổng quan cũng rơi vào nhóm cuối dù
 * máy chủ chưa đánh dấu mồ côi (hai lần đọc lệch nhau): hiện được còn hơn làm sập trang (Review Focus 4).
 *
 * `focus` là yêu cầu "cuộn tới nhóm này và nháy khung" từ dải trạng thái; `n` đổi mỗi lần bấm để bấm lại cùng một
 * nhóm vẫn có tác dụng.
 */
export function ErrorsTab({
  overview,
  errors,
  loading,
  error,
  focus,
  onAdd,
  onEdit,
  onWaive,
  onUnwaive,
  onOpenRubric,
}: {
  overview: RubricOverview;
  errors: RubricErrorItem[] | undefined;
  loading: boolean;
  error: Error | null;
  focus: { key: string; n: number } | null;
  onAdd: (criterionKey: string | null) => void;
  onEdit: (item: RubricErrorItem) => void;
  onWaive: (criterion: OverviewCriterion) => void;
  onUnwaive: (criterion: OverviewCriterion) => void;
  onOpenRubric: (name: string) => void;
}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [pricing, setPricing] = useState<string | null>(null);
  const [moving, setMoving] = useState<RubricErrorItem | null>(null);
  const [removing, setRemoving] = useState<RubricErrorItem | null>(null);

  useEffect(() => {
    if (!focus) return;
    setCollapsed((prev) => ({ ...prev, [focus.key]: false }));
    const el = document.getElementById(`crit-${focus.key}`);
    if (!el) return;
    el.scrollIntoView({ block: 'center' });
    if (typeof el.animate === 'function') {
      el.animate([{ boxShadow: '0 0 0 3px hsl(var(--warning))' }, { boxShadow: '0 0 0 0 transparent' }], { duration: 1400 });
    }
  }, [focus]);

  if (loading) {
    return (
      <div className="mt-4 flex flex-col gap-2">
        <p className="text-small text-muted-foreground">Đang tải…</p>
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (error) {
    return (
      <Alert variant="destructive" className="mt-4">
        <AlertDescription>Không tải được danh sách lỗi — {error.message}. Thử tải lại trang.</AlertDescription>
      </Alert>
    );
  }

  const list = errors ?? [];
  const known = new Set(overview.criteria.map((c) => c.key));
  const dangling = list.filter((e) => e.criterionDangling || !known.has(e.criterionKey));

  const row = (item: RubricErrorItem, criterion?: OverviewCriterion) => (
    <ErrorRow
      key={item.id}
      item={item}
      criterion={criterion}
      rubricName={overview.rubricName}
      pricingOpen={pricing === item.id}
      onPricingOpenChange={(open) => setPricing((prev) => (open ? item.id : prev === item.id ? null : prev))}
      onEdit={() => onEdit(item)}
      onMove={() => setMoving(item)}
      onRemove={() => setRemoving(item)}
      onOpenRubric={onOpenRubric}
    />
  );

  return (
    <div>
      <div className="mx-0.5 mb-1 mt-3.5 flex flex-wrap gap-x-[18px] gap-y-1.5 text-small text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <DetectionBadge predicate={{ kind: 'test_group_failed', group: '' }} /> Máy so kết quả chạy test với đáp án: chắc chắn, không cần bạn xem.
        </span>
        <span className="flex items-center gap-1.5">
          <DetectionBadge predicate={null} /> AI đọc mã rồi kết luận: kém chắc chắn hơn nên có thể cần bạn duyệt.
        </span>
      </div>

      {overview.criteria.map((criterion) => {
        const rows = list.filter((e) => e.criterionKey === criterion.key && !e.criterionDangling);
        return (
          <CriterionGroup
            key={criterion.key}
            criterion={criterion}
            errors={rows}
            open={!collapsed[criterion.key]}
            onToggle={() => setCollapsed((prev) => ({ ...prev, [criterion.key]: !prev[criterion.key] }))}
            onAdd={() => onAdd(criterion.key)}
            onWaive={() => onWaive(criterion)}
            onUnwaive={() => onUnwaive(criterion)}
          >
            {rows.map((item) => row(item, criterion))}
          </CriterionGroup>
        );
      })}

      {dangling.length > 0 && (
        <section id={`crit-${DANGLING_KEY}`} aria-label="Chưa có tiêu chí" className="mt-3.5 rounded-lg border border-warning/40 bg-surface shadow-sm">
          <div className="flex items-center gap-3 px-4 py-3.5">
            <h3 className="min-w-0 flex-1 text-h3">Chưa có tiêu chí</h3>
            <Badge>{dangling.length} lỗi</Badge>
          </div>
          <p className="px-4 pb-3 text-small text-muted-foreground">
            Các lỗi này gắn với tiêu chí đã bị xoá khỏi rubric nên chưa được tính vào điểm. Chuyển chúng sang tiêu chí khác hoặc gỡ khỏi rubric.
          </p>
          <div className="border-t border-border">{dangling.map((item) => row(item))}</div>
        </section>
      )}

      <MoveErrorDialog item={moving} criteria={overview.criteria} onClose={() => setMoving(null)} />
      <RemoveErrorDialog item={removing} rubricName={overview.rubricName} onClose={() => setRemoving(null)} />
    </div>
  );
}

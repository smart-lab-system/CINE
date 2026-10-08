'use client';

import { Info } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { RubricOverview } from '@/lib/api/rubric-errors';
import type { LibraryRule } from '@/lib/api/rules';
import { shorten } from '@/lib/rubric-board';
import { deductionLabel } from '@/lib/rules-vocab';
import { DetectionBadge } from './DetectionBadge';
import { UsesMore } from './UsesMore';

const SHOWN = 3;

/**
 * Thư viện lỗi: danh tính lỗi dùng chung (tên, mô tả, cách phát hiện). Không có cột điểm trừ chung vì điểm trừ mỗi
 * rubric một khác (D1) — thay vào đó mỗi lỗi liệt kê nơi nó đang dùng, chặn trần ba dòng (T-RBE-UI-8).
 */
export function LibraryTab({
  rules,
  loading,
  error,
  overviews,
  onEdit,
  onOpenRubric,
}: {
  rules: LibraryRule[] | undefined;
  loading: boolean;
  error: Error | null;
  overviews: RubricOverview[];
  onEdit: (rule: LibraryRule) => void;
  onOpenRubric: (name: string) => void;
}) {
  if (loading) {
    return (
      <div className="mt-4 flex flex-col gap-2">
        <p className="text-small text-muted-foreground">Đang tải…</p>
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }
  if (error) {
    return (
      <Alert variant="destructive" className="mt-4">
        <AlertDescription>Không tải được thư viện lỗi — {error.message}. Thử tải lại trang.</AlertDescription>
      </Alert>
    );
  }

  const title = (rubricName: string, key: string) =>
    shorten(overviews.find((o) => o.rubricName === rubricName)?.criteria.find((c) => c.key === key)?.description ?? 'tiêu chí đã xoá', 40);
  const list = rules ?? [];

  return (
    <div>
      <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-primary/20 bg-primary-subtle px-4 py-3 text-primary">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          Đây là danh sách các lỗi bạn đã viết. <b>Sửa ở đây là đổi cho tất cả rubric đang dùng lỗi đó.</b> Muốn đổi riêng một rubric: mở rubric đó, bấm ⋯ ở dòng lỗi rồi chọn Sửa. <b>Tiêu chí và điểm trừ thì mỗi rubric một khác</b>, nên không có cột điểm trừ chung ở đây.
        </span>
      </div>

      {list.length === 0 ? (
        <p className="mt-4 text-muted-foreground">Thư viện chưa có lỗi nào. Lỗi bạn thêm vào rubric sẽ xuất hiện ở đây.</p>
      ) : (
        <div className="mt-3.5 overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
          {list.map((rule) => {
            const shown = rule.uses.slice(0, SHOWN);
            const more = rule.uses.length - shown.length;
            return (
              <div
                key={rule.id}
                data-testid="library-row"
                className="flex flex-col gap-3 border-t border-border px-4 py-3 first:border-t-0 lg:grid lg:grid-cols-[minmax(0,1.1fr)_140px_minmax(0,1.4fr)_120px] lg:items-center lg:gap-4"
              >
                <div className="min-w-0">
                  <b className="font-semibold">{rule.revision.name}</b>
                  <p className="text-small text-muted-foreground">{rule.revision.description}</p>
                </div>
                <div>
                  <DetectionBadge predicate={rule.revision.predicate} />
                </div>
                <div className="flex flex-col gap-1 text-small">
                  {rule.uses.length === 0 && <span className="text-muted-foreground">Chưa dùng ở rubric nào</span>}
                  {shown.map((u) => (
                    <div key={u.rubricName} className="flex flex-wrap items-baseline gap-1.5">
                      <span>{`${u.rubricName} · ${title(u.rubricName, u.criterionKey)}`}</span>
                      <b className="tabular-nums">{deductionLabel(u.deduction)}</b>
                    </div>
                  ))}
                  {more > 0 && (
                    <div>
                      <UsesMore
                        label={`và ${more} nơi dùng khác`}
                        title={`${rule.revision.name} — đang dùng ở ${rule.uses.length} nơi`}
                        items={rule.uses.map((u) => ({
                          key: u.rubricName,
                          name: u.rubricName,
                          sub: title(u.rubricName, u.criterionKey),
                          value: deductionLabel(u.deduction),
                        }))}
                        onPick={onOpenRubric}
                      />
                    </div>
                  )}
                </div>
                <div className="flex lg:justify-end">
                  <Button type="button" size="sm" variant="outline" aria-label={`Sửa lỗi ${rule.revision.name}`} onClick={() => onEdit(rule)}>
                    Sửa lỗi
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

'use client';

import { useState } from 'react';
import { Info, Plus, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useDismissRule } from '@/hooks/useRules';
import type { RubricOverview } from '@/lib/api/rubric-errors';
import type { ProposalItem } from '@/lib/api/rules';
import { capNames } from '@/lib/rubric-board';
import { describeRecompute } from '@/lib/rules-vocab';

/**
 * "Lỗi AI đề xuất" (spec D5): lỗi agent gặp khi chấm mà bảng chưa có dòng nào khớp. Mỗi thẻ nói rõ nó thấy ở phiên
 * nào, bao nhiêu bài (của rubric đang mở), và rằng lỗi đó ĐANG BỊ BỎ KHỎI ĐIỂM — hệ thống không đoán lỗi gần nhất.
 * "Không phải lỗi" đổi điểm các phiên chưa chốt nên luôn hỏi xác nhận trước.
 */
export function ProposalsTab({
  overview,
  proposals,
  loading,
  error,
  onAdd,
}: {
  overview: RubricOverview;
  proposals: ProposalItem[] | undefined;
  loading: boolean;
  error: Error | null;
  onAdd: (proposal: ProposalItem) => void;
}) {
  const [confirming, setConfirming] = useState<ProposalItem | null>(null);
  const dismiss = useDismissRule();

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
        <AlertDescription>Không tải được lỗi AI đề xuất — {error.message}. Thử tải lại trang.</AlertDescription>
      </Alert>
    );
  }
  const list = proposals ?? [];
  if (list.length === 0) {
    return (
      <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-primary/20 bg-primary-subtle px-4 py-3 text-primary">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>AI chưa báo lỗi nào ngoài bảng ở rubric này.</span>
      </div>
    );
  }

  return (
    <div>
      <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-warning/40 bg-warning-subtle px-4 py-3 text-warning-strong">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          <b>{list.length} lỗi AI thấy khi chấm nhưng chưa có trong bảng.</b> Các lỗi này đang <b>bị bỏ ra khỏi điểm</b> — hệ thống không tự đoán lỗi gần nhất. Thêm vào rubric này, hoặc đánh dấu “không phải lỗi”.
        </span>
      </div>

      <ul className="mt-3.5 grid gap-3.5 md:grid-cols-2">
        {list.map((p) => (
          <li key={p.id} className="flex flex-col justify-between gap-3 rounded-lg border border-border bg-surface p-4 shadow-sm">
            <div>
              <h3 className="text-body font-semibold">{p.name}</h3>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {p.legacy ? (
                  <Badge>Chưa rõ thấy ở đâu</Badge>
                ) : (
                  <>
                    <Badge>Thấy ở {p.sightings.results} bài</Badge>
                    {p.sightings.sessions.length > 0 && <Badge>{capNames(p.sightings.sessions.map((s) => s.name), 2, 'phiên')}</Badge>}
                  </>
                )}
                <Badge>Rubric: {overview.rubricName}</Badge>
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="outline" className="border-primary text-primary" onClick={() => onAdd(p)}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Thêm vào rubric này
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setConfirming(p)}>
                Không phải lỗi
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <Dialog open={confirming !== null} onOpenChange={(open) => !open && setConfirming(null)}>
        <DialogContent>
          {confirming && (
            <>
              <DialogHeader>
                <DialogTitle>Đánh dấu “không phải lỗi”?</DialogTitle>
                <DialogDescription>Lỗi này sẽ không xuất hiện ở bài nữa; các bài đang chờ nó được tính lại.</DialogDescription>
              </DialogHeader>
              <p className="text-small text-muted-foreground">{confirming.name}</p>
              {dismiss.isError && (
                <Alert variant="destructive">
                  <AlertDescription>{dismiss.error?.message}</AlertDescription>
                </Alert>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setConfirming(null)}>
                  Huỷ
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  loading={dismiss.isPending}
                  onClick={() => {
                    const target = confirming;
                    dismiss.mutate(
                      { ruleId: target.id },
                      {
                        onSuccess: (r) => {
                          toast.success(`Đã đánh dấu “${target.name}” là không phải lỗi. ${describeRecompute(r.recompute)}`);
                          setConfirming(null);
                        },
                      },
                    );
                  }}
                >
                  Đánh dấu không phải lỗi
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

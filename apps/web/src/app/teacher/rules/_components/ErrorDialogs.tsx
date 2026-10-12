'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { useMoveError, useRemoveError } from '@/hooks/useRubricErrors';
import type { OverviewCriterion, RubricErrorItem } from '@/lib/api/rubric-errors';
import { formatVnPoints } from '@/lib/format';
import { shorten } from '@/lib/rubric-board';
import { describeRecompute } from '@/lib/rules-vocab';

/** "Chuyển sang tiêu chí khác": chỉ đổi ở rubric đang mở; chọn tiêu chí đích rồi xác nhận. */
export function MoveErrorDialog({
  item,
  criteria,
  onClose,
}: {
  item: RubricErrorItem | null;
  criteria: OverviewCriterion[];
  onClose: () => void;
}) {
  return (
    <Dialog open={item !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>{item && <MoveBody key={item.id} item={item} criteria={criteria} onClose={onClose} />}</DialogContent>
    </Dialog>
  );
}

function MoveBody({ item, criteria, onClose }: { item: RubricErrorItem; criteria: OverviewCriterion[]; onClose: () => void }) {
  const [target, setTarget] = useState('');
  const move = useMoveError();
  // Lỗi mồ côi mang khoá không có trong `criteria`, nên lọc theo khoá vẫn đúng: mọi tiêu chí hiện hành đều là đích.
  const options = criteria.filter((c) => c.key !== item.criterionKey);
  const chosen = options.find((c) => c.key === target);

  return (
    <>
      <DialogHeader>
        <DialogTitle>Chuyển “{item.name}” sang tiêu chí khác</DialogTitle>
        <DialogDescription>Chỉ đổi ở rubric này. Các bài chưa chốt của rubric này được tính lại.</DialogDescription>
      </DialogHeader>
      <FormField id="move-target" label="Tiêu chí mới">
        <select
          id="move-target"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          className="h-10 w-full rounded-md border border-input bg-surface px-3 text-body"
        >
          <option value="">Chọn tiêu chí…</option>
          {options.map((c) => (
            <option key={c.key} value={c.key}>
              {shorten(c.description, 60)} · tối đa {formatVnPoints(c.maxPoints)}
            </option>
          ))}
        </select>
      </FormField>
      {move.isError && (
        <Alert variant="destructive">
          <AlertDescription>{move.error?.message}</AlertDescription>
        </Alert>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Huỷ
        </Button>
        <Button
          type="button"
          variant="primary"
          disabled={!chosen}
          loading={move.isPending}
          onClick={() => {
            if (!chosen) return;
            move.mutate(
              { rubricErrorId: item.id, criterionKey: chosen.key },
              {
                onSuccess: (r) => {
                  toast.success(`Đã chuyển “${item.name}” sang “${shorten(chosen.description, 60)}”. ${describeRecompute(r.recompute)}`);
                  onClose();
                },
              },
            );
          }}
        >
          Chuyển
        </Button>
      </DialogFooter>
    </>
  );
}

/** "Gỡ khỏi rubric này": hỏi xác nhận vì bài chưa chốt của rubric được tính lại; lỗi vẫn còn ở thư viện. */
export function RemoveErrorDialog({
  item,
  rubricName,
  onClose,
}: {
  item: RubricErrorItem | null;
  rubricName: string;
  onClose: () => void;
}) {
  return (
    <Dialog open={item !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>{item && <RemoveBody key={item.id} item={item} rubricName={rubricName} onClose={onClose} />}</DialogContent>
    </Dialog>
  );
}

function RemoveBody({ item, rubricName, onClose }: { item: RubricErrorItem; rubricName: string; onClose: () => void }) {
  const remove = useRemoveError();
  return (
    <>
      <DialogHeader>
        <DialogTitle>
          Gỡ “{item.name}” khỏi rubric “{rubricName}”?
        </DialogTitle>
        <DialogDescription>
          Lỗi vẫn còn trong Thư viện lỗi, các rubric khác không đổi. Các bài chưa chốt của rubric này được tính lại — lỗi này sẽ không còn bị trừ ở đó.
        </DialogDescription>
      </DialogHeader>
      {remove.isError && (
        <Alert variant="destructive">
          <AlertDescription>{remove.error?.message}</AlertDescription>
        </Alert>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Huỷ
        </Button>
        <Button
          type="button"
          variant="destructive"
          loading={remove.isPending}
          onClick={() =>
            remove.mutate(item.id, {
              onSuccess: (r) => {
                toast.success(`Đã gỡ “${item.name}” khỏi “${rubricName}”. ${describeRecompute(r.recompute)}`);
                onClose();
              },
            })
          }
        >
          Gỡ khỏi rubric này
        </Button>
      </DialogFooter>
    </>
  );
}

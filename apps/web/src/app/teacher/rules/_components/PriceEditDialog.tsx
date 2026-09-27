'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { usePreviewPrice, useSetPrice } from '@/hooks/useRules';
import type { Rule } from '@/lib/api/rules';

/**
 * Giá KHÔNG lưu được cho tới khi đã xem trước (T-POL-5, spec UI 3.1) — nút
 * "Lưu giá" tắt cho tới khi có `preview.data`, và đổi số thì phải xem trước
 * lại từ đầu (đặt lại `preview` khi input đổi).
 */
export function PriceEditDialog({ rule, onClose }: { rule: Rule | null; onClose: () => void }) {
  const [deduction, setDeduction] = useState(rule?.deduction ?? '');
  const preview = usePreviewPrice();
  const setPrice = useSetPrice();

  if (!rule) return null;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Giá của {rule.ruleKey}</DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <Input
            value={deduction}
            onChange={(e) => {
              setDeduction(e.target.value);
              preview.reset();
            }}
            placeholder="Mức trừ, ví dụ 1.50"
          />
          <Button
            variant="outline"
            onClick={() => preview.mutate({ ruleId: rule.id, deduction: deduction || null })}
            disabled={preview.isPending}
          >
            Xem trước
          </Button>
        </div>

        {preview.data && (
          <div className="rounded-md border border-border bg-surface p-3 text-small">
            {preview.data.openSessions.length === 0 && preview.data.finalizedSessions.length === 0 ? (
              <p className="text-muted-foreground">Giá này chưa áp vào bài nào.</p>
            ) : (
              <>
                {preview.data.openSessions.map((s) => (
                  <p key={s.sessionId}>
                    <span className="font-medium">{s.name}</span>: {s.affected} bài, {s.autoAfter} bài tự duyệt được
                    sau khi lưu
                    {s.blockedByOtherUnpriced > 0 && `, ${s.blockedByOtherUnpriced} bài vẫn chờ luật khác`}
                  </p>
                ))}
                {preview.data.finalizedSessions.map((s) => (
                  <p key={s.sessionId} className="text-muted-foreground">
                    <span className="font-medium">{s.name}</span> (đã chốt): {s.affected} bài — không tự áp lại
                  </p>
                ))}
              </>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Huỷ
          </Button>
          <Button
            onClick={() =>
              setPrice.mutate({ ruleId: rule.id, deduction: deduction || null }, { onSuccess: onClose })
            }
            disabled={!preview.data || setPrice.isPending}
          >
            Lưu giá
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

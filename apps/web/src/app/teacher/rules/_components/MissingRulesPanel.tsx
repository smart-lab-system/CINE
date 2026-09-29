'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useSetRuleState } from '@/hooks/useRules';
import { describeRecompute } from '@/lib/rules-vocab';
import type { Rule } from '@/lib/api/rules';

/**
 * "Luật còn thiếu" (spec §3.1, T-RULE-1): lỗi agent gặp mà không luật nào khớp. Mỗi thẻ nói rõ lỗi đó ĐÃ BỊ
 * LOẠI KHỎI ĐIỂM, và cho hai đường: tạo luật thật từ đó, hoặc nói nó không phải lỗi.
 *
 * API không trả số bài / tên phiên của một luật đề xuất, nên thẻ chỉ có mô tả — không bịa "gặp ở N bài".
 * "Không phải lỗi" làm điểm của các phiên chưa chốt đổi ⇒ luôn hỏi xác nhận nói hệ quả trước (luật 4).
 */
export function MissingRulesPanel({ rules }: { rules: Rule[] }) {
  const [confirming, setConfirming] = useState<Rule | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const setState = useSetRuleState();

  if (rules.length === 0 && result === null) return null;

  return (
    <section aria-label="Luật còn thiếu" className="flex flex-col gap-3 rounded-lg border border-border bg-surface-2/40 p-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-h3">Luật còn thiếu</h2>
        <p className="text-small text-muted-foreground">
          Lỗi agent gặp mà bảng chưa có dòng nào khớp. Lỗi này đã bị <strong className="text-foreground">loại khỏi điểm</strong>{' '}
          — hệ thống không đoán luật gần nhất.
        </p>
      </div>

      {result && (
        <Alert variant="success" role="status">
          <AlertDescription>{result}</AlertDescription>
        </Alert>
      )}

      <ul className="grid gap-3 md:grid-cols-2">
        {rules.map((rule) => (
          <li key={rule.id} className="flex flex-col justify-between gap-3 rounded-lg border border-border bg-surface p-3.5">
            <div className="flex flex-col gap-1">
              <span className="text-small font-semibold">{rule.revision.description}</span>
              <span className="text-caption text-muted-foreground">Agent báo lỗi này, chưa có luật nào khớp.</span>
            </div>
            <div className="flex items-center gap-2">
              <Button asChild size="sm">
                <Link href={`/teacher/rules/new?from=${rule.id}`}>Tạo luật từ đây</Link>
              </Button>
              <Button size="sm" variant="outline" onClick={() => setConfirming(rule)}>
                Không phải lỗi
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <Dialog open={confirming !== null} onOpenChange={(open) => !open && setConfirming(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Đánh dấu &quot;không phải lỗi&quot;?</DialogTitle>
            <DialogDescription>
              Bài nào đang chờ luật này sẽ được tính lại; lỗi này sẽ không xuất hiện ở bài nữa.
            </DialogDescription>
          </DialogHeader>
          {confirming && <p className="text-small text-muted-foreground">{confirming.revision.description}</p>}
          {setState.isError && (
            <Alert variant="destructive">
              <AlertDescription>{setState.error.message}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(null)}>
              Huỷ
            </Button>
            <Button
              loading={setState.isPending}
              onClick={() => {
                if (!confirming) return;
                setState.mutate(
                  { ruleId: confirming.id, state: 'dismissed' },
                  {
                    onSuccess: (data) => {
                      setResult(describeRecompute(data.recompute));
                      setConfirming(null);
                    },
                  },
                );
              }}
            >
              Đánh dấu không phải lỗi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

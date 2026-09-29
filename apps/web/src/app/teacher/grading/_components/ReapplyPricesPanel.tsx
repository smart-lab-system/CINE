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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useReapplyPreview, useReapplyPrices } from '@/hooks/useGrading';
import { formatVnPoints } from '@/lib/format';
import { formatDeductionString } from '@/lib/rules-vocab';

/** Mức trừ dạng chuỗi thập phân theo ĐIỂM ("1.50") → "−1,5"; chưa có giá thì nói "chưa giá", không "—". */
const deduction = (d: string | null) => (d === null ? 'chưa giá' : formatDeductionString(d));

/**
 * "Áp giá mới cho phiên đã chốt" (spec §3.1, §3.10, T-UI-21).
 *
 * Đổi giá ở Bảng lỗi KHÔNG tự đổi điểm phiên đã chốt — bảng giá đã ghim lúc chốt. Muốn áp giá hiện hành phải làm
 * một thao tác riêng: xem trước (bài nào đổi điểm, luật nào đổi mức trừ), rồi xác nhận, và mỗi bài đổi điểm có một
 * dòng nhật ký. Server từ chối CẢ LƯỢT khi còn bài dính luật lúc chốt có giá mà nay chưa có giá — nên nút áp chỉ
 * bật khi bản xem trước không có bài nào "không áp được".
 */
export function ReapplyPricesPanel({ sessionId }: { sessionId: string }) {
  const preview = useReapplyPreview(sessionId);
  const apply = useReapplyPrices(sessionId);
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState<number | null>(null);

  const plan = preview.data;
  const changes = plan?.changes ?? [];
  const skipped = plan?.skipped ?? [];
  const canApply = plan !== undefined && changes.length > 0 && skipped.length === 0 && !apply.isPending;

  return (
    <section aria-label="Áp giá mới cho phiên đã chốt" className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-h3">Áp giá mới cho phiên đã chốt</h2>
        <p className="text-small text-muted-foreground">
          Đổi giá ở Bảng lỗi không tự đổi điểm phiên đã chốt — bảng giá đã ghim lúc chốt. Muốn áp giá hiện hành, xem
          trước rồi áp: mỗi bài đổi điểm có một dòng nhật ký.
        </p>
      </div>

      {done !== null && (
        <Alert variant="success" role="status">
          <AlertDescription>Đã áp giá mới cho {done} bài.</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" loading={preview.isPending} onClick={() => preview.mutate()}>
          Xem trước
        </Button>
        {preview.isPending && <span className="text-small text-muted-foreground">Đang tính…</span>}
        <Button type="button" disabled={!canApply} onClick={() => setConfirming(true)}>
          {changes.length > 0 ? `Áp giá mới cho ${changes.length} bài` : 'Áp giá mới cho phiên đã chốt'}
        </Button>
      </div>

      {preview.isError && (
        <Alert variant="destructive">
          <AlertDescription>{preview.error.message}</AlertDescription>
        </Alert>
      )}

      {plan && changes.length === 0 && skipped.length === 0 && (
        <p className="text-small text-muted-foreground">Giá hiện hành không làm đổi điểm bài nào.</p>
      )}

      {skipped.length > 0 && (
        <Alert variant="warning">
          <AlertDescription className="flex flex-col gap-1">
            <span className="font-semibold">{skipped.length} bài không áp được</span>
            <span>
              Luật lúc chốt có giá nay chưa có giá — công bố như vậy là công bố một lỗi miễn phí, nên máy chủ từ chối cả
              lượt. Đặt giá trước.
            </span>
            <span>
              Luật:{' '}
              {[...new Set(skipped.flatMap((s) => s.ruleKeys))].sort().map((key, i) => (
                <span key={key}>
                  {i > 0 && ', '}
                  <span className="font-mono">{key}</span>
                </span>
              ))}
            </span>
            <Link href="/teacher/rules" className="font-semibold underline underline-offset-2">
              Đặt giá ở Bảng lỗi
            </Link>
          </AlertDescription>
        </Alert>
      )}

      {changes.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bài</TableHead>
                <TableHead>Điểm</TableHead>
                <TableHead>Chiều</TableHead>
                <TableHead>Luật đổi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {changes.map((c) => {
                const before = Number(c.oldScore);
                const after = Number(c.newScore);
                return (
                  <TableRow key={c.resultId}>
                    <TableCell>
                      <Link
                        href={`/teacher/grading/${c.resultId}?sessionId=${sessionId}`}
                        className="font-mono text-caption text-accent-strong hover:underline"
                      >
                        {c.resultId.slice(0, 8)}
                      </Link>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      <span>{formatVnPoints(before)}</span> → <span className="font-semibold">{formatVnPoints(after)}</span>
                    </TableCell>
                    <TableCell className="text-small font-semibold">
                      {after < before ? '↓ Giảm' : after > before ? '↑ Tăng' : '= Không đổi'}
                    </TableCell>
                    <TableCell className="text-small">
                      <ul className="flex flex-col gap-0.5">
                        {c.changedRules.map((r) => (
                          <li key={r.ruleId} className="flex flex-wrap items-baseline gap-2">
                            <span className="font-mono">{r.ruleKey}</span>
                            <span className="tabular-nums">
                              {deduction(r.oldDeduction)} → {deduction(r.newDeduction)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={confirming} onOpenChange={(open) => !open && setConfirming(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Áp giá mới cho {changes.length} bài?</DialogTitle>
            <DialogDescription>
              {changes.length} bài đã công bố sẽ đổi điểm theo bảng giá hiện hành. Mỗi bài đổi điểm có một dòng nhật ký
              mang tên bạn: điểm cũ, điểm mới, luật và mức trừ đã đổi.
            </DialogDescription>
          </DialogHeader>
          {apply.isError && (
            <Alert variant="destructive">
              <AlertDescription>{apply.error.message}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirming(false)}>
              Huỷ
            </Button>
            <Button
              type="button"
              loading={apply.isPending}
              onClick={() =>
                apply.mutate(undefined, {
                  onSuccess: (data) => {
                    setDone(data.changed);
                    setConfirming(false);
                    preview.reset();
                  },
                })
              }
            >
              Áp giá mới
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

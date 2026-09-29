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
import { NeedsBackend } from '@/components/needs-backend';
import { useFinalizeGrades } from '@/hooks/useGrading';
import { blockers, finalizeCounts } from '@/lib/session-triage';
import type { GradingResult } from '@/lib/api/grading';
import { ExportCsvButton } from './ExportCsvButton';
import { ReapplyPricesPanel } from './ReapplyPricesPanel';

/**
 * Chốt điểm phiên (spec §3.10) — MỘT thao tác riêng, không gộp vào việc ghi file. Ba tình huống: còn bài chưa xong ·
 * sẵn sàng · đã chốt.
 *
 * - Chốt là mốc CÔNG BỐ (nói ngay ở đầu): không ghi file nào; tên người bấm ghi lên từng bài.
 * - Chưa chốt được: từng nhóm đang chặn (đúng tập `BLOCKS_FINALIZE`), mỗi nhóm một con số và một lối đi.
 * - Hộp xác nhận nói đúng HAI con số — bài theo điểm hệ thống tự quyết mà bạn chưa mở, và bài bạn đã xem — cộng lại
 *   bằng số bài của phiên (T-UI-16), kèm hậu quả.
 * - Xuất điểm chỉ mở SAU khi chốt: ghi ra ngoài một con số chưa công bố là sai thứ tự.
 */
export function FinalizePanel({
  sessionId,
  session,
  results,
}: {
  sessionId: string;
  session: { name: string; code: string };
  results: GradingResult[];
}) {
  const finalize = useFinalizeGrades(sessionId);
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState<{ reviewedByHand: number; acceptedAsProposed: number; finalizedDirectly: number } | null>(null);

  const list = `/teacher/grading?sessionId=${sessionId}`;
  const claim = (
    <p className="rounded-lg border border-border bg-surface-2 p-4 text-small">
      <strong>Chốt là mốc công bố</strong> — chốt không ghi file nào. Tên bạn được ghi lên từng bài đã chốt, kể cả bài
      hệ thống tự quyết mà không ai mở.
    </p>
  );

  if (results.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        {claim}
        <p className="text-small text-muted-foreground">
          Chưa chấm bài nào — chưa có gì để chốt.{' '}
          <Link href={list} className="font-semibold underline underline-offset-2">
            Về danh sách bài
          </Link>
        </p>
      </div>
    );
  }

  const block = blockers(results);
  const counts = finalizeCounts(results);
  const allFinal = counts.alreadyFinal === results.length;

  const groups = [
    { key: 'needsYou', n: block.needsYou, label: `${block.needsYou} bài cần bạn xem`, state: 'needsYou' },
    { key: 'audit', n: block.audit, label: `${block.audit} bài kiểm mẫu chưa kiểm`, state: 'audit', needsBackend: true },
    { key: 'ungradable', n: block.ungradable, label: `${block.ungradable} bài không chấm được`, state: 'ungradable' },
    { key: 'grading', n: block.grading, label: `${block.grading} bài đang chấm`, state: 'grading' },
  ].filter((g) => g.n > 0);

  return (
    <div className="flex flex-col gap-6">
      {claim}

      {done && (
        <Alert variant="success" role="status">
          <AlertDescription>
            Đã chốt: {done.acceptedAsProposed + done.finalizedDirectly} bài theo điểm hệ thống, {done.reviewedByHand} bài bạn đã
            xem.
          </AlertDescription>
        </Alert>
      )}

      {allFinal ? (
        <>
          <p className="text-small text-muted-foreground">
            Điểm của phiên này đã chốt. Sửa điểm từ giờ sẽ được ghi vào nhật ký.
          </p>
          <ReapplyPricesPanel sessionId={sessionId} />
          <div className="flex flex-wrap items-center gap-3">
            <ExportCsvButton sessionName={session.name} sessionCode={session.code} results={results} />
          </div>
          <section
            aria-label="Ghi điểm vào sổ điểm"
            className="flex flex-col gap-1 rounded-lg border border-dashed border-border p-4"
          >
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-small font-semibold">Ghi điểm vào sổ điểm — tính năng dự kiến</h2>
              <NeedsBackend />
            </div>
            <p className="text-caption text-muted-foreground">
              Tải file sổ điểm của trường, chọn cột, xem trước rồi ghi. Chỉ mở sau khi chốt. Hôm nay dùng &quot;Xuất
              CSV&quot; ở trên.
            </p>
          </section>
        </>
      ) : block.remaining > 0 ? (
        <div className="flex flex-col gap-4">
          <ul aria-label="Đang chặn việc chốt" className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface">
            {groups.map((g) => (
              <li key={g.key} className="flex flex-wrap items-center justify-between gap-3 p-3">
                <span className="flex flex-wrap items-center gap-2 text-small font-medium">
                  <span>{g.label}</span>
                  {g.needsBackend && <NeedsBackend />}
                </span>
                <Link
                  href={`${list}&state=${g.state}`}
                  className="text-small font-semibold text-accent-strong hover:underline"
                >
                  Xem {g.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-2">
            <Button type="button" className="self-start" disabled title={`Còn ${block.remaining} bài chưa xong.`}>
              Chốt điểm phiên
            </Button>
            <p className="text-caption text-muted-foreground">
              Còn {block.remaining} bài chưa xong — xử lý hết rồi mới chốt được.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-small text-muted-foreground">
            Không còn bài nào chặn. Chốt để công bố điểm của cả phiên.
          </p>
          <Button type="button" className="self-start" onClick={() => setConfirming(true)}>
            Chốt điểm phiên
          </Button>
        </div>
      )}

      <Dialog open={confirming} onOpenChange={(open) => !open && setConfirming(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Chốt điểm cả phiên?</DialogTitle>
            <DialogDescription>
              Bạn đang chốt <strong>{counts.acceptedUnopened} bài</strong> theo điểm hệ thống tự quyết mà bạn chưa mở, và{' '}
              <strong>{counts.reviewed} bài</strong> bạn đã xem.
              {counts.alreadyFinal > 0 && <> {counts.alreadyFinal} bài đã chốt từ trước.</>}
            </DialogDescription>
          </DialogHeader>
          <p className="text-small text-muted-foreground">
            Từ lúc chốt, mọi thay đổi điểm đều được ghi vào nhật ký — khi bạn sửa tay, và khi bạn chủ động áp giá mới cho
            phiên đã chốt. Đổi giá ở Bảng lỗi không tự đổi điểm phiên đã chốt.
          </p>
          {finalize.isError && (
            <Alert variant="destructive">
              <AlertDescription>{finalize.error.message}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirming(false)}>
              Huỷ
            </Button>
            <Button
              type="button"
              loading={finalize.isPending}
              onClick={() =>
                finalize.mutate(undefined, {
                  onSuccess: (data) => {
                    setDone(data);
                    setConfirming(false);
                  },
                })
              }
            >
              Chốt điểm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

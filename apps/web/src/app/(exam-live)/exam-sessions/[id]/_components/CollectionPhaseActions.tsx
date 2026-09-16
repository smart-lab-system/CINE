'use client';

import { useState } from 'react';
import { CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { SUBMISSION_GRACE_MS } from '@/lib/submission-attention';
import type { RecollectResult } from '@/lib/api/exam-session';

interface CollectionPhaseActionsProps {
  /** Chỉ render khi `'collecting'`. Mọi giá trị khác trả về null. */
  status: string;
  /** Bao nhiêu máy lệnh "Thu lại" sẽ nhắm tới — xem countRecollectTargets. */
  missingCount: number;
  /**
   * Thời điểm dữ liệu sinh ra `missingCount`. Hiện ra màn hình chứ không
   * chỉ giữ trong đầu: xem doc của `countedAtLabel` bên dưới.
   */
  countedAt: number | null;
  /** Giờ kết thúc theo lịch — cộng grace ra hạn chót nhận bài. */
  endTime: string;
  recollecting: boolean;
  recollectError: Error | null;
  onRecollect: () => Promise<RecollectResult>;
  confirming: boolean;
  confirmError: Error | null;
  onConfirmEnd: () => Promise<unknown>;
}

function formatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

function formatClockWithSeconds(ms: number): string {
  return new Date(ms).toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * Hai nút của giai đoạn "Đang thu bài" (spec §7), đặt ngay trên màn hình
 * phòng thi — nơi giảng viên đang đứng khi thao tác.
 *
 * Thuần props, không tự gọi API: cùng khuôn AttendancePanel và
 * FinalizeSessionButton, và nhờ vậy nó test được mà không cần
 * QueryClient.
 */
export function CollectionPhaseActions({
  status,
  missingCount,
  countedAt,
  endTime,
  recollecting,
  recollectError,
  onRecollect,
  confirming,
  confirmError,
  onConfirmEnd,
}: CollectionPhaseActionsProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [result, setResult] = useState<RecollectResult | null>(null);

  if (status !== 'collecting') {
    return null;
  }

  const nobodyMissing = missingCount === 0;
  const acceptingUntil = new Date(endTime).getTime() + SUBMISSION_GRACE_MS;

  return (
    <section
      aria-label="Thao tác thu bài"
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface-2/60 px-4 py-4"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <p className="text-body text-foreground">
            Hết giờ làm bài. Bài nộp vẫn đang được nhận tới{' '}
            <strong>{formatClock(acceptingUntil)}</strong>.
          </p>
          <p className="text-caption text-muted-foreground">
            {nobodyMissing ? (
              'Tất cả đã nộp đủ file bắt buộc.'
            ) : (
              <>
                {missingCount} sinh viên chưa nộp đủ
              </>
            )}
            {/* Mốc thời gian, không phải trang trí. Con số trên là ảnh
                chụp của một dữ liệu đang chạy — khi socket rớt, nó đứng
                yên mà trông vẫn y hệt lúc còn sống. Mốc này là thứ duy
                nhất trên màn hình cho giảng viên thấy nó đã đứng. */}
            {countedAt !== null && ` · tính đến ${formatClockWithSeconds(countedAt)}`}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button
            variant="outline"
            // Disabled kèm giải thích ở trên, KHÔNG ẩn: một nút biến mất
            // làm giảng viên tưởng tính năng hỏng và đi tìm nó.
            disabled={nobodyMissing || recollecting}
            onClick={() => {
              void onRecollect()
                .then(setResult)
                .catch(() => {
                  // Lý do đã nằm trong `recollectError` và hiện bên dưới.
                  // Ném lại ở đây chỉ tạo một unhandled rejection.
                });
            }}
          >
            {recollecting ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
            )}
            Thu lại{nobodyMissing ? '' : ` (${missingCount})`}
          </Button>

          <Button disabled={confirming} onClick={() => setConfirmOpen(true)}>
            {confirming ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            )}
            Xác nhận kết thúc
          </Button>
        </div>
      </div>

      {recollectError && (
        <Alert variant="destructive">
          <AlertDescription>Không thu lại được: {recollectError.message}</AlertDescription>
        </Alert>
      )}

      {result && (
        <Alert variant={result.unreachable > 0 ? 'warning' : 'info'}>
          <AlertDescription>
            {result.acknowledged}/{result.missing} máy đã nhận yêu cầu.
            {/* Tên trước, số sau. Con số nói có vấn đề; danh sách tên nói
                giảng viên phải đi tới bàn nào — và đó mới là việc họ
                đang cần làm. */}
            {result.unreachable > 0 && (
              <>
                {' '}
                {result.unreachable} máy không phản hồi:{' '}
                <strong>{result.unreachableNames.join(', ')}</strong>. Hãy kiểm tra trực tiếp
                tại chỗ.
              </>
            )}
          </AlertDescription>
        </Alert>
      )}

      <Dialog
        open={confirmOpen}
        // Giữ mở khi request đang bay: đóng lại sẽ giấu mất chỗ báo lỗi.
        onOpenChange={(next) => !confirming && setConfirmOpen(next)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Xác nhận kết thúc phiên thi?</DialogTitle>
            <DialogDescription>
              Phiên chuyển sang <strong>Đã kết thúc</strong> và ghi lại tên bạn là người chốt.
              Bài nộp vẫn tiếp tục được nhận tới {formatClock(acceptingUntil)} (30 phút sau giờ
              thi) — xác nhận <strong>không chặn bài đang về</strong>.
            </DialogDescription>
          </DialogHeader>

          {confirmError && (
            <Alert variant="destructive">
              <AlertDescription>Không xác nhận được: {confirmError.message}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={confirming}>
              Huỷ
            </Button>
            <Button
              disabled={confirming}
              // Đóng khi THÀNH CÔNG, không phải khi bấm — cùng lý do với
              // FinalizeSessionButton: đóng lúc bấm thì một lần xác nhận
              // thất bại trông hệt một lần thành công.
              onClick={() => {
                void onConfirmEnd()
                  .then(() => setConfirmOpen(false))
                  .catch(() => {
                    // Lý do đã nằm trong `confirmError` và hiện ở trên.
                  });
              }}
            >
              {confirming && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Xác nhận
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

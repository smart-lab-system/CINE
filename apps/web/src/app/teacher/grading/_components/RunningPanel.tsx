'use client';

import { useEffect, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { NeedsBackend } from '@/components/needs-backend';
import { addSample, describeRate, describeStall, estimate, stalledSeconds, type RateSample } from '@/lib/progress-rate';
import { stateOf } from '@/lib/session-triage';
import type { GradingProgress, GradingResult } from '@/lib/api/grading';

/**
 * Đang chấm và sự cố giữa chừng (spec §3.8).
 *
 * Số liệu lấy từ `grading-progress` (đếm `grading_result` của CHÍNH phiên này, nên đúng cả khi Redis mất). Bài
 * dừng vì lỗi hệ thống KHÔNG được đếm vào "đã có kết quả" (T-UI-13): nó chưa có điểm. `queue` là hàng đợi toàn
 * hệ thống, nên "đang chạy" và "chờ lượt" của riêng phiên không suy ra được — thanh chỉ có ba phần thật.
 *
 * Luật chung cho các băng: mỗi băng nói CÁI GÌ HỎNG (máy bạn · máy chủ · hàng đợi) và BÀI LÀM CÓ BỊ ẢNH HƯỞNG
 * KHÔNG. Không băng nào chỉ ghi "đã xảy ra lỗi". Cái API chưa nói được (bài nào đang chạy công cụ gì, dịch vụ
 * AI lỗi hàng loạt) mang nhãn *cần backend* và không gửi gì.
 */
export function RunningPanel({
  progress,
  progressError,
  lastReadAt,
  onRetry,
  results,
  online,
  onRegradeStuck,
  regrade,
}: {
  progress: GradingProgress | undefined;
  /** Lỗi của lần hỏi tiến độ gần nhất; `null` khi ổn. */
  progressError: Error | null;
  /** Lần đọc thành công gần nhất (ms), hoặc `null` khi chưa đọc được lần nào. */
  lastReadAt: number | null;
  onRetry: () => void;
  results: GradingResult[];
  online: boolean;
  onRegradeStuck: () => void;
  regrade: {
    isPending: boolean;
    isError: boolean;
    error: Error | null;
    data: { stuck: number; requeued: number } | undefined;
  };
}) {
  const [samples, setSamples] = useState<RateSample[]>([]);
  useEffect(() => {
    if (!progress) return;
    setSamples((prev) => addSample(prev, { t: Date.now(), done: progress.done }));
    // Mỗi lần ĐỌC được thêm một mẫu, kể cả khi số không đổi — không có nó thì không đo được khoảng thời gian.
  }, [progress?.done, lastReadAt]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!progress) {
    return (
      <p className="text-small text-muted-foreground">
        {progressError ? 'Chưa đọc được tiến độ chấm.' : 'Đang đọc tiến độ chấm…'}
      </p>
    );
  }

  const total = Math.max(progress.total, 1);
  const stoppedCount = results.filter((r) => stateOf(r) === 'ungradable').length;
  const stopped = Math.min(stoppedCount, progress.done);
  const withResult = Math.max(0, progress.done - stopped);
  const parts = [
    { key: 'result', label: 'Đã có kết quả', count: withResult, className: 'bg-success' },
    { key: 'grading', label: 'Đang chấm', count: progress.pending, className: 'bg-info' },
    { key: 'stopped', label: 'Không chấm được / dừng', count: stopped, className: 'bg-muted-foreground bg-stripes' },
  ];

  const stale = !online || progressError !== null;
  const serverDown = online && progressError !== null;
  const idle = progress.queue.active === 0 && progress.queue.waiting === 0;
  const stuck = online && !serverDown && progress.pending > 0 && idle;
  const stuckCount = progress.byStatus.ai_grading ?? progress.pending;
  const stall = stuck ? stalledSeconds(samples, Date.now()) : null;
  const lastRead = lastReadAt === null ? null : new Date(lastReadAt).toLocaleTimeString('vi-VN');

  return (
    <div className="flex flex-col gap-4">
      {!online && (
        <Alert variant="info" role="status">
          <AlertDescription>
            <span className="block font-semibold">Máy bạn đang mất mạng.</span>
            <span className="block">
              Việc chấm vẫn chạy trên máy chủ — không bài nào bị ảnh hưởng. Trang sẽ tự cập nhật khi có mạng lại.
            </span>
            {lastRead && <span className="block text-caption">Số liệu dưới đây đọc lần cuối lúc {lastRead}.</span>}
          </AlertDescription>
        </Alert>
      )}

      {serverDown && (
        <Alert variant="warning">
          <AlertDescription className="flex flex-col gap-2">
            <span>
              <strong>Máy chủ không trả lời.</strong> Không biết việc chấm có chạy tiếp không. Khi máy chủ trở lại, số
              liệu được đếm lại từ cơ sở dữ liệu; bài dở dang sẽ hiện ở dòng bài bị treo.
            </span>
            {lastRead && <span className="text-caption">Số liệu dưới đây đọc lần cuối lúc {lastRead}.</span>}
            <span>
              <Button type="button" size="sm" variant="outline" onClick={onRetry}>
                Thử lại ngay
              </Button>
            </span>
          </AlertDescription>
        </Alert>
      )}

      {stuck && (
        <Alert variant="warning">
          <AlertDescription className="flex flex-col gap-2">
            <span>
              <strong>{stuckCount} bài không còn ai chấm</strong> — hàng đợi không còn việc nào cho chúng.
              {stall !== null && <> Tiến độ đã đứng yên {describeStall(stall)}.</>}
            </span>
            <span className="flex flex-wrap items-center gap-3">
              <Button type="button" size="sm" loading={regrade.isPending} onClick={onRegradeStuck}>
                Chấm tiếp {stuckCount} bài treo
              </Button>
              {regrade.data && (
                <span className="text-caption">
                  Đã xếp lại {regrade.data.requeued}/{regrade.data.stuck} bài.
                </span>
              )}
            </span>
            {regrade.isError && regrade.error && <span className="font-medium">{regrade.error.message}</span>}
          </AlertDescription>
        </Alert>
      )}

      <div data-stale={stale} className={`flex flex-col gap-3 ${stale ? 'opacity-60' : ''}`}>
        <div
          role="progressbar"
          aria-label="Tiến độ chấm"
          aria-valuenow={progress.done}
          aria-valuemin={0}
          aria-valuemax={progress.total}
          className="flex h-3 w-full overflow-hidden rounded-full bg-border"
        >
          {parts
            .filter((p) => p.count > 0)
            .map((p) => (
              <span
                key={p.key}
                data-part={p.key}
                title={`${p.label}: ${p.count}`}
                className={`transition-[width] duration-500 ${p.className}`}
                style={{ width: `${(p.count / total) * 100}%` }}
              />
            ))}
        </div>
        <ul aria-label="Các phần của lượt chấm" className="flex flex-wrap gap-x-6 gap-y-1 text-small">
          {parts.map((p) => (
            <li key={p.key} className="flex items-center gap-2">
              <span>{p.label}</span>
              <span className="font-semibold tabular-nums">{p.count}</span>
            </li>
          ))}
        </ul>
        <p className="text-caption text-muted-foreground">{describeRate(estimate(samples, progress.pending))}</p>
        <p className="text-caption text-muted-foreground">
          Bài đã có kết quả mở được ngay trong danh sách bên dưới — không phải đợi hết lượt.
        </p>
      </div>

      <section
        aria-label="Đang chạy ngay lúc này"
        className="relative rounded-lg border border-dashed border-border bg-surface p-4"
      >
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-small font-semibold">Đang chạy ngay lúc này</h3>
          <NeedsBackend />
        </div>
        <p className="mt-1 text-caption text-muted-foreground">
          Mỗi bài một dòng — bước hiện tại, số lời gọi trên trần, thời gian đã chạy. Hôm nay tiến độ chỉ đếm số bài;
          chưa có nguồn cho từng lời gọi.
        </p>
      </section>

      {online && stopped > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface p-4">
          <p className="flex-1 text-small text-muted-foreground">
            {stopped} bài đã dừng. Bài dừng vì lỗi hệ thống chưa có điểm nào; chấm lại cả loạt cần một route mà backend
            chưa có.
          </p>
          <Button type="button" size="sm" variant="outline" disabled>
            Chấm lại {stopped} bài lỗi hệ thống
            <NeedsBackend className="ml-2" />
          </Button>
        </div>
      )}
    </div>
  );
}

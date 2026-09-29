'use client';

import { CircleMinus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InvestigationTrail } from './InvestigationTrail';
import type { ResultDetail } from '@/lib/api/grading';

/** Không tự giữ `ManualScoreDialog` — `InvestigatorDossier` (Task 8) giữ đúng MỘT hộp thoại cho cả trang. */
export function UngradableView({
  ungradableClass,
  ungradableReason,
  investigation,
  onOpenManualScore,
}: {
  ungradableClass: 'system' | 'submission';
  ungradableReason: string;
  investigation: ResultDetail['investigation'];
  onOpenManualScore: () => void;
}) {
  const touchedCalls = investigation?.investigation.toolCalls.length ?? 0;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_404px]">
      <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-7">
        <div className="flex flex-col gap-1.5">
          <span className="text-caption font-semibold text-muted-foreground">Điểm</span>
          <span className="text-3xl font-semibold tabular-nums text-muted-foreground">
            — <span className="text-body font-medium">chưa có điểm nào cho bài này</span>
          </span>
        </div>
        <div className="flex items-center gap-2 text-small font-semibold">
          <CircleMinus className="h-4 w-4" aria-hidden="true" />
          Không chấm được
        </div>
        <p className="max-w-[640px] text-small text-muted-foreground">{ungradableReason}</p>
        <div className="max-w-[680px] rounded-md bg-surface-2 p-3.5 text-small">
          <strong>Vì sao không cho điểm, thay vì cho một điểm tạm.</strong> Chấm theo kiểu trừ lỗi, một cuộc điều tra
          không chạy được gì sẽ không tìm ra lỗi nào — và nếu cứ tính, bài sẽ ra <strong>điểm tối đa</strong>. "Không
          tìm thấy lỗi" không có nghĩa là "không có lỗi".
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-small font-semibold">Bạn có thể</span>
          <div className="flex flex-wrap gap-2">
            {ungradableClass === 'system' && (
              <>
                <Button disabled>
                  Chấm lại bài này
                  <span className="ml-2 rounded-md border border-dashed border-muted-foreground px-1.5 py-px text-caption font-semibold text-muted-foreground">
                    cần backend
                  </span>
                </Button>
                <Button variant="outline" disabled>
                  Chấm lại cả các bài cùng lý do
                  <span className="ml-2 rounded-md border border-dashed border-muted-foreground px-1.5 py-px text-caption font-semibold text-muted-foreground">
                    cần backend
                  </span>
                </Button>
              </>
            )}
            <Button variant="outline" onClick={onOpenManualScore}>
              Chấm tay bài này
            </Button>
          </div>
          <p className="text-caption text-muted-foreground">
            {ungradableClass === 'system'
              ? 'Lỗi ở phía hệ thống, không phải ở bài làm.'
              : 'Bài làm không đọc được — chấm lại sẽ ra đúng kết quả cũ, nên lối duy nhất là chấm tay.'}
          </p>
        </div>
      </section>
      <section className="rounded-lg border border-border bg-surface p-4">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="section-label">Những gì đã chạy</h2>
          <span className="text-caption text-muted-foreground">{touchedCalls} lời gọi</span>
        </div>
        {investigation ? (
          <InvestigationTrail investigation={investigation} />
        ) : (
          <p className="text-small text-muted-foreground">Chưa có lời gọi nào được ghi lại.</p>
        )}
      </section>
    </div>
  );
}

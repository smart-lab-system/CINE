'use client';

import { AlertTriangle, Search, Shield } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { findAnomalies, type Anomaly } from '@/lib/grading-triage';
import type { GradingResult, Rubric } from '@/lib/api/grading';

function describe(anomaly: Anomaly, labelOf: (id: string) => string) {
  switch (anomaly.kind) {
    case 'criterion-mass-loss':
      return {
        tone: 'danger' as const,
        Icon: AlertTriangle,
        title: `${anomaly.count}/${anomaly.total} bài mất điểm ở "${labelOf(anomaly.criterionId!)}"`,
        // Tín hiệu về RUBRIC, không phải về lớp. Viết ngược lại là đổ cho
        // sinh viên một lỗi mà giảng viên sửa được trong hai phút.
        body: 'Khi gần cả lớp cùng mất điểm ở một tiêu chí, nguyên nhân thường nằm ở cách tiêu chí được viết chứ không ở bài làm. Đọc lướt vài bài trong nhóm này trước khi kết luận.',
      };
    case 'unlocatable-evidence':
      return {
        tone: 'warning' as const,
        Icon: Search,
        title: `${anomaly.count} bài có trích dẫn không tìm thấy trong bài làm của sinh viên`,
        body: 'Hệ thống đối chiếu từng chữ và không khớp, nghĩa là AI đã diễn giải lại thay vì trích nguyên văn. Những bài này bị hạ độ tin cậy tự động; ở bàn chấm, đoạn đó hiện gạch đỏ.',
      };
    case 'advocate-dissent':
      return {
        tone: 'info' as const,
        Icon: Shield,
        title: `Lượt phản biện không đồng ý với lượt chấm ở ${anomaly.count} bài, cách nhau trung bình ${anomaly.averageGap} điểm`,
        body: 'Lượt phản biện chỉ nêu ý kiến, không bao giờ tự sửa điểm — con số trên là khoảng cách giữa hai lập luận, không phải điểm đã bị thay đổi.',
      };
  }
}

const TONE_CLASS = {
  danger: 'bg-danger-subtle text-danger-strong',
  warning: 'bg-warning-subtle text-warning-strong',
  info: 'bg-info-subtle text-info-strong',
} as const;

/**
 * Những gì CẢ LỚP cùng lệch.
 *
 * Màn Điều phối tồn tại để giảng viên không phải mở 45 bài mới biết chuyện
 * gì đang xảy ra; khối này là phần trả lời câu đó trực tiếp nhất.
 */
export function AnomalyPanel({
  results,
  rubric,
  onOpenCriterion,
}: {
  results: GradingResult[];
  rubric: Rubric | undefined;
  onOpenCriterion?: (criterionId: string) => void;
}) {
  const maxByCriterion = new Map(
    (rubric?.criteria ?? []).map((criterion) => [criterion.id, criterion.maxPoints]),
  );
  const labelOf = (id: string) =>
    rubric?.criteria.find((criterion) => criterion.id === id)?.description ?? 'một tiêu chí';

  const anomalies = findAnomalies(results, maxByCriterion);

  if (anomalies.length === 0) {
    return null;
  }

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-5 py-4">
        <h2 className="text-h3">Bất thường trên diện rộng</h2>
        <Badge variant="destructive">{anomalies.length} dấu hiệu</Badge>
      </header>

      <div>
        {anomalies.map((anomaly) => {
          const shown = describe(anomaly, labelOf);
          const { Icon } = shown;
          return (
            <div
              key={`${anomaly.kind}-${anomaly.criterionId ?? ''}`}
              className="flex gap-3 border-b border-border/70 px-5 py-4 last:border-b-0"
            >
              <span
                className={`grid h-7 w-7 shrink-0 place-items-center rounded-sm ${TONE_CLASS[shown.tone]}`}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
              <div className="flex min-w-0 flex-col gap-1">
                <p className="text-small font-semibold">{shown.title}</p>
                <p className="text-caption leading-relaxed text-muted-foreground">{shown.body}</p>
                {anomaly.kind === 'criterion-mass-loss' && onOpenCriterion && (
                  <div className="mt-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onOpenCriterion(anomaly.criterionId!)}
                    >
                      Xem các bài mất điểm ở tiêu chí này
                    </Button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

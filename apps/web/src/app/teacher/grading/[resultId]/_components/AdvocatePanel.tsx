'use client';

import { ShieldQuestion } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { pointsForVerdict } from '@/lib/grading-triage';
import type { AdvocateOpinion } from '@/lib/api/grading';

const VERDICT_LABEL = {
  met: 'Đạt',
  partially_met: 'Đạt một phần',
  not_met: 'Chưa đạt',
} as const;

/**
 * Trích dẫn của lượt phản biện đã được đối chiếu tới đâu.
 *
 * Ba trạng thái, không hai. `null` = CHƯA đối chiếu, `[]` = đã đối chiếu và
 * sạch. Hiển thị chúng giống nhau là sai đúng ở chỗ nguy hiểm nhất: lượt
 * phản biện đang lập luận để NÂNG điểm, và một giảng viên ở bài thứ 35 sẽ
 * có xu hướng đồng ý.
 */
function verificationLine(opinion: AdvocateOpinion): string {
  if (opinion.unverifiedEvidence === null) {
    return 'Các trích dẫn chưa đối chiếu.';
  }
  if (opinion.unverifiedEvidence.length === 0) {
    return `Đã đối chiếu ${opinion.evidence.length} trích dẫn, tất cả đều có trong bài làm.`;
  }
  return `${opinion.unverifiedEvidence.length} trích dẫn không tìm thấy trong bài làm.`;
}

/**
 * Lượt phản biện — bênh vực sinh viên.
 *
 * Khối này nêu Ý KIẾN, không bao giờ nêu điểm. Nút "theo phản biện" là do
 * GIẢNG VIÊN bấm; nó chỉ đặt sẵn một giá trị quy ra từ mức đánh giá được
 * kiến nghị, theo đúng thang rubric.
 */
export function AdvocatePanel({
  opinion,
  criterionId,
  maxPoints,
  hasQuestion,
  onApply,
}: {
  opinion: AdvocateOpinion | null;
  criterionId: string;
  maxPoints: number;
  hasQuestion: boolean;
  onApply: (next: { verdict: 'met' | 'partially_met' | 'not_met'; points: number }) => void;
}) {
  if (!opinion) {
    // KHÔNG render một khối rỗng. `null` nghĩa là cổng không kích hoạt, và
    // lý do phổ biến nhất là phiên chưa có đề bài — thứ giảng viên sửa được
    // trong hai phút nếu có ai nói cho họ biết.
    return (
      <p className="border-l-2 border-border pl-2.5 text-caption leading-relaxed text-muted-foreground">
        {hasQuestion
          ? 'Lượt phản biện không chạy cho tiêu chí này — nó chỉ chạy khi lượt chấm kết luận chưa đạt.'
          : 'Phiên này chưa nạp đề bài nên lượt phản biện không chạy. Không có ai lên tiếng cho bài làm đúng theo một cách khác.'}
      </p>
    );
  }

  const suggestion = opinion.suggestedVerdicts.find((s) => s.criterionId === criterionId);

  return (
    <section className="overflow-hidden rounded-lg border border-info/45 bg-info-subtle">
      <header className="flex flex-wrap items-center gap-2 border-b border-info/30 px-3.5 py-2.5">
        <ShieldQuestion className="h-3.5 w-3.5 text-info-strong" aria-hidden="true" />
        <span className="text-small font-semibold text-info-strong">
          Lượt phản biện — bênh vực sinh viên
        </span>
        {suggestion && (
          <Badge variant="info" className="ml-auto">
            kiến nghị: {VERDICT_LABEL[suggestion.suggestedVerdict]}
          </Badge>
        )}
      </header>

      <div className="flex flex-col gap-3 px-3.5 py-3 text-small leading-relaxed">
        <p>{opinion.reasoning}</p>

        {opinion.evidence.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {opinion.evidence.map((quote, index) => (
              <p
                key={index}
                className="rounded-r-sm border-l-[3px] border-info bg-surface-2 px-2.5 py-1.5 text-caption leading-relaxed"
              >
                „{quote}”
              </p>
            ))}
          </div>
        )}

        {suggestion && (
          <div>
            <Button
              variant="outline"
              size="sm"
              className="border-info text-info-strong"
              onClick={() =>
                onApply({
                  verdict: suggestion.suggestedVerdict,
                  points: pointsForVerdict(suggestion.suggestedVerdict, maxPoints),
                })
              }
            >
              theo phản biện · {pointsForVerdict(suggestion.suggestedVerdict, maxPoints)}
            </Button>
          </div>
        )}

        <p className="border-t border-dashed border-info/35 pt-2.5 text-caption leading-relaxed text-muted-foreground">
          Lượt phản biện không đưa ra điểm, và không có đường nào để nó làm thế — hệ thống
          chặn ở ba lớp độc lập. {verificationLine(opinion)}
        </p>
      </div>
    </section>
  );
}

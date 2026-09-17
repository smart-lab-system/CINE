'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { GradingReadiness } from '@/lib/api/grading';

const LEVEL_NUMBER: Record<GradingReadiness['level'], number> = {
  rubric_only: 1,
  with_question: 2,
  with_model_answer: 3,
};

/**
 * Bao nhiêu ngữ cảnh lượt chấm này sẽ có.
 *
 * ĐỨNG ĐẦU MÀN HÌNH, TRÊN CẢ TIẾN ĐỘ — và đó là một quyết định, không phải
 * thứ tự tình cờ. "Đã chấm 45/45" là một con số đáng tin nhìn qua; nó không
 * nói gì về việc 45 bài ấy được chấm với đề bài trong tay hay không. Lượt
 * phản biện chỉ chạy khi phiên có đề bài, nên chính dải này quyết định bài
 * của sinh viên làm đúng theo một cách khác có ai bênh hay không.
 *
 * Ba mức đọc từ `grading-readiness`; số hiệu mức là thứ giảng viên nhớ được,
 * còn `rubric_only`/`with_question`/`with_model_answer` là tên của máy.
 */
export function ReadinessStrip({
  readiness,
  onConfigure,
}: {
  readiness: GradingReadiness;
  onConfigure: () => void;
}) {
  const level = LEVEL_NUMBER[readiness.level];

  const steps = [
    {
      n: 1,
      name: 'Thang chấm',
      on: true,
      why: 'Phiên thi đã ghim rubric — không có nó thì chưa chấm được gì.',
    },
    {
      n: 2,
      name: 'Đề bài',
      on: readiness.hasQuestion,
      why: readiness.hasQuestion
        ? 'Do bạn chỉ định. Hệ thống không tự đoán file nào là đề bài.'
        : 'Chọn file nào là đề bài trong số tài liệu bạn đã tải lên.',
    },
    {
      n: 3,
      name: 'Đáp án mẫu',
      on: readiness.hasModelAnswer,
      why: readiness.hasModelAnswer
        ? 'Đã có. Đáp án không bao giờ hiển thị trên màn chấm.'
        : 'Một dòng ghi chú đáp án cũng đủ để lên mức 3 — không cần file.',
    },
  ];

  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="section-label">Mức sẵn sàng chấm · đang ở mức {level} trên 3</p>
        <Button size="sm" onClick={onConfigure} className="text-white">
          Cấu hình đề bài &amp; đáp án
        </Button>
      </div>

      <div className="grid overflow-hidden rounded-lg border border-border bg-surface shadow-sm sm:grid-cols-3">
        {steps.map((step) => (
          <div
            key={step.n}
            className={[
              'flex flex-col gap-1.5 border-b border-border/70 p-4 last:border-b-0',
              'sm:border-b-0 sm:border-r sm:last:border-r-0',
              step.on ? 'bg-accent-subtle/60' : '',
            ].join(' ')}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-small font-semibold">
                Mức {step.n} — {step.name}
              </span>
              <Badge variant={step.on ? 'accent' : 'warning'}>
                {step.on ? 'đã có' : 'chưa có'}
              </Badge>
            </div>
            <p className="text-caption text-muted-foreground">{step.why}</p>
          </div>
        ))}
      </div>

      {/* Cảnh báo của server hiện NGUYÊN VĂN. Nó biết những thứ màn hình
          không biết — ví dụ file đề bài đã bị xoá khỏi kho sau khi chỉ định
          — và diễn giải lại ở đây là làm mất đúng thông tin đó. */}
      {readiness.warning && (
        <p className="border-l-2 border-warning pl-2.5 text-caption font-medium text-warning-strong">
          {readiness.warning}
        </p>
      )}

      <p className="border-l-2 border-border pl-2.5 text-caption leading-relaxed text-muted-foreground">
        <span className="font-semibold text-foreground">Đang chấm ở Mức {level}.</span>{' '}
        {readiness.hasQuestion ? (
          <>Lượt phản biện có chạy ở mức này, vì nó cần đề bài mới đối chiếu được.</>
        ) : (
          <>
            Lượt phản biện <span className="font-semibold">không chạy</span> ở mức này — nó cần
            đề bài mới đối chiếu được. Bài của sinh viên làm đúng theo một cách khác sẽ{' '}
            <span className="font-semibold">không có ai lên tiếng</span>.
          </>
        )}
      </p>
    </section>
  );
}

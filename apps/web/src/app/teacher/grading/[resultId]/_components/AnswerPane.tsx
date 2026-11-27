'use client';

import { useEffect, useRef } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { SubmissionText, SubmissionTextSpan } from '@/lib/api/grading';
import { reducedMotionScrollBehavior, scrollIntoContainer } from './scroll-into-container';

/** Một màu cho mỗi tiêu chí, theo thứ tự trong rubric. Là màu đầy đủ từ token --ev-N, dùng thẳng làm giá trị CSS. */
const HUES = ['hsl(var(--ev-1))', 'hsl(var(--ev-2))', 'hsl(var(--ev-3))', 'hsl(var(--ev-4))'];

export function hueFor(index: number): string {
  return HUES[index % HUES.length];
}

/**
 * Chọn span nào được tô trong một đoạn.
 *
 * Hai tiêu chí trích cùng một câu là chuyện có thật. Sắp theo `start`, giữ
 * span đầu, bỏ phần giao - tô lồng nhau cho ra HTML không đọc được.
 *
 * Việc này ở client vì nó là quyết định TRÌNH BÀY, không phải quyết định
 * đối chiếu. Phép đối chiếu đã xong ở server và không bao giờ chạy lại ở đây.
 */
export function marksFor(
  spans: SubmissionTextSpan[],
  paragraph: number,
): SubmissionTextSpan[] {
  const inParagraph = spans
    .filter((span) => span.paragraph === paragraph)
    .sort((a, b) => a.start - b.start);

  const kept: SubmissionTextSpan[] = [];
  let cursor = -1;
  for (const span of inParagraph) {
    if (span.start >= cursor) {
      kept.push(span);
      cursor = span.end;
    }
  }
  return kept;
}

/**
 * Bài làm của sinh viên, tô theo TOẠ ĐỘ server trả về.
 *
 * KHÔNG có `indexOf` nào trong file này, và đó là quyết định thiết kế chứ
 * không phải sự lười. Phép đối chiếu chạy trên cả bài ĐÃ LÀM PHẲNG ở server
 * - dòng trống giữa hai đoạn thành một dấu cách - nên chỉ phía đó định vị
 * đúng được, kể cả trích dẫn vắt qua ranh giới đoạn. Tự so lại ở client sẽ
 * trượt đúng những ca đó và hiện "không tìm thấy" cho câu mà hệ thống đã xác
 * nhận có thật.
 */
export function AnswerPane({
  text,
  criterionIndexOf,
  activeCriterionId,
  onSelectCriterion,
  onPin,
  /** Bài code (one_shot code_project): giữ xuống dòng / thụt lề như file nguồn. */
  layout = 'essay',
}: {
  text: SubmissionText;
  /** Thứ tự tiêu chí trong rubric, để chọn màu tô. */
  criterionIndexOf: (criterionId: string) => number;
  activeCriterionId: string | null;
  onSelectCriterion: (criterionId: string) => void;
  onPin?: (selected: string) => void;
  layout?: 'essay' | 'code';
}) {
  const paneRef = useRef<HTMLDivElement>(null);

  // Cuộn tới dẫn chứng của tiêu chí đang chọn (trong khung bài làm, không kéo cả trang).
  useEffect(() => {
    if (!activeCriterionId || !paneRef.current) return;
    const container = paneRef.current;
    const target = container.querySelector(
      `[data-criterion="${CSS.escape(activeCriterionId)}"]`,
    ) as HTMLElement | null;
    if (!target) return;
    scrollIntoContainer(container, target, reducedMotionScrollBehavior());
  }, [activeCriterionId]);

  const empty = text.paragraphs.every((paragraph) => paragraph.trim() === '');

  return (
    <div className="flex flex-col gap-3">
      {text.truncatedByGrading && (
        <Alert variant="warning">
          <AlertDescription>
            Bài này dài quá giới hạn chấm tự động -{' '}
            <span className="font-semibold">phần cuối bài không được chấm</span>. Đoạn không
            hiển thị ở đây cũng là đoạn AI chưa bao giờ đọc.
          </AlertDescription>
        </Alert>
      )}

      {empty ? (
        <p className="rounded-md border border-dashed border-border px-4 py-3 text-small text-muted-foreground">
          Hệ thống <span className="font-semibold">chưa đọc được nội dung</span> bài làm này -
          định dạng chưa được hỗ trợ (ví dụ <span className="font-mono">.zip</span>,{' '}
          <span className="font-mono">.pdf</span>, ảnh chụp). Tải file gốc về để chấm tay.
        </p>
      ) : (
        <div
          ref={paneRef}
          onMouseUp={() => {
            if (!onPin) return;
            const selected = window.getSelection()?.toString().trim() ?? '';
            if (selected.length >= 10) {
              onPin(selected);
            }
          }}
          className={
            layout === 'code'
              ? 'max-h-[80vh] overflow-auto rounded-md bg-surface-2 px-3 py-3 [scroll-padding-top:0.75rem]'
              : 'max-h-[80vh] overflow-y-auto rounded-md bg-surface px-1 text-body leading-[1.8] [scroll-padding-top:0.75rem]'
          }
        >
          {text.paragraphs.map((paragraph, index) =>
            layout === 'code' ? (
              <pre
                key={index}
                data-testid={`paragraph-${index}`}
                className="m-0 whitespace-pre-wrap break-words font-mono text-small leading-relaxed text-foreground"
              >
                {renderParagraph(paragraph, marksFor(text.spans, index), {
                  criterionIndexOf,
                  activeCriterionId,
                  onSelectCriterion,
                })}
              </pre>
            ) : (
              <p key={index} data-testid={`paragraph-${index}`} className="mt-3.5 first:mt-0">
                {renderParagraph(paragraph, marksFor(text.spans, index), {
                  criterionIndexOf,
                  activeCriterionId,
                  onSelectCriterion,
                })}
              </p>
            ),
          )}
        </div>
      )}
    </div>
  );
}

function renderParagraph(
  paragraph: string,
  marks: SubmissionTextSpan[],
  options: {
    criterionIndexOf: (criterionId: string) => number;
    activeCriterionId: string | null;
    onSelectCriterion: (criterionId: string) => void;
  },
) {
  if (marks.length === 0) {
    return paragraph;
  }

  const out: React.ReactNode[] = [];
  let at = 0;
  marks.forEach((span, i) => {
    if (span.start > at) {
      out.push(paragraph.slice(at, span.start));
    }
    const active = options.activeCriterionId === span.criterionId;
    out.push(
      <mark
        key={`${span.criterionId}-${i}`}
        data-testid="evidence-mark"
        data-criterion={span.criterionId}
        data-active={active}
        onClick={() => options.onSelectCriterion(span.criterionId)}
        style={{ backgroundColor: hueFor(options.criterionIndexOf(span.criterionId)) }}
        className={[
          'cursor-pointer rounded-[3px] px-0.5 text-foreground transition-shadow duration-200 ease-smooth',
          'scroll-mt-4',
          active ? 'shadow-[0_0_0_2px_hsl(var(--foreground))]' : '',
        ].join(' ')}
      >
        {paragraph.slice(span.start, span.end)}
      </mark>,
    );
    at = span.end;
  });
  if (at < paragraph.length) {
    out.push(paragraph.slice(at));
  }
  return out;
}

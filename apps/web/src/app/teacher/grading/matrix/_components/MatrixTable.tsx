'use client';

import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { advocateScore, bucketOf, type Bucket } from '@/lib/grading-triage';
import type { GradingResult, Rubric } from '@/lib/api/grading';

/** Lý do một bài còn nằm lại, bằng ngôn ngữ khảo thí. */
const HELD_FOR: Record<Bucket, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
  flagged: { label: 'Chờ bạn duyệt', variant: 'default' },
  low: { label: 'Đang chấm', variant: 'secondary' },
  high: { label: 'Trích dẫn đã đối chiếu', variant: 'outline' },
  stuck: { label: 'Quá hạn xử lý', variant: 'secondary' },
};

/** Câu đầu của lập luận phản biện, cắt cho vừa một dòng bảng. */
function summarize(reasoning: string | undefined): string {
  if (!reasoning) return '—';
  const firstSentence = reasoning.split(/(?<=[.!?])\s/)[0] ?? reasoning;
  return firstSentence.length > 120 ? `${firstSentence.slice(0, 119)}…` : firstSentence;
}

function formatScore(value: number | null): string {
  // `—` chứ không phải `0`: "chưa có ý kiến" và "chấm 0 điểm" là hai chuyện
  // khác nhau, và con số 0 đọc ra thành chuyện thứ hai.
  return value === null ? '—' : value.toFixed(2).replace(/\.00$/, '');
}

/**
 * Bảng nén — bảy cột, đủ để quyết định mà không phải mở từng bài.
 *
 * `queueActive` là prop BẮT BUỘC, không phải hằng: `bucketOf` trả `stuck` khi
 * bài đang chấm mà hàng đợi rỗng, nên truyền cứng 0 sẽ dán nhãn "quá hạn" lên
 * mọi bài mà hàng đợi đang xử lý bình thường — một câu luôn đúng về triệu
 * chứng và luôn sai về nguyên nhân.
 */
export function MatrixTable({
  results,
  rubric,
  queueActive,
  selectedIds,
  onToggle,
  onToggleAll,
}: {
  results: GradingResult[];
  rubric: Rubric | undefined;
  queueActive: number;
  selectedIds: string[];
  onToggle: (resultId: string, checked: boolean) => void;
  onToggleAll: (checked: boolean) => void;
}) {
  const maxByCriterion = useMemo(
    () => new Map((rubric?.criteria ?? []).map((criterion) => [criterion.id, criterion.maxPoints])),
    [rubric],
  );

  const allSelected = results.length > 0 && results.every((row) => selectedIds.includes(row.id));

  return (
    <section className="flex flex-col gap-2">
      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <input
                  type="checkbox"
                  aria-label="Chọn tất cả"
                  checked={allSelected}
                  onChange={(event) => onToggleAll(event.target.checked)}
                />
              </TableHead>
              <TableHead>Sinh viên</TableHead>
              <TableHead className="text-right">Lượt chấm</TableHead>
              <TableHead className="text-right">Phản biện</TableHead>
              <TableHead className="text-right">Lệch</TableHead>
              <TableHead>Lý do giữ lại</TableHead>
              <TableHead>Tóm tắt lượt phản biện</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {results.map((row) => {
              const advocate = advocateScore(row, maxByCriterion);
              const delta =
                advocate === null || row.aiTotalScore === null
                  ? null
                  : Math.abs(advocate - row.aiTotalScore);
              const held = HELD_FOR[bucketOf(row, queueActive)];

              return (
                <TableRow key={row.id}>
                  <TableCell>
                    <input
                      type="checkbox"
                      aria-label={`Chọn bài của ${row.studentName}`}
                      checked={selectedIds.includes(row.id)}
                      onChange={(event) => onToggle(row.id, event.target.checked)}
                    />
                  </TableCell>
                  <TableCell>
                    <span className="font-medium">{row.studentName}</span>
                    <span className="block text-caption text-muted-foreground">
                      {row.studentMssv}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatScore(row.aiTotalScore)}
                  </TableCell>
                  <TableCell
                    className="text-right tabular-nums"
                    data-testid={`advocate-score-${row.id}`}
                  >
                    {formatScore(advocate)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatScore(delta)}</TableCell>
                  <TableCell>
                    <Badge variant={held.variant}>{held.label}</Badge>
                  </TableCell>
                  <TableCell className="max-w-[26rem] text-small text-muted-foreground">
                    {summarize(row.advocateOpinion?.reasoning)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <p className="border-l-2 border-border pl-2.5 text-caption leading-relaxed text-muted-foreground">
        Cột <span className="font-semibold text-foreground">Phản biện</span> là điểm{' '}
        <span className="font-semibold text-foreground">quy ra từ các mức đánh giá</span> mà lượt
        phản biện kiến nghị, tính lại theo đúng thang chấm —{' '}
        <span className="font-semibold text-foreground">không phải</span> điểm do nó đưa ra.
      </p>
    </section>
  );
}

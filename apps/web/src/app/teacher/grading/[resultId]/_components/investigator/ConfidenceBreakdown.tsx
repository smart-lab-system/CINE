'use client';

import { Badge } from '@/components/ui/badge';
import { formatVnPoints } from '@/lib/format';
import { SOURCE_LABEL } from '@/lib/grading-vocab';
import type { ConfidenceTerm } from '@/lib/api/grading';

/** Sai số cho phép khi so trung bình tính lại với giá trị đã lưu — cùng ngưỡng với `AUTO_THETA_EPSILON` ở backend. */
const EPSILON = 1e-9;

/**
 * Trung bình có trọng số theo mức trừ — đúng công thức `caseConfidence` ở backend (§4.2). Không có lỗi có giá thì null.
 */
export function weightedConfidence(terms: ConfidenceTerm[]): number | null {
  const weight = terms.reduce((sum, t) => sum + t.deductionHundredths, 0);
  if (weight === 0) return null;
  return terms.reduce((sum, t) => sum + t.cap * t.deductionHundredths, 0) / weight;
}

export const percentOf = (value: number) => `${Math.round(value * 100)}%`;

/**
 * Bảng đóng góp vào mức chắc chắn của bài (§5.8, mục 6): từng lỗi, nguồn, trần, mức trừ; trung bình có trọng số; và
 * dòng "giới hạn khác kéo xuống" khi giá trị đã lưu khác phép tính lại. So với ngưỡng tự chốt θ.
 */
export function ConfidenceBreakdown({
  terms,
  confidence,
  theta,
}: {
  terms: ConfidenceTerm[];
  confidence: number | null;
  theta: number;
}) {
  const average = weightedConfidence(terms);
  const lowerBy = confidence !== null && average !== null && Math.abs(average - confidence) > EPSILON ? confidence : null;

  return (
    <section aria-label="Mức chắc chắn tính từ đâu" className="flex flex-col gap-2 rounded-md border border-border bg-surface p-3">
      <h3 className="section-label">Mức chắc chắn tính từ đâu</h3>
      {terms.length === 0 ? (
        <p className="text-small text-muted-foreground">Không có lỗi nào có điểm để đo, nên mức chắc chắn không lấy từ lỗi nào.</p>
      ) : (
        <table className="w-full text-small">
          <thead>
            <tr className="text-left text-caption text-muted-foreground">
              <th className="py-1 font-medium">Lỗi</th>
              <th className="py-1 font-medium">Cách phát hiện</th>
              <th className="py-1 text-right font-medium">Trần</th>
              <th className="py-1 text-right font-medium">Điểm bị trừ</th>
            </tr>
          </thead>
          <tbody>
            {terms.map((t) => (
              <tr key={t.ruleKey} className="border-t border-border">
                <td className="py-1.5 font-medium">{t.ruleKey}</td>
                <td className="py-1.5">
                  <Badge variant={SOURCE_LABEL[t.source].variant}>{SOURCE_LABEL[t.source].label}</Badge>
                </td>
                <td className="py-1.5 text-right tabular-nums">{percentOf(t.cap)}</td>
                <td className="py-1.5 text-right tabular-nums">{formatVnPoints(-t.deductionHundredths / 100)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {average !== null && (
        <p className="text-small">
          Trung bình có trọng số theo điểm bị trừ: <span className="font-semibold tabular-nums">{percentOf(average)}</span>
        </p>
      )}
      {lowerBy !== null && (
        <p className="text-caption text-muted-foreground">giới hạn khác kéo xuống {percentOf(lowerBy)}</p>
      )}
      <p className="text-caption text-muted-foreground">Cần từ {percentOf(theta)} mới tự chốt.</p>
    </section>
  );
}

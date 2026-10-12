'use client';

import { useId, useState } from 'react';
import { Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useCopyErrors } from '@/hooks/useRubricErrors';
import type { RubricOverview } from '@/lib/api/rubric-errors';
import { copyPreviewText, copyStats } from '@/lib/rubric-board';

/**
 * Sao chép lỗi + điểm trừ từ một rubric khác (D3). Giảng viên TỰ chọn nguồn — không chọn sẵn, không gợi ý: chọn
 * sẵn một nguồn là thay họ quyết định. Xem trước tính từ dữ liệu tổng quan, ghép theo khoá tiêu chí như máy chủ.
 */
export function CopyFromRubric({
  target,
  sources,
  onAddManually,
}: {
  target: RubricOverview;
  sources: RubricOverview[];
  onAddManually: () => void;
}) {
  const id = useId();
  const [source, setSource] = useState('');
  const copy = useCopyErrors();
  const chosen = sources.find((s) => s.rubricName === source);

  if (sources.length === 0) {
    return (
      <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
        <Button type="button" variant="outline" onClick={onAddManually}>
          Tự thêm từng lỗi
        </Button>
        <span className="text-small">Chưa có rubric nào khác có lỗi để sao chép.</span>
      </div>
    );
  }

  function run() {
    if (!chosen) return;
    copy.mutate(
      { from: chosen.rubricName, to: target.rubricName },
      {
        onSuccess: (r) =>
          toast.success(
            `Đã sao chép ${r.copied} lỗi từ “${chosen.rubricName}”. Hai rubric từ giờ độc lập — chỉnh điểm trừ cho kỳ này.` +
              (r.skippedNoCriterion > 0 ? ` ${r.skippedNoCriterion} lỗi thuộc tiêu chí không có ở rubric này nên không sao chép.` : ''),
          ),
      },
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="mt-3.5 flex flex-wrap items-center gap-2.5 text-foreground">
        <label htmlFor={id} className="font-semibold text-primary">
          Sao chép lỗi và điểm trừ từ
        </label>
        <select
          id={id}
          value={source}
          onChange={(e) => setSource(e.target.value)}
          className="h-9 w-80 max-w-full rounded-md border border-input bg-surface px-2.5 font-medium"
        >
          <option value="">Chọn rubric…</option>
          {sources.map((s) => (
            <option key={s.rubricName} value={s.rubricName}>
              {s.rubricName} — {s.errorCount} lỗi
            </option>
          ))}
        </select>
        <Button type="button" variant="primary" disabled={!chosen} loading={copy.isPending} onClick={run}>
          <Copy className="h-4 w-4" aria-hidden="true" />
          Sao chép
        </Button>
        <span className="text-small text-muted-foreground">hoặc</span>
        <Button type="button" variant="outline" onClick={onAddManually}>
          Tự thêm từng lỗi
        </Button>
      </div>
      <p aria-live="polite" className="min-h-5 text-small text-foreground">
        {chosen ? copyPreviewText(copyStats(chosen, target)) : ''}
      </p>
      {copy.isError && <p role="alert" className="text-small font-medium text-danger-strong">{copy.error.message}</p>}
    </div>
  );
}

'use client';

import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { gradingCsvFilename, gradingResultsToCsv } from '@/lib/grading-export';
import type { GradingResult } from '@/lib/api/grading';

/**
 * "Giảng viên chỉ cần export điểm về danh sách" — đúng một nút, tải file
 * ngay tại trình duyệt. Không gọi API: mọi thứ cần đã có trong `results`
 * (cùng dữ liệu đang hiện trên bảng), nên không có khoảng trễ, không có
 * trạng thái loading nào phải xử lý.
 */
export function ExportCsvButton({
  sessionName,
  sessionCode,
  results,
}: {
  sessionName: string;
  sessionCode: string;
  results: GradingResult[];
}) {
  function handleClick() {
    const csv = gradingResultsToCsv(results);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = gradingCsvFilename(sessionName, sessionCode);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={results.length === 0}
      title={results.length === 0 ? 'Chưa có bài nào để xuất.' : undefined}
      onClick={handleClick}
    >
      <Download className="h-4 w-4" aria-hidden="true" />
      Xuất CSV
    </Button>
  );
}

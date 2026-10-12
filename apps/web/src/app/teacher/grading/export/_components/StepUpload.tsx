'use client';

import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { useInspectTemplate, useUploadTemplate } from '@/hooks/useGradeExport';
import type { InspectResponse } from '@/lib/api/grade-export';
import { validateUpload } from '@/lib/grade-export-view';

/**
 * Bước 1 (spec §3.6): tải file sổ điểm của trường. File đi THẲNG lên storage bằng URL ký (rule 5), rồi server đọc
 * nó để hiện trang tính. Lỗi của server hiện NGUYÊN VĂN — mỗi loại file xấu (mật khẩu, hỏng, macro…) có câu riêng.
 */
export function StepUpload({
  sessionId,
  onInspected,
}: {
  sessionId: string;
  onInspected: (result: { templateId: string; fileName: string; inspect: InspectResponse }) => void;
}) {
  const upload = useUploadTemplate(sessionId);
  const inspect = useInspectTemplate(sessionId);
  const [clientError, setClientError] = useState<string | null>(null);
  const busy = upload.isPending || inspect.isPending;
  const error = clientError ?? upload.error?.message ?? inspect.error?.message ?? null;

  async function pick(file: File | undefined) {
    setClientError(null);
    if (!file) return;
    const problem = validateUpload(file);
    if (problem) {
      setClientError(problem);
      return;
    }
    try {
      const templateId = await upload.mutateAsync(file);
      const result = await inspect.mutateAsync({ templateId });
      onInspected({ templateId, fileName: file.name, inspect: result });
    } catch {
      // Lỗi đã nằm ở `upload.error` / `inspect.error` và hiện ở khung bên dưới.
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-small text-muted-foreground">
        Tải file sổ điểm mà trường phát (.xlsx, tối đa 5 MB). Bạn sẽ chọn cột ở bước sau; hệ thống chỉ điền các ô bạn chọn —
        mọi ô khác giữ nguyên.
      </p>
      <div className="flex flex-col gap-2">
        <Label htmlFor="gx-template-file">File sổ điểm của trường (.xlsx)</Label>
        <input
          id="gx-template-file"
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          disabled={busy}
          onChange={(event) => void pick(event.target.files?.[0])}
          className="block w-full max-w-md text-small file:mr-3 file:rounded-md file:border file:border-border file:bg-surface-2 file:px-3 file:py-2 file:text-small"
        />
        {busy && <p className="text-caption text-muted-foreground">{upload.isPending ? 'Đang tải file lên…' : 'Đang đọc file…'}</p>}
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}

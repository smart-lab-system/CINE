'use client';

import { useState, type DragEvent } from 'react';
import { FileUp, LoaderCircle, ShieldCheck } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { useInspectTemplate, useUploadTemplate } from '@/hooks/useGradeExport';
import type { InspectResponse } from '@/lib/api/grade-export';
import { validateUpload } from '@/lib/grade-export-view';
import { cn } from '@/lib/utils';

/**
 * Bước 1 (spec §3.6): tải file sổ điểm của trường. File đi THẲNG lên storage bằng URL ký (rule 5), rồi server đọc
 * nó để hiện trang tính. Lỗi của server hiện NGUYÊN VĂN — mỗi loại file xấu (mật khẩu, hỏng, macro…) có câu riêng.
 *
 * Vùng thả file: kéo-thả chỉ là đường tắt. Cái làm việc thật là chính `<input type="file">` phủ kín vùng (trong suốt),
 * nên bấm và bàn phím (Tab → Enter/Space) mở hộp chọn file như bình thường, và đọc màn hình thấy một ô chọn file có
 * nhãn. Vòng focus vẽ trên vùng nhìn thấy (`peer-focus-visible`) vì chính input thì vô hình.
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
  const [dragging, setDragging] = useState(false);
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

  // Thả file: tự đọc file đầu tiên, và chặn hành vi mặc định (trình duyệt sẽ mở file thay vì tải lên).
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (!busy) void pick(event.dataTransfer.files[0]);
  };
  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    // Luôn chặn mặc định, kể cả khi đang bận: nếu không, thả file lên đây sẽ làm trình duyệt MỞ file đó và rời trang.
    // Đang bận thì chỉ báo con trỏ "không thả được".
    event.preventDefault();
    if (busy) {
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'none';
    } else {
      setDragging(true);
    }
  };
  const onDragLeave = (event: DragEvent<HTMLDivElement>) => {
    // dragleave cũng bắn khi con trỏ đi vào phần tử con; chỉ tắt khi thật sự rời khỏi vùng.
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <p className="text-body text-muted-foreground">Tải file sổ điểm mà trường phát. Bạn sẽ chọn cột ở bước sau.</p>
        <p className="flex items-start gap-2 text-small font-medium text-accent-strong">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Hệ thống chỉ điền các ô bạn chọn — mọi ô khác giữ nguyên.</span>
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="gx-template-file">File sổ điểm của trường (.xlsx)</Label>
        <div
          className="relative"
          aria-busy={busy || undefined}
          onDragEnter={onDragOver}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          <input
            id="gx-template-file"
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              // Xoá lựa chọn để chọn lại ĐÚNG file cũ (vừa sửa xong mật khẩu chẳng hạn) vẫn bắn được sự kiện change.
              event.target.value = '';
              void pick(file);
            }}
            className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 disabled:cursor-wait"
          />
          <div
            className={cn(
              'flex min-h-56 flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-[background-color,border-color] duration-200 ease-smooth',
              'peer-focus-visible:ring-2 peer-focus-visible:ring-ring/70 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background',
              error && !dragging && !busy
                ? 'border-danger/50 bg-danger-subtle/40'
                : dragging
                  ? 'border-accent bg-accent-subtle'
                  : busy
                    ? 'border-border bg-surface-2'
                    : 'border-border bg-surface-2/60 peer-hover:border-accent/70 peer-hover:bg-accent-subtle/50',
            )}
          >
            {busy ? (
              <div role="status" className="flex flex-col items-center gap-3">
                <span className="icon-chip h-14 w-14 rounded-2xl bg-accent-subtle text-accent-strong">
                  <LoaderCircle className="h-7 w-7 animate-spin" aria-hidden="true" />
                </span>
                <p className="text-h3">{upload.isPending ? 'Đang tải file lên…' : 'Đang đọc file…'}</p>
                <p className="text-small text-muted-foreground">Vui lòng đợi trong giây lát, đừng đóng trang này.</p>
              </div>
            ) : (
              <>
                <span
                  className={cn(
                    'icon-chip h-14 w-14 rounded-2xl transition-colors duration-200 ease-smooth',
                    dragging ? 'bg-accent-strong text-accent-foreground' : 'bg-accent-subtle text-accent-strong',
                  )}
                >
                  <FileUp className="h-7 w-7" aria-hidden="true" />
                </span>
                <div className="flex flex-col gap-1">
                  <p className="text-h3">{dragging ? 'Thả file để tải lên' : 'Kéo thả file vào đây'}</p>
                  <p className="text-small text-muted-foreground">hoặc bấm vào vùng này để chọn từ máy của bạn</p>
                </div>
                <span className="inline-flex h-10 items-center rounded-md border border-border bg-surface px-4 text-body font-medium shadow-sm">
                  Chọn file .xlsx
                </span>
                <p className="text-caption text-muted-foreground">Chỉ nhận .xlsx · tối đa 5 MB</p>
              </>
            )}
          </div>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}

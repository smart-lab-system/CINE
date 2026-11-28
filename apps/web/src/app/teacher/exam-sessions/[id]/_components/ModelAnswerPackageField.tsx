'use client';

import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useSetGradingReference } from '@/hooks/useGrading';
import { requestAnswerKeyUpload, type GradingReadiness } from '@/lib/api/grading';
import { normalizeModelAnswerPackage } from '@/lib/model-answer-package';

async function uploadAnswerKey(sessionId: string, file: File): Promise<string> {
  const { storageKey, uploadUrl } = await requestAnswerKeyUpload(sessionId);
  const put = await fetch(uploadUrl, { method: 'PUT', body: file });
  if (!put.ok) throw new Error('Chưa tải được file đáp án lên kho lưu trữ. Thử lại giúp tôi.');
  return storageKey;
}

async function filesFromDataTransfer(data: DataTransfer): Promise<File[]> {
  const items = data.items ? Array.from(data.items) : [];
  if (items.length === 0) {
    return Array.from(data.files);
  }

  const out: File[] = [];

  async function walkEntry(
    entry: FileSystemEntry,
    pathPrefix: string,
  ): Promise<void> {
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) => {
        (entry as FileSystemFileEntry).file(resolve, reject);
      });
      const relative = pathPrefix ? `${pathPrefix}/${file.name}` : file.name;
      Object.defineProperty(file, 'webkitRelativePath', {
        value: relative,
        configurable: true,
      });
      out.push(file);
      return;
    }
    if (!entry.isDirectory) return;
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    const readBatch = (): Promise<FileSystemEntry[]> =>
      new Promise((resolve, reject) => {
        reader.readEntries(resolve, reject);
      });
    // Chrome trả theo lô - đọc đến khi hết.
    for (;;) {
      const batch = await readBatch();
      if (batch.length === 0) break;
      const nextPrefix = pathPrefix ? `${pathPrefix}/${entry.name}` : entry.name;
      for (const child of batch) {
        await walkEntry(child, nextPrefix);
      }
    }
  }

  for (const item of items) {
    const entry = item.webkitGetAsEntry?.() ?? null;
    if (entry) {
      await walkEntry(entry, '');
    } else {
      const file = item.getAsFile();
      if (file) out.push(file);
    }
  }

  return out.length > 0 ? out : Array.from(data.files);
}

/**
 * Đáp án mẫu tuỳ chọn: một nút tải lên, tự nhận diện file / thư mục / .zip|.rar.
 * Thư mục được nén JSZip phía client rồi PUT answer-key (Security rule 5).
 */
export function ModelAnswerPackageField({
  sessionId,
  readiness,
  readOnly = false,
  onPendingChange,
  onSaved,
}: {
  sessionId: string;
  readiness?: GradingReadiness;
  readOnly?: boolean;
  onPendingChange?: (pending: boolean) => void;
  onSaved?: () => void;
}) {
  const save = useSetGradingReference(sessionId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedName, setSavedName] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const currentName =
    savedName ??
    readiness?.sources?.modelAnswer.fileName ??
    (readiness?.hasModelAnswer ? 'Đã có đáp án mẫu' : null);

  async function handleFiles(list: FileList | File[] | null) {
    if (!list || (Array.isArray(list) ? list.length === 0 : list.length === 0)) {
      return;
    }
    setError(null);
    setBusy(true);
    onPendingChange?.(true);
    try {
      const file = await normalizeModelAnswerPackage(list);
      const storageKey = await uploadAnswerKey(sessionId, file);
      await save.mutateAsync({
        modelAnswerStorageKey: storageKey,
        modelAnswerFilename: file.name,
      });
      setSavedName(file.name);
      onSaved?.();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Tải đáp án mẫu không thành công.');
    } finally {
      setBusy(false);
      onPendingChange?.(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  if (readOnly) {
    return (
      <div className="flex flex-col gap-2">
        <h3 className="text-h3">Đáp án mẫu</h3>
        <p className="text-small text-foreground">
          {currentName ?? 'Chưa có đáp án mẫu.'}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="text-h3">Đáp án mẫu</h3>
        <p className="text-small text-muted-foreground">
          Tuỳ chọn. Một lần tải: hệ thống tự nhận file thường, thư mục, hoặc file nén
          (.zip / .rar). Đáp án mẫu{' '}
          <span className="font-semibold">không bao giờ hiển thị trên màn chấm</span> và
          không gửi cho sinh viên.
        </p>
      </div>

      {currentName ? (
        <p className="text-small text-foreground">Đang dùng: {currentName}</p>
      ) : (
        <p className="text-small text-muted-foreground">Chưa có file đáp án mẫu.</p>
      )}

      <input
        ref={inputRef}
        type="file"
        multiple
        className="sr-only"
        disabled={busy}
        onChange={(e) => void handleFiles(e.target.files)}
      />

      <div
        className={
          dragging
            ? 'flex flex-col items-start gap-2 rounded-md border border-dashed border-accent-strong bg-accent-subtle px-4 py-3'
            : 'flex flex-col items-start gap-2 rounded-md border border-dashed border-border px-4 py-3'
        }
        onDragEnter={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          if (e.currentTarget.contains(e.relatedTarget as Node)) return;
          setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void (async () => {
            try {
              const files = await filesFromDataTransfer(e.dataTransfer);
              await handleFiles(files);
            } catch (caught) {
              setError(
                caught instanceof Error
                  ? caught.message
                  : 'Không đọc được nội dung kéo thả.',
              );
            }
          })();
        }}
      >
        <Button
          type="button"
          size="sm"
          variant="outline"
          loading={busy}
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="h-4 w-4" aria-hidden="true" />
          Tải lên
        </Button>
        <p className="text-caption text-muted-foreground">
          Bấm để chọn file / .zip / .rar, hoặc kéo thả thư mục (hay nhiều file) vào đây.
        </p>
      </div>

      {busy ? (
        <p className="text-small text-muted-foreground">Đang tải đáp án mẫu…</p>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {savedName && !error && !busy ? (
        <Alert variant="success" role="status">
          <AlertDescription>Đã lưu đáp án mẫu.</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

'use client';

import { useRef, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { useSetGradingReference } from '@/hooks/useGrading';
import { requestAnswerKeyUpload, type GradingReadiness } from '@/lib/api/grading';
import { normalizeModelAnswerPackage } from '@/lib/model-answer-package';

async function uploadAnswerKey(sessionId: string, file: File): Promise<string> {
  const { storageKey, uploadUrl } = await requestAnswerKeyUpload(sessionId);
  const put = await fetch(uploadUrl, { method: 'PUT', body: file });
  if (!put.ok) throw new Error('Chưa tải được file đáp án lên kho lưu trữ. Thử lại giúp tôi.');
  return storageKey;
}

/**
 * Đáp án mẫu tuỳ chọn: file / thư mục / zip.
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
  const fileRef = useRef<HTMLInputElement>(null);
  const zipRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedName, setSavedName] = useState<string | null>(null);

  const currentName =
    savedName ??
    readiness?.sources?.modelAnswer.fileName ??
    (readiness?.hasModelAnswer ? 'Đã có đáp án mẫu' : null);

  async function handlePick(mode: 'file' | 'folder' | 'zip', list: FileList | null) {
    if (!list || list.length === 0) return;
    setError(null);
    setBusy(true);
    onPendingChange?.(true);
    try {
      const file = await normalizeModelAnswerPackage(list, mode);
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
      if (fileRef.current) fileRef.current.value = '';
      if (zipRef.current) zipRef.current.value = '';
      if (folderRef.current) folderRef.current.value = '';
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
          Tuỳ chọn. Có thể tải một file, một thư mục, hoặc file nén .zip. Đáp án mẫu{' '}
          <span className="font-semibold">không bao giờ hiển thị trên màn chấm</span> và không gửi cho sinh viên.
        </p>
      </div>

      {currentName ? (
        <p className="text-small text-foreground">Đang dùng: {currentName}</p>
      ) : (
        <p className="text-small text-muted-foreground">Chưa có file đáp án mẫu.</p>
      )}

      <div className="flex flex-wrap gap-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor="model-answer-file">File</Label>
          <input
            ref={fileRef}
            id="model-answer-file"
            type="file"
            disabled={busy}
            className="text-small"
            onChange={(e) => void handlePick('file', e.target.files)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="model-answer-zip">File nén (.zip)</Label>
          <input
            ref={zipRef}
            id="model-answer-zip"
            type="file"
            accept=".zip,application/zip"
            disabled={busy}
            className="text-small"
            onChange={(e) => void handlePick('zip', e.target.files)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="model-answer-folder">Thư mục</Label>
          <input
            ref={folderRef}
            id="model-answer-folder"
            type="file"
            multiple
            disabled={busy}
            className="text-small"
            // webkitdirectory không có trong React types ổn định
            {...({ webkitdirectory: '', directory: '' } as object)}
            onChange={(e) => void handlePick('folder', e.target.files)}
          />
        </div>
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

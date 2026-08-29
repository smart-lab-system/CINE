'use client';

import { useRef, useState } from 'react';
import { FileText, Trash2, Upload } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useDeleteExamMaterial,
  useExamMaterials,
  useUploadExamMaterial,
} from '@/hooks/useExamSession';

interface ExamMaterialsCardProps {
  examSessionId: string;
  /** Formatted start time — when students may first open these. */
  releaseAt: string;
  /** Deleting is closed once the session is over; the papers stay for reference. */
  canEdit: boolean;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * The question paper, the dataset, the starter code — uploaded here instead
 * of emailed round or carried in on a USB stick.
 *
 * The file goes straight from this browser to object storage through a
 * presigned URL and never through the API server (Security rule 5). What
 * the card has to make unmistakable is the OTHER rule: uploading a paper
 * does not publish it. Students receive nothing until start_time, however
 * early their machine connected — so the release time is stated on the card
 * rather than left for someone to assume.
 */
export function ExamMaterialsCard({
  examSessionId,
  releaseAt,
  canEdit,
}: ExamMaterialsCardProps) {
  const materials = useExamMaterials(examSessionId);
  const upload = useUploadExamMaterial(examSessionId);
  const remove = useDeleteExamMaterial(examSessionId);
  const fileInput = useRef<HTMLInputElement>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  function onPick(file: File | undefined) {
    if (!file) return;
    upload.mutate(file, {
      // Cleared on both paths: leaving the chosen file in the input means
      // picking the same file again fires no change event and looks broken.
      onSettled: () => {
        if (fileInput.current) fileInput.current.value = '';
      },
    });
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-4 border-b border-border bg-surface-2/60">
        <CardTitle className="text-h3">Đề thi và tài liệu</CardTitle>
        {canEdit && (
          <>
            <input
              ref={fileInput}
              type="file"
              className="sr-only"
              onChange={(event) => onPick(event.target.files?.[0])}
            />
            <Button
              type="button"
              size="sm"
              loading={upload.isPending}
              onClick={() => fileInput.current?.click()}
            >
              <Upload className="h-4 w-4" aria-hidden="true" />
              Tải đề thi lên
            </Button>
          </>
        )}
      </CardHeader>

      <CardContent className="flex flex-col gap-4 p-6">
        {/* The rule, said plainly and on the screen where it matters. */}
        <Alert variant="info">
          <AlertDescription>
            Máy sinh viên chỉ nhận được những file này từ{' '}
            <strong>{releaseAt}</strong> — kể cả máy đã kết nối sớm hơn. Tải lên trước
            không làm lộ đề.
          </AlertDescription>
        </Alert>

        {upload.isError && (
          <Alert variant="destructive">
            <AlertDescription>{upload.error.message}</AlertDescription>
          </Alert>
        )}
        {remove.isError && (
          <Alert variant="destructive">
            <AlertDescription>{remove.error.message}</AlertDescription>
          </Alert>
        )}

        {materials.isLoading ? (
          <Skeleton className="h-5 w-1/2" />
        ) : materials.isError ? (
          <Alert variant="destructive">
            <AlertDescription>{materials.error.message}</AlertDescription>
          </Alert>
        ) : (materials.data?.length ?? 0) === 0 ? (
          <p className="rounded-md border border-dashed border-border px-4 py-3 text-small text-muted-foreground">
            Chưa có đề thi nào. Sinh viên vẫn thi được — chỉ là đề phải phát bằng cách khác.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
            {materials.data!.map((material) => (
              <li key={material.id} className="flex items-center gap-3 px-4 py-3">
                <FileText
                  className="h-4 w-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 truncate font-medium">
                  {material.downloadUrl ? (
                    <a
                      href={material.downloadUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="underline underline-offset-2 hover:no-underline"
                    >
                      {material.fileName}
                    </a>
                  ) : (
                    material.fileName
                  )}
                </span>
                <span className="shrink-0 tabular-nums text-caption text-muted-foreground">
                  {formatSize(material.fileSize)}
                </span>
                {canEdit && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    loading={remove.isPending && pendingDelete === material.id}
                    onClick={() => {
                      setPendingDelete(material.id);
                      remove.mutate(material.id);
                    }}
                    aria-label={`Xoá ${material.fileName}`}
                  >
                    <Trash2 className="h-4 w-4 text-danger-strong" aria-hidden="true" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

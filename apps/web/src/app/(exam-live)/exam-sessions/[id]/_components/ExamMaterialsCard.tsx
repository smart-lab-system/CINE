'use client';

import { useRef, useState } from 'react';
import { FileText, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useDeleteExamMaterial,
  useExamMaterials,
  useUploadExamMaterial,
} from '@/hooks/useExamSession';
import {
  ExamBankHttpError,
  parseCourseExamDocx,
  type ParsedCourseExamDocx,
} from '@/lib/api/exam-bank';
import { UploadExamPreviewDialog } from './UploadExamPreviewDialog';

interface ExamMaterialsCardProps {
  examSessionId: string;
  /** Formatted start time - when students may first open these. */
  releaseAt: string;
  /** Deleting is closed once the session is over; the papers stay for reference. */
  canEdit: boolean;
  /** Hub: ô file đã chọn nhưng request tải lên chưa xong. */
  onFileSelected?: (selected: boolean) => void;
  /**
   * Môn catalog của phiên - cần để «Tải đề mới» parse + tạo kho đề.
   * Null (lobby / chưa gắn môn) → mục đề mới disabled.
   */
  courseId?: string | null;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * The question paper, the dataset, the starter code - uploaded here instead
 * of emailed round or carried in on a USB stick.
 *
 * The file goes straight from this browser to object storage through a
 * presigned URL and never through the API server (Security rule 5). What
 * the card has to make unmistakable is the OTHER rule: uploading a paper
 * does not publish it. Students receive nothing until start_time, however
 * early their machine connected - so the release time is stated on the card
 * rather than left for someone to assume.
 */
export function ExamMaterialsCard({
  examSessionId,
  releaseAt,
  canEdit,
  onFileSelected,
  courseId = null,
}: ExamMaterialsCardProps) {
  const materials = useExamMaterials(examSessionId);
  const upload = useUploadExamMaterial(examSessionId);
  const remove = useDeleteExamMaterial(examSessionId);
  const docInput = useRef<HTMLInputElement>(null);
  const materialInput = useRef<HTMLInputElement>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [previewDraft, setPreviewDraft] = useState<ParsedCourseExamDocx | null>(
    null,
  );
  const [previewWarnings, setPreviewWarnings] = useState<string[]>([]);

  function onPickMaterial(file: File | undefined) {
    if (!file) return;
    onFileSelected?.(true);
    upload.mutate(file, {
      // Cleared on both paths: leaving the chosen file in the input means
      // picking the same file again fires no change event and looks broken.
      onSettled: () => {
        onFileSelected?.(false);
        if (materialInput.current) materialInput.current.value = '';
      },
    });
  }

  async function onPickExamDocx(file: File | undefined) {
    if (!file || !courseId) return;
    setParseError(null);
    onFileSelected?.(true);
    setParsing(true);
    try {
      const draft = await parseCourseExamDocx(courseId, file);
      setPreviewWarnings(draft.warnings ?? []);
      setPreviewDraft(draft);
    } catch (err) {
      const message =
        err instanceof ExamBankHttpError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Không đọc được file Word.';
      setParseError(message);
      toast.error(message);
    } finally {
      setParsing(false);
      onFileSelected?.(false);
      if (docInput.current) docInput.current.value = '';
    }
  }

  const uploadBusy = upload.isPending || parsing;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-4 border-b border-border bg-surface-2/60">
        <CardTitle className="text-h3">Đề thi và tài liệu</CardTitle>
        {canEdit && (
          <>
            <input
              ref={docInput}
              type="file"
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="sr-only"
              onChange={(event) => void onPickExamDocx(event.target.files?.[0])}
            />
            <input
              ref={materialInput}
              type="file"
              className="sr-only"
              onChange={(event) => onPickMaterial(event.target.files?.[0])}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" size="sm" loading={uploadBusy}>
                  <Upload className="h-4 w-4" aria-hidden="true" />
                  Tải file
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuItem
                  disabled={!courseId || uploadBusy}
                  className="flex flex-col items-start gap-0.5"
                  onSelect={() => {
                    // Đóng menu trước, rồi mở picker trong cùng lượt tương tác.
                    window.setTimeout(() => docInput.current?.click(), 0);
                  }}
                >
                  <span>Tải đề mới</span>
                  <small className="text-caption text-muted-foreground">
                    {courseId
                      ? 'Word theo mẫu - tạo đề trong kho rồi gắn phiên'
                      : 'Cần môn catalog để tạo đề trong kho'}
                  </small>
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={uploadBusy}
                  className="flex flex-col items-start gap-0.5"
                  onSelect={() => {
                    window.setTimeout(() => materialInput.current?.click(), 0);
                  }}
                >
                  <span>Tải tài liệu</span>
                  <small className="text-caption text-muted-foreground">
                    Dataset, starter code, file phát kèm
                  </small>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </CardHeader>

      <CardContent className="flex flex-col gap-4 p-6">
        {/* The rule, said plainly and on the screen where it matters. */}
        <Alert variant="info">
          <AlertDescription>
            Máy sinh viên chỉ nhận được những file này từ{' '}
            <strong>{releaseAt}</strong> - kể cả máy đã kết nối sớm hơn. Tải lên trước
            không làm lộ đề.
          </AlertDescription>
        </Alert>

        {parseError && (
          <Alert variant="destructive">
            <AlertDescription>{parseError}</AlertDescription>
          </Alert>
        )}
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
            Chưa có đề thi nào. Sinh viên vẫn thi được - chỉ là đề phải phát bằng cách khác.
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

      {courseId ? (
        <UploadExamPreviewDialog
          open={previewDraft !== null}
          sessionId={examSessionId}
          courseId={courseId}
          draft={previewDraft}
          warnings={previewWarnings}
          onClose={() => {
            setPreviewDraft(null);
            setPreviewWarnings([]);
          }}
          onAttached={() => setParseError(null)}
        />
      ) : null}
    </Card>
  );
}

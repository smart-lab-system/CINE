'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  downloadExamFile,
  uploadExamFile,
} from '@/components/exams/exam-files-api';
import { mutationErrorMessage, throwOnApiError } from '@/components/exams/exam-api';
import type { ExamEventFile, ExamFileRole } from '@/components/exams/exam-types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { apiClient } from '@/lib/api-client';

const FILE_ROLE_LABELS: Record<string, string> = {
  question: 'Đề thi',
  attachment: 'Đính kèm',
  answer_template: 'Đáp án mẫu',
  guide: 'Hướng dẫn',
};

const FILE_ROLE_OPTIONS: { value: ExamFileRole; label: string }[] = [
  { value: 'question', label: 'Đề thi' },
  { value: 'attachment', label: 'Đính kèm' },
  { value: 'answer_template', label: 'Đáp án mẫu' },
  { value: 'guide', label: 'Hướng dẫn' },
];

const ACCEPTED_EXTENSIONS = '.pdf,.zip,.doc,.docx,.xls,.xlsx';

function formatFileSize(bytes: number) {
  if (bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ExamFilesPanel({
  eventId,
  files,
  isDraft,
}: {
  eventId: string;
  files: ExamEventFile[];
  isDraft: boolean;
}) {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [fileRole, setFileRole] = useState<ExamFileRole>('question');
  const [title, setTitle] = useState('');

  const attachMutation = useMutation({
    mutationFn: async () => {
      if (!file) {
        throw new Error('Chọn file trước khi đính kèm.');
      }
      await uploadExamFile(eventId, file, {
        fileRole,
        title: title.trim() || undefined,
      });
    },
    onSuccess: () => {
      setFile(null);
      setTitle('');
      setFileRole('question');
      queryClient.invalidateQueries({ queryKey: ['exam-events', eventId] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (fileId: string) => {
      throwOnApiError(
        await apiClient.DELETE('/exam-events/{id}/files/{fileId}', {
          params: { path: { id: eventId, fileId } },
        }),
      );
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['exam-events', eventId] }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tài liệu đề</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vai trò</TableHead>
              <TableHead>Tên file</TableHead>
              <TableHead>Kích thước</TableHead>
              <TableHead>Thao tác</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {files.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="text-sm text-muted-foreground"
                >
                  Chưa có file. Công bố cần ít nhất một đề thi.
                </TableCell>
              </TableRow>
            ) : (
              files.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    {FILE_ROLE_LABELS[item.fileRole] ?? item.fileRole}
                  </TableCell>
                  <TableCell>{item.originalFilename}</TableCell>
                  <TableCell>{formatFileSize(item.sizeBytes)}</TableCell>
                  <TableCell className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => downloadExamFile(eventId, item)}
                    >
                      Tải xuống
                    </Button>
                    {isDraft ? (
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        disabled={removeMutation.isPending}
                        onClick={() => {
                          if (window.confirm('Gỡ file này?')) {
                            removeMutation.mutate(item.id);
                          }
                        }}
                      >
                        Gỡ
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {isDraft ? (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              attachMutation.mutate();
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="exam-file-role">Vai trò</Label>
                <select
                  id="exam-file-role"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={fileRole}
                  onChange={(e) =>
                    setFileRole(e.target.value as ExamFileRole)
                  }
                >
                  {FILE_ROLE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="exam-file-title">Tiêu đề (tuỳ chọn)</Label>
                <Input
                  id="exam-file-title"
                  value={title}
                  placeholder="Mặc định dùng tên file"
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="exam-package-file">File đề (.pdf, .zip, …)</Label>
              <Input
                id="exam-package-file"
                type="file"
                accept={ACCEPTED_EXTENSIONS}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <div>
              <Button
                type="submit"
                disabled={attachMutation.isPending || !file}
              >
                Đính kèm đề
              </Button>
            </div>
          </form>
        ) : null}

        {attachMutation.error || removeMutation.error ? (
          <p role="alert" className="text-sm text-destructive">
            {mutationErrorMessage(
              attachMutation.error ?? removeMutation.error,
              'Không cập nhật được tài liệu.',
            )}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

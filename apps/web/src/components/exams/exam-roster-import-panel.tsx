'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  applyExamRosterImport,
  downloadExamRosterFile,
  listExamRosterFiles,
  previewExamRosterImport,
  type ApplyExamRosterImportResult,
  type ExamRosterImportPreview,
} from '@/components/exams/exam-roster-api';
import type { ExamEventSection } from '@/components/exams/exam-types';
import { apiClient } from '@/lib/api-client';
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

export function ExamRosterImportPanel({
  eventId,
  subjectId,
  attached,
  isDraft,
}: {
  eventId: string;
  subjectId: string;
  attached: ExamEventSection[];
  isDraft: boolean;
}) {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ExamRosterImportPreview | null>(null);
  const [confirmMismatch, setConfirmMismatch] = useState(false);
  const [applyResult, setApplyResult] =
    useState<ApplyExamRosterImportResult | null>(null);

  const sectionsQuery = useQuery({
    queryKey: ['course-sections', 'for-exam-roster', subjectId],
    queryFn: async () => {
      const { data, error, response } = await apiClient.GET('/course-sections', {
        params: { query: { subjectId, page: 1, pageSize: 100 } },
      });
      if (error || !response.ok) {
        throw error ?? new Error('course-sections failed');
      }
      return data as unknown as {
        items: { id: string; sectionCode: string }[];
      };
    },
  });

  const attachedSectionCodes = attached
    .map((row) => {
      const section = sectionsQuery.data?.items.find(
        (item) => item.id === row.courseSectionId,
      );
      return section?.sectionCode ?? null;
    })
    .filter((code): code is string => code !== null);

  const filesQuery = useQuery({
    queryKey: ['exam-events', eventId, 'roster-files'],
    queryFn: () => listExamRosterFiles(eventId),
  });

  const previewMutation = useMutation({
    mutationFn: async (nextFile: File) =>
      previewExamRosterImport(eventId, nextFile),
    onSuccess: (data) => {
      setPreview(data);
      setConfirmMismatch(false);
      setApplyResult(null);
    },
  });

  const applyMutation = useMutation({
    mutationFn: async () => {
      if (!preview) {
        throw new Error('Chưa có bản xem trước');
      }
      return applyExamRosterImport(
        eventId,
        preview.storedObjectId,
        confirmMismatch,
      );
    },
    onSuccess: (result) => {
      setApplyResult(result);
      setPreview(null);
      setFile(null);
      setConfirmMismatch(false);
      queryClient.invalidateQueries({
        queryKey: ['exam-events', eventId, 'roster-files'],
      });
    },
  });

  if (!isDraft) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Danh sách sinh viên được phép thi</CardTitle>
        </CardHeader>
        <CardContent>
          {filesQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Đang tải…</p>
          ) : filesQuery.error ? (
            <p role="alert" className="text-sm text-destructive">
              Không tải được file đính kèm.
            </p>
          ) : filesQuery.data && filesQuery.data.items.length > 0 ? (
            <ul className="flex flex-col gap-2 text-sm">
              {filesQuery.data.items.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-3"
                >
                  <span>
                    {item.originalFilename} — lớp {item.sectionCode} (
                    {item.allowedCount} SV)
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => downloadExamRosterFile(eventId, item)}
                  >
                    Tải xuống
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              Chưa có file danh sách dự thi.
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  const applyDisabled =
    !preview ||
    applyMutation.isPending ||
    attachedSectionCodes.length === 0 ||
    (preview.sectionCodeMismatch &&
      !(confirmMismatch && attachedSectionCodes.length === 1));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Danh sách sinh viên được phép thi</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {attachedSectionCodes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Gắn ít nhất một lớp tham gia trước khi nhập danh sách.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Lớp tham gia: {attachedSectionCodes.join(', ')}
          </p>
        )}

        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (file) previewMutation.mutate(file);
          }}
        >
          <div className="flex min-w-[240px] flex-1 flex-col gap-1.5">
            <Label htmlFor="exam-roster-file">File Excel (.xls, .xlsx)</Label>
            <Input
              id="exam-roster-file"
              type="file"
              accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setPreview(null);
                setApplyResult(null);
              }}
            />
          </div>
          <Button
            type="submit"
            disabled={
              !file || previewMutation.isPending || attachedSectionCodes.length === 0
            }
          >
            Xem trước
          </Button>
        </form>

        {previewMutation.error ? (
          <p role="alert" className="text-sm text-destructive">
            {previewMutation.error.message}
          </p>
        ) : null}

        {preview ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              {preview.originalFilename} — {preview.students.length} sinh viên
            </p>
            {preview.sectionCodeMismatch ? (
              <div className="flex flex-col gap-2 rounded-md border border-destructive/40 p-3">
                <p role="status" className="text-sm text-destructive">
                  Mã lớp trên file là{' '}
                  {preview.sectionCodeFromFile ?? '(không có)'} không khớp lớp
                  tham gia ({preview.attachedSectionCodes.join(', ')}).
                  {attachedSectionCodes.length === 1
                    ? ' Bạn có thể xác nhận để áp dụng vào lớp tham gia duy nhất.'
                    : ' Hãy sửa file hoặc gắn đúng lớp tham gia.'}
                </p>
                {attachedSectionCodes.length === 1 ? (
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={confirmMismatch}
                      onChange={(event) =>
                        setConfirmMismatch(event.target.checked)
                      }
                    />
                    Tôi xác nhận nhập dù mã lớp trên file không khớp
                  </label>
                ) : null}
              </div>
            ) : null}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>MSSV</TableHead>
                  <TableHead>Họ tên</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.students.map((row) => (
                  <TableRow key={row.studentCode}>
                    <TableCell>{row.studentCode}</TableCell>
                    <TableCell>{row.fullName}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Button
              type="button"
              disabled={applyDisabled}
              onClick={() => applyMutation.mutate()}
            >
              Áp dụng danh sách
            </Button>
            {applyMutation.error ? (
              <p role="alert" className="text-sm text-destructive">
                {applyMutation.error.message}
              </p>
            ) : null}
          </div>
        ) : null}

        {applyResult ? (
          <p role="status" className="text-sm text-muted-foreground">
            Đã áp dụng: tạo {applyResult.createdStudents} sinh viên, cập nhật{' '}
            {applyResult.updatedStudents}, cho phép {applyResult.allowed}, gỡ{' '}
            {applyResult.removed}.
          </p>
        ) : null}

        {filesQuery.data && filesQuery.data.items.length > 0 ? (
          <ul className="flex flex-col gap-2 text-sm">
            {filesQuery.data.items.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-3"
              >
                <span>
                  {item.originalFilename} — lớp {item.sectionCode} (
                  {item.allowedCount} SV)
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => downloadExamRosterFile(eventId, item)}
                >
                  Tải xuống
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}

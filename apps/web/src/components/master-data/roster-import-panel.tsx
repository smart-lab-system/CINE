'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import {
  applyRosterImport,
  downloadCourseSectionFile,
  listCourseSectionFiles,
  previewRosterImport,
  type ApplyRosterImportResult,
  type RosterImportPreview,
} from '@/components/master-data/roster-api';

export function RosterImportPanel({
  sectionId,
  sectionCode,
}: {
  sectionId: string;
  sectionCode: string;
}) {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<RosterImportPreview | null>(null);
  const [confirmMismatch, setConfirmMismatch] = useState(false);
  const [applyResult, setApplyResult] = useState<ApplyRosterImportResult | null>(
    null,
  );

  const filesQuery = useQuery({
    queryKey: ['course-sections', sectionId, 'files'],
    queryFn: () => listCourseSectionFiles(sectionId),
  });

  const previewMutation = useMutation({
    mutationFn: async (nextFile: File) => previewRosterImport(sectionId, nextFile),
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
      return applyRosterImport(
        sectionId,
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
        queryKey: ['course-sections', sectionId, 'enrollments'],
      });
      queryClient.invalidateQueries({
        queryKey: ['course-sections', sectionId, 'files'],
      });
    },
  });

  const applyDisabled =
    !preview ||
    applyMutation.isPending ||
    (preview.sectionCodeMismatch && !confirmMismatch);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Đính kèm danh sách sinh viên</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (file) previewMutation.mutate(file);
          }}
        >
          <div className="flex min-w-[240px] flex-1 flex-col gap-1.5">
            <Label htmlFor="roster-file">File Excel (.xls, .xlsx)</Label>
            <Input
              id="roster-file"
              type="file"
              accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setPreview(null);
                setApplyResult(null);
              }}
            />
          </div>
          <Button type="submit" disabled={!file || previewMutation.isPending}>
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
                  {preview.sectionCodeFromFile ?? '(không có)'} còn lớp hiện
                  tại là {sectionCode}. Import sẽ đồng bộ sĩ số theo file
                  (thêm mới và hủy ghi danh người không còn trong danh sách).
                </p>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={confirmMismatch}
                    onChange={(event) =>
                      setConfirmMismatch(event.target.checked)
                    }
                  />
                  Tôi xác nhận nhập dù mã lớp không khớp
                </label>
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
            {applyResult.updatedStudents}, ghi danh {applyResult.enrolled}, hủy{' '}
            {applyResult.unenrolled}.
          </p>
        ) : null}

        {filesQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Đang tải file đính kèm…</p>
        ) : filesQuery.error ? (
          <p role="alert" className="text-sm text-destructive">
            Không tải được file đính kèm.
          </p>
        ) : filesQuery.data && filesQuery.data.items.length > 0 ? (
          <ul className="flex flex-col gap-2 text-sm">
            {filesQuery.data.items.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3">
                <span>
                  {item.originalFilename}{' '}
                  <span className="text-muted-foreground">
                    ({item.createdAt.slice(0, 10)})
                  </span>
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => downloadCourseSectionFile(sectionId, item)}
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

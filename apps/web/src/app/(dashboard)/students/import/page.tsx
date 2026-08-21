'use client';

import { useRef, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface ImportRowError {
  row: number;
  studentCode: string | null;
  message: string;
}

interface ImportResult {
  totalRows: number;
  created: number;
  updated: number;
  failed: number;
  errors: ImportRowError[];
}

interface ImportJobStatus {
  jobId: string;
  state: string;
  result: ImportResult | null;
  failedReason: string | null;
}

// POST /students/import accepts multipart/form-data, but Task 7's
// controller has no @ApiConsumes/@ApiBody decorators, so the generated
// OpenAPI schema doesn't describe this request body — the typed apiClient
// can't be used here. A plain fetch with credentials: 'include' (the same
// cross-origin cookie workaround api-client.ts documents) does the upload
// instead; polling below still goes through apiClient.
async function uploadImportFile(file: File): Promise<{ jobId: string }> {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${apiBaseUrl}/students/import`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });
  if (!response.ok) {
    throw new Error(`Yêu cầu thất bại (HTTP ${response.status})`);
  }
  return response.json();
}

export default function StudentsImportPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const statusQuery = useQuery({
    queryKey: ['students-import-status', jobId],
    queryFn: async () => {
      const { data, error, response } = await apiClient.GET('/students/import/{jobId}', {
        params: { path: { jobId: jobId as string } },
      });
      if (error || !response.ok) {
        throw error ?? new Error(`Yêu cầu thất bại (HTTP ${response.status})`);
      }
      return data as unknown as ImportJobStatus;
    },
    enabled: jobId !== null,
    // Keep polling until the job leaves the active/waiting states.
    refetchInterval: (query) => {
      const state = query.state.data?.state;
      return state === 'completed' || state === 'failed' ? false : 1000;
    },
  });

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setUploadError('Chọn một file .xlsx trước khi tải lên');
      return;
    }

    setUploadError(null);
    setIsUploading(true);
    setJobId(null);
    try {
      const { jobId: newJobId } = await uploadImportFile(file);
      setJobId(newJobId);
    } catch {
      setUploadError('Tải file lên thất bại. Hãy kiểm tra định dạng file và thử lại.');
    } finally {
      setIsUploading(false);
    }
  }

  const result = statusQuery.data?.state === 'completed' ? statusQuery.data.result : null;
  const isProcessing =
    jobId !== null &&
    statusQuery.data?.state !== 'completed' &&
    statusQuery.data?.state !== 'failed';

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold">Nhập danh sách sinh viên từ Excel</h1>

      <Card>
        <CardHeader>
          <CardTitle>Tải lên file .xlsx</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx"
              aria-label="Chọn file Excel"
              className="text-sm"
            />
            <p className="text-sm text-muted-foreground">
              Cột bắt buộc: student_code, full_name, date_of_birth, class_code, cohort_year.
            </p>
            {uploadError && (
              <p role="alert" className="text-sm text-destructive">
                {uploadError}
              </p>
            )}
            <Button type="submit" disabled={isUploading}>
              {isUploading ? 'Đang tải lên…' : 'Tải lên'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {jobId && (
        <Card>
          <CardHeader>
            <CardTitle>Kết quả</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {isProcessing ? (
              <p className="text-sm text-muted-foreground">Đang xử lý…</p>
            ) : statusQuery.data?.state === 'failed' ? (
              <p role="alert" className="text-sm text-destructive">
                Import thất bại: {statusQuery.data.failedReason ?? 'Lỗi không xác định'}
              </p>
            ) : result ? (
              <>
                <p className="text-sm">
                  Tổng số dòng: {result.totalRows} — Tạo mới: {result.created} — Cập nhật:{' '}
                  {result.updated} — Lỗi: {result.failed}
                </p>
                {result.errors.length > 0 && (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Dòng</TableHead>
                        <TableHead>Mã số sinh viên</TableHead>
                        <TableHead>Lỗi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.errors.map((rowError) => (
                        <TableRow key={rowError.row}>
                          <TableCell>{rowError.row}</TableCell>
                          <TableCell>{rowError.studentCode ?? '—'}</TableCell>
                          <TableCell>{rowError.message}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </>
            ) : null}
          </CardContent>
        </Card>
      )}
    </main>
  );
}

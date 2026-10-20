'use client';

import { useId, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useUploadAnswerSource } from '@/hooks/useTestBundle';

/**
 * Tải MÃ NGUỒN đáp án mẫu (.cpp hoặc .py) của giảng viên (G2b-R). Khác ô "Đáp án mẫu" ở khối tài liệu (file docx, pdf hay một
 * dòng ghi chú để AI đọc): mã này là thứ máy chạy bài thực sự chạy, để chạy thử đáp án trên gói test và để sinh gói từ đáp án.
 *
 * File đi thẳng lên kho, không qua API (Security rule 5); đường tải dừng nếu PUT hỏng nên không bao giờ lưu một tham chiếu tới
 * object không có.
 */
export function AnswerSourceForm({ sessionId }: { sessionId: string }) {
  const inputId = useId();
  const upload = useUploadAnswerSource(sessionId);
  const [file, setFile] = useState<File | null>(null);

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-accent/40 bg-accent/5 p-4">
      <label htmlFor={inputId} className="text-small font-semibold">
        Mã đáp án (.cpp hoặc .py)
      </label>
      <p className="text-caption text-muted-foreground">
        Mã đi thẳng lên kho lưu trữ và chỉ máy chạy bài đọc nó; không hiện cho sinh viên và không vào ngữ cảnh của AI chấm.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          id={inputId}
          type="file"
          accept=".cpp,.py"
          className="max-w-xs"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <Button type="button" size="sm" disabled={file === null || upload.isPending} onClick={() => file && upload.mutate(file)}>
          {upload.isPending ? 'Đang tải…' : 'Tải mã đáp án lên'}
        </Button>
      </div>
      {upload.isSuccess && (
        <Alert variant="success" role="status">
          <AlertDescription>
            Đã tải mã đáp án. Bấm lại &quot;Sinh gói test từ đáp án của bạn&quot; hoặc &quot;Chạy thử đáp án mẫu với gói test&quot;.
          </AlertDescription>
        </Alert>
      )}
      {upload.isError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{upload.error?.message}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}

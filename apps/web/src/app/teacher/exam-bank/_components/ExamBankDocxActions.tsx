'use client';

import { useRef, useState } from 'react';
import { Download, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  downloadCourseExamDocx,
  ExamBankHttpError,
  parseCourseExamDocx,
  type ParsedCourseExamDocx,
} from '@/lib/api/exam-bank';

interface UploadProps {
  courseId: string;
  disabled?: boolean;
  onParsed: (draft: ParsedCourseExamDocx) => void;
  onError: (message: string) => void;
}

export function ExamBankUploadDocxButton({ courseId, disabled, onParsed, onError }: UploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          setBusy(true);
          try {
            const draft = await parseCourseExamDocx(courseId, file);
            onParsed(draft);
          } catch (err) {
            onError(err instanceof ExamBankHttpError ? err.message : 'Không đọc được file Word.');
          } finally {
            setBusy(false);
          }
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || busy}
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="mr-1 h-4 w-4" />
        {busy ? 'Đang đọc…' : 'Tải lên Word'}
      </Button>
    </>
  );
}

interface DownloadProps {
  examId: string;
  disabled?: boolean;
  onError?: (message: string) => void;
}

export function ExamBankDownloadDocxButton({ examId, disabled, onError }: DownloadProps) {
  const [busy, setBusy] = useState(false);

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={disabled || busy}
      onClick={async () => {
        setBusy(true);
        try {
          await downloadCourseExamDocx(examId);
        } catch (err) {
          onError?.(
            err instanceof ExamBankHttpError ? err.message : 'Không tải được file Word.',
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <Download className="mr-1 h-4 w-4" />
      {busy ? 'Đang tải…' : 'Tải Word'}
    </Button>
  );
}

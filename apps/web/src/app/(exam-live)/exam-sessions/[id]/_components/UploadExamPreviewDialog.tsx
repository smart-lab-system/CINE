'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useExamBankCourses, useExamBankMutations } from '@/hooks/useExamBank';
import { useUploadExamMaterial } from '@/hooks/useExamSession';
import {
  ExamBankHttpError,
  fetchCourseExamDocx,
  type ParsedCourseExamDocx,
} from '@/lib/api/exam-bank';
import {
  ExamBankForm,
  parseQuestions,
  parseTotalPoints,
  type ExamBankFormValues,
} from '@/app/teacher/exam-bank/_components/ExamBankForm';

function draftToFormValues(draft: ParsedCourseExamDocx): ExamBankFormValues {
  return {
    examType: draft.examType,
    language: draft.language,
    status: 'draft',
    totalPoints: String(draft.totalPoints),
    description: draft.description ?? '',
    questions: draft.questions.map((q) => ({
      statement: q.statement,
      points: String(q.points),
      rubricId: null,
    })),
  };
}

export function UploadExamPreviewDialog({
  open,
  sessionId,
  courseId,
  draft,
  warnings,
  onClose,
  onAttached,
}: {
  open: boolean;
  sessionId: string;
  courseId: string;
  draft: ParsedCourseExamDocx | null;
  warnings: string[];
  onClose: () => void;
  onAttached?: () => void;
}) {
  const courses = useExamBankCourses();
  const mutations = useExamBankMutations();
  const upload = useUploadExamMaterial(sessionId);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const course = useMemo(
    () => (courses.data ?? []).find((c) => c.id === courseId) ?? null,
    [courses.data, courseId],
  );

  const initial = useMemo(
    () => (draft ? draftToFormValues(draft) : null),
    [draft],
  );

  const draftKey = draft
    ? `${draft.examType}-${draft.language}-${draft.totalPoints}-${draft.questions.map((q) => q.statement).join('|')}`
    : 'empty';

  function handleOpenChange(next: boolean) {
    if (!next && !busy) {
      setError(null);
      onClose();
    }
  }

  async function confirmCreate(values: ExamBankFormValues) {
    const parsed = parseQuestions(values.questions);
    if (typeof parsed === 'string') {
      setError(parsed);
      return;
    }
    const total = parseTotalPoints(values.totalPoints);
    if (typeof total === 'string') {
      setError(total);
      return;
    }
    const allocated =
      Math.round(parsed.reduce((s, q) => s + q.points, 0) * 100) / 100;
    if (Math.abs(allocated - total) > 1e-9) {
      setError(
        `Tổng điểm đề (${total}) phải bằng điểm đã phân bổ (${allocated}).`,
      );
      return;
    }

    setError(null);
    setBusy(true);
    let createdId: string | null = null;
    try {
      const exam = await mutations.create.mutateAsync({
        courseId,
        examType: values.examType,
        language: values.language,
        totalPoints: total,
        description: values.description.trim() || undefined,
        questions: parsed,
      });
      createdId = exam.id;
      const { blob, filename } = await fetchCourseExamDocx(exam.id);
      const file = new File([blob], filename, {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      await upload.mutateAsync(file);
      toast.success(`Đã tạo đề "${exam.title}" và gắn vào phiên.`);
      setError(null);
      onAttached?.();
      onClose();
    } catch (err) {
      if (createdId) {
        toast.error(
          'Đề đã vào kho nhưng chưa gắn được vào phiên. Dùng Thiết lập đề thi để gắn lại.',
        );
        onClose();
      } else {
        setError(
          err instanceof ExamBankHttpError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Không tạo được đề.',
        );
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Xem trước đề mới</DialogTitle>
          <DialogDescription>
            Kiểm tra nội dung đã đọc từ Word, chỉnh nếu cần, rồi tạo đề trong kho và
            gắn vào phiên.
          </DialogDescription>
        </DialogHeader>

        {warnings.length > 0 ? (
          <Alert>
            <AlertDescription>
              <ul className="list-disc pl-4">
                {warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        ) : null}

        {!course && courses.isLoading ? (
          <p className="text-small text-muted-foreground">Đang tải thông tin môn…</p>
        ) : !course ? (
          <Alert variant="destructive">
            <AlertDescription>
              Không tìm thấy môn hoặc bạn không được phân công dạy môn này.
            </AlertDescription>
          </Alert>
        ) : initial ? (
          <ExamBankForm
            key={draftKey}
            courseName={course.name}
            courseLabel={`${course.code} - ${course.name}`}
            submitLabel="Tạo đề và gắn vào phiên"
            busy={busy}
            error={error}
            initial={initial}
            onSubmit={(values) => {
              void confirmCreate(values);
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCourseExam, useExamBankMutations } from "@/hooks/useExamBank";
import { ExamBankHttpError, type CourseExamDetail } from "@/lib/api/exam-bank";
import {
  ExamBankForm,
  parseQuestions,
  parseTotalPoints,
  type ExamBankFormValues,
} from "../_components/ExamBankForm";
import {
  ExamBankDownloadDocxButton,
  ExamBankUploadDocxButton,
} from "../_components/ExamBankDocxActions";

function valuesFromExam(exam: CourseExamDetail): ExamBankFormValues {
  return {
    examType: exam.examType,
    language: exam.language,
    status: exam.status,
    totalPoints: String(exam.totalPoints),
    description: exam.description ?? '',
    questions: exam.questions.map((q) => ({
      statement: q.statement,
      points: String(q.points),
      rubricId: q.rubricId ?? null,
      rubricName: q.rubricName ?? null,
    })),
  };
}

export default function EditExamBankPage() {
  const params = useParams<{ id: string }>();
  const examId = params.id;
  const router = useRouter();
  const detail = useCourseExam(examId);
  const mutations = useExamBankMutations();
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [importOverride, setImportOverride] = useState<{
    key: number;
    values: ExamBankFormValues;
  } | null>(null);

  const busy = mutations.update.isPending || mutations.remove.isPending;

  if (detail.isLoading) return <Skeleton className="h-64 w-full" />;
  if (detail.isError || !detail.data) {
    return (
      <Alert variant="destructive">
        <AlertDescription>Không tải được đề.</AlertDescription>
      </Alert>
    );
  }

  const exam = detail.data;
  const initial = importOverride?.values ?? valuesFromExam(exam);
  const formKey = importOverride?.key ?? `${exam.id}-${exam.updatedAt}`;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Sửa đề"
        description={`${exam.courseCode} - ${exam.courseName}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <ExamBankUploadDocxButton
              courseId={exam.courseId}
              disabled={busy}
              onError={(msg) => {
                setWarnings([]);
                setError(msg);
              }}
              onParsed={(draft) => {
                setError(null);
                setWarnings(draft.warnings ?? []);
                setImportOverride({
                  key: Date.now(),
                  values: {
                    examType: draft.examType,
                    language: draft.language,
                    status: exam.status,
                    totalPoints: String(draft.totalPoints),
                    description: draft.description ?? '',
                    questions: draft.questions.map((q) => ({
                      statement: q.statement,
                      points: String(q.points),
                      rubricId: null,
                    })),
                  },
                });
              }}
            />
            <ExamBankDownloadDocxButton
              examId={exam.id}
              disabled={busy}
              onError={(msg) => setError(msg)}
            />
            <Button asChild variant="outline">
              <Link href="/teacher/exam-bank">Quay lại kho đề</Link>
            </Button>
          </div>
        }
      />

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

      <ExamBankForm
        key={formKey}
        courseName={exam.courseName}
        courseLabel={`${exam.courseCode} - ${exam.courseName}`}
        submitLabel="Lưu"
        allowDelete
        busy={busy}
        error={error}
        initial={initial}
        onDelete={() => {
          if (!confirm("Xóa đề này? Chỉ xóa được khi chưa gắn vào phiên thi.")) return;
          mutations.remove.mutate(exam.id, {
            onSuccess: () => router.push("/teacher/exam-bank"),
            onError: (err) => {
              setError(
                err instanceof ExamBankHttpError
                  ? err.message
                  : "Không xóa được đề.",
              );
            },
          });
        }}
        onSubmit={(values) => {
          const parsed = parseQuestions(values.questions);
          if (typeof parsed === "string") {
            setError(parsed);
            return;
          }
          const total = parseTotalPoints(values.totalPoints);
          if (typeof total === "string") {
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
          mutations.update.mutate(
            {
              id: exam.id,
              examType: values.examType,
              language: values.language,
              totalPoints: total,
              description: values.description.trim(),
              status: values.status,
              questions: parsed,
            },
            {
              onSuccess: () => {
                setImportOverride(null);
                setWarnings([]);
              },
              onError: (err) => {
                setError(
                  err instanceof ExamBankHttpError
                    ? err.message
                    : "Không lưu được đề.",
                );
              },
            },
          );
        }}
      />
    </div>
  );
}

"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useExamBankCourses, useExamBankMutations } from "@/hooks/useExamBank";
import { ExamBankHttpError } from "@/lib/api/exam-bank";
import {
  ExamBankForm,
  parseQuestions,
  parseTotalPoints,
  type ExamBankFormValues,
} from "../_components/ExamBankForm";
import { ExamBankUploadDocxButton } from "../_components/ExamBankDocxActions";

export default function NewExamBankPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <NewExamBankInner />
    </Suspense>
  );
}

function NewExamBankInner() {
  const router = useRouter();
  const search = useSearchParams();
  const courseId = search.get("courseId");
  const courses = useExamBankCourses();
  const mutations = useExamBankMutations();
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [formKey, setFormKey] = useState(0);
  const [initial, setInitial] = useState<ExamBankFormValues>({
    examType: "GK",
    language: "cpp",
    status: "draft",
    totalPoints: "10",
    description: "",
    questions: [{ statement: "", points: "10", rubricId: null }],
  });

  const course = useMemo(
    () => (courses.data ?? []).find((c) => c.id === courseId) ?? null,
    [courses.data, courseId],
  );

  if (!courseId) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title="Tạo đề nháp" description="Thiếu môn học." />
        <Button asChild variant="outline">
          <Link href="/teacher/exam-bank">Quay lại kho đề</Link>
        </Button>
      </div>
    );
  }

  if (courses.isLoading) return <Skeleton className="h-64 w-full" />;

  if (!course) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Không tìm thấy môn hoặc bạn không được phân công dạy môn này.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Tạo đề nháp"
        description="Lưu đề vào kho môn - chưa gắn phiên thi. Có thể tải Word theo mẫu FORMAT-DE-THI rồi kiểm tra trước khi lưu."
        actions={
          <div className="flex flex-wrap gap-2">
            <ExamBankUploadDocxButton
              courseId={courseId}
              disabled={mutations.create.isPending}
              onError={(msg) => {
                setWarnings([]);
                setError(msg);
              }}
              onParsed={(draft) => {
                setError(null);
                setWarnings(draft.warnings ?? []);
                setInitial({
                  examType: draft.examType,
                  language: draft.language,
                  status: "draft",
                  totalPoints: String(draft.totalPoints),
                  description: draft.description ?? "",
                  questions: draft.questions.map((q) => ({
                    statement: q.statement,
                    points: String(q.points),
                    rubricId: null,
                  })),
                });
                setFormKey((k) => k + 1);
              }}
            />
            <Button asChild variant="outline">
              <Link href="/teacher/exam-bank">Quay lại</Link>
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
        courseName={course.name}
        courseLabel={`${course.code} - ${course.name}`}
        submitLabel="Lưu nháp"
        busy={mutations.create.isPending}
        error={error}
        initial={initial}
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
          mutations.create.mutate(
            {
              courseId,
              examType: values.examType,
              language: values.language,
              totalPoints: total,
              description: values.description.trim() || undefined,
              questions: parsed,
            },
            {
              onSuccess: (exam) => router.push(`/teacher/exam-bank/${exam.id}`),
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

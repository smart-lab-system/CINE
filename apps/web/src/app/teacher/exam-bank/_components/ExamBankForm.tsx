"use client";

import { useMemo, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AutoTextarea } from "@/components/ui/auto-textarea";
import {
  buildCourseExamTitle,
  COURSE_EXAM_LANGUAGE_OPTIONS,
  COURSE_EXAM_TYPE_OPTIONS,
  type CourseExamLanguage,
  type CourseExamStatus,
  type CourseExamType,
} from "@/lib/api/exam-bank";

export interface ExamBankFormQuestion {
  statement: string;
  points: string;
}

export interface ExamBankFormValues {
  examType: CourseExamType;
  language: CourseExamLanguage;
  status: CourseExamStatus;
  totalPoints: string;
  /** Mô tả dùng chung cho toàn đề (tuỳ chọn). */
  description: string;
  questions: ExamBankFormQuestion[];
}

export function emptyQuestion(): ExamBankFormQuestion {
  return { statement: "", points: "1" };
}

function sumQuestionPoints(questions: ExamBankFormQuestion[]): number {
  return questions.reduce((s, q) => {
    const n = Number(q.points);
    return s + (Number.isFinite(n) ? n : 0);
  }, 0);
}

function roundPoints(n: number): number {
  return Math.round(n * 100) / 100;
}

function nearlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-9;
}

interface Props {
  initial: ExamBankFormValues;
  courseName: string;
  courseLabel: string;
  submitLabel: string;
  allowDelete?: boolean;
  busy?: boolean;
  error?: string | null;
  onSubmit: (values: ExamBankFormValues) => void;
  onDelete?: () => void;
}

export function ExamBankForm({
  initial,
  courseName,
  courseLabel,
  submitLabel,
  allowDelete,
  busy,
  error,
  onSubmit,
  onDelete,
}: Props) {
  const [examType, setExamType] = useState<CourseExamType>(initial.examType);
  const [language, setLanguage] = useState<CourseExamLanguage>(
    initial.language,
  );
  const [status, setStatus] = useState<CourseExamStatus>(initial.status);
  const [totalPoints, setTotalPoints] = useState(initial.totalPoints);
  const [description, setDescription] = useState(initial.description);
  const [questions, setQuestions] = useState<ExamBankFormQuestion[]>(
    initial.questions,
  );
  /** Điểm câu lúc focus — dùng để hoàn tác khi Cancel confirm vượt tổng. */
  const pointsFocusRef = useRef<Record<number, string>>({});

  const titlePreview = useMemo(
    () => buildCourseExamTitle(examType, courseName),
    [examType, courseName],
  );

  const allocated = useMemo(
    () => roundPoints(sumQuestionPoints(questions)),
    [questions],
  );
  const totalNum = Number(totalPoints);
  const totalValid = Number.isFinite(totalNum) && totalNum >= 0;
  const mismatch = totalValid && !nearlyEqual(allocated, totalNum);
  const hasNonPositive = questions.some((q) => {
    const n = Number(q.points);
    return !Number.isFinite(n) || n <= 0;
  });

  /**
   * Áp điểm câu mới. Nếu tổng câu > tổng đề:
   * - OK → cập nhật tổng đề = tổng câu và giữ điểm mới
   * - Cancel → **không** áp thay đổi (giữ nguyên câu cũ), tránh điểm về 0 / vượt trần
   */
  function commitQuestions(next: ExamBankFormQuestion[]): boolean {
    const sum = roundPoints(sumQuestionPoints(next));
    const currentTotal = Number(totalPoints);
    const hasTotal =
      Number.isFinite(currentTotal) &&
      currentTotal >= 0 &&
      totalPoints.trim() !== "";

    if (hasTotal && sum > currentTotal + 1e-9) {
      const ok = window.confirm(
        `Tổng điểm các câu (${sum}) vượt tổng điểm đề (${currentTotal}).\n\n` +
          `OK: cập nhật tổng điểm đề thành ${sum} và giữ điểm câu vừa nhập.\n` +
          `Cancel: hủy thay đổi điểm câu (giữ nguyên như trước).`,
      );
      if (!ok) return false;
      setTotalPoints(String(sum));
    } else if (!hasTotal) {
      setTotalPoints(String(sum));
    }

    setQuestions(next);
    return true;
  }

  function updateQuestionMeta(
    index: number,
    patch: Partial<ExamBankFormQuestion>,
  ) {
    setQuestions((prev) =>
      prev.map((q, i) => (i === index ? { ...q, ...patch } : q)),
    );
  }

  /** Điểm câu: kiểm tra vượt trần khi blur; Cancel → trả về điểm lúc focus. */
  function commitQuestionPoints(index: number, raw: string) {
    const previous =
      pointsFocusRef.current[index] ?? questions[index]?.points ?? "1";
    const next = questions.map((q, i) =>
      i === index ? { ...q, points: raw } : q,
    );
    if (!commitQuestions(next)) {
      setQuestions((prev) =>
        prev.map((q, i) => (i === index ? { ...q, points: previous } : q)),
      );
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({ examType, language, status, totalPoints, description, questions });
  }

  const blockSave = mismatch || hasNonPositive;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {hasNonPositive ? (
        <Alert variant="destructive">
          <AlertDescription>Mỗi câu phải có điểm lớn hơn 0.</AlertDescription>
        </Alert>
      ) : null}

      {mismatch && !hasNonPositive ? (
        <Alert variant="destructive">
          <AlertDescription>
            Tổng điểm đề ({totalValid ? totalNum : "—"}) phải bằng điểm đã phân
            bổ ({allocated}).
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Thông tin đề</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">Môn: {courseLabel}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Loại đề</Label>
              <Select
                value={examType}
                onValueChange={(v) => setExamType(v as CourseExamType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COURSE_EXAM_TYPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Ngôn ngữ / project</Label>
              <Select
                value={language}
                onValueChange={(v) => setLanguage(v as CourseExamLanguage)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COURSE_EXAM_LANGUAGE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Tiêu đề (tự tạo)</Label>
            <Input value={titlePreview} readOnly className="bg-muted" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="exam-description">Mô tả</Label>
            <AutoTextarea
              id="exam-description"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Hướng dẫn / quy định dùng chung cho toàn bộ câu hỏi (tuỳ chọn)"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
            <div className="flex min-w-0 flex-col gap-2">
              <Label htmlFor="exam-total">Tổng điểm đề</Label>
              <Input
                id="exam-total"
                type="number"
                min={0}
                max={1000}
                step={0.25}
                required
                value={totalPoints}
                onChange={(e) => setTotalPoints(e.target.value)}
                aria-describedby="exam-points-hint"
              />
            </div>
            <div className="flex min-w-0 flex-col gap-2">
              <Label htmlFor="exam-allocated">Đã phân bổ</Label>
              <Input
                id="exam-allocated"
                value={String(allocated)}
                readOnly
                className={
                  mismatch || hasNonPositive
                    ? "bg-muted text-destructive"
                    : "bg-muted"
                }
                aria-describedby="exam-points-hint"
              />
            </div>
            <div className="flex min-w-0 flex-col gap-2">
              <Label>Trạng thái</Label>
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as CourseExamStatus)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Nháp</SelectItem>
                  <SelectItem value="ready">Sẵn sàng</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <p id="exam-points-hint" className="text-xs text-muted-foreground">
            Tổng điểm đề phải bằng điểm đã phân bổ khi lưu.
          </p>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Câu hỏi</h2>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => commitQuestions([...questions, emptyQuestion()])}
          >
            <Plus className="mr-1 h-4 w-4" />
            Thêm câu
          </Button>
        </div>

        {questions.map((q, index) => (
          <Card key={index}>
            <CardHeader className="space-y-0 pb-2">
              <div className="flex flex-wrap items-center gap-3">
                <CardTitle className="shrink-0 text-sm font-medium">
                  Câu {index + 1}
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Label htmlFor={`exam-q-points-${index}`} className="shrink-0">
                    Điểm
                  </Label>
                  <Input
                    id={`exam-q-points-${index}`}
                    type="number"
                    min={0.25}
                    max={100}
                    step={0.25}
                    required
                    className="w-24"
                    value={q.points}
                    onFocus={() => {
                      pointsFocusRef.current[index] = q.points;
                    }}
                    onChange={(e) =>
                      updateQuestionMeta(index, { points: e.target.value })
                    }
                    onBlur={(e) => commitQuestionPoints(index, e.target.value)}
                  />
                </div>
                {questions.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="ml-auto"
                    aria-label={`Xóa câu ${index + 1}`}
                    onClick={() =>
                      commitQuestions(questions.filter((_, i) => i !== index))
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="grid gap-2">
                <Label>Nội dung</Label>
                <AutoTextarea
                  required
                  rows={6}
                  value={q.statement}
                  onChange={(e) =>
                    updateQuestionMeta(index, { statement: e.target.value })
                  }
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={busy || blockSave}>
          {submitLabel}
        </Button>
        {allowDelete && onDelete ? (
          <Button
            type="button"
            variant="destructive"
            disabled={busy}
            onClick={onDelete}
          >
            Xóa nháp
          </Button>
        ) : null}
      </div>
    </form>
  );
}

export function parseQuestions(
  questions: ExamBankFormQuestion[],
): { statement: string; points: number }[] | string {
  const out: { statement: string; points: number }[] = [];
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const statement = q.statement.trim();
    if (!statement) return `Câu ${i + 1}: thiếu nội dung.`;
    const points = Number(q.points);
    if (!Number.isFinite(points) || points <= 0) {
      return `Câu ${i + 1}: điểm phải lớn hơn 0.`;
    }
    out.push({ statement, points });
  }
  if (out.length === 0) return "Cần ít nhất một câu.";
  return out;
}

export function parseTotalPoints(raw: string): number | string {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return "Tổng điểm đề phải lớn hơn 0.";
  return n;
}

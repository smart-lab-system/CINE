'use client';

import { Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ClipboardCheck, Play, Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useExamSessions } from '@/hooks/useExamSession';
import { useTeachingClasses } from '@/hooks/useTeaching';
import {
  useGradingResults,
  useRubrics,
  useSaveRubric,
  useStartGrading,
} from '@/hooks/useGrading';
import type { GradingResult } from '@/lib/api/grading';

const VERDICT_LABELS: Record<GradingResult['criterionResults'][number]['verdict'], string> = {
  met: 'Đạt',
  partially_met: 'Đạt một phần',
  not_met: 'Chưa đạt',
};

/**
 * Grading — deliberately its own screen, reached by choosing a session.
 *
 * The separation is the feature. CLAUDE.md's central structural rule is
 * that collection and grading are two pipelines joined by one explicit
 * teacher action; a session can sit finished for a week and nothing
 * happens until someone opens this page and presses the button. Putting a
 * "grade now" control on the lobby, next to finalize, would make the two
 * look like one continuous flow — which is exactly what must not be built.
 */
export default function GradingPage() {
  // useSearchParams requires a Suspense boundary in the App Router — the
  // rest of the page has no reason to wait on anything, so only this one
  // read is wrapped, not the whole tree.
  return (
    <Suspense>
      <GradingPageContent />
    </Suspense>
  );
}

function GradingPageContent() {
  const searchParams = useSearchParams();
  const sessions = useExamSessions({ page: 1, pageSize: 50 });
  const classes = useTeachingClasses();
  // Seeded once, from the submissions detail page's "Chấm điểm" link
  // (?sessionId=) — the dropdown below still lets the teacher change it;
  // this only saves them from picking a session they already came here to
  // grade.
  const [sessionId, setSessionId] = useState<string>(() => searchParams.get('sessionId') ?? '');

  const session = sessions.data?.items.find((item) => item.id === sessionId);
  // The rubric belongs to the COURSE, and the session list carries only the
  // course NAME — the class list is what maps a session's course to an id.
  const courseId = useMemo(() => {
    if (!session) return undefined;
    return classes.data?.find((klass) => klass.courseName === session.courseName)?.courseId;
  }, [session, classes.data]);

  const rubrics = useRubrics(courseId);
  const results = useGradingResults(sessionId || undefined);
  const start = useStartGrading(sessionId || undefined);

  const active = rubrics.data?.find((rubric) => rubric.isActive);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Chấm điểm"
        description="AI chấm theo rubric và nêu bằng chứng; điểm cuối cùng luôn do giảng viên quyết định."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-h3">Chọn phiên thi</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Select value={sessionId} onValueChange={setSessionId}>
            <SelectTrigger id="grading-session" className="max-w-xl">
              <SelectValue
                placeholder={sessions.isLoading ? 'Đang tải…' : 'Chọn một phiên thi'}
              />
            </SelectTrigger>
            <SelectContent>
              {sessions.data?.items.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name} — {item.courseName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {session && session.status !== 'completed' && (
            <p className="text-caption text-muted-foreground">
              Phiên thi này chưa chốt bài. Chấm được, nhưng chỉ chấm những bài đã thu xong.
            </p>
          )}
        </CardContent>
      </Card>

      {sessionId && (
        <>
          <RubricCard courseId={courseId} />

          <Card className="overflow-hidden">
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-4 border-b border-border bg-surface-2/60">
              <CardTitle className="text-h3">Kết quả chấm</CardTitle>
              <Button
                type="button"
                size="sm"
                loading={start.isPending}
                disabled={!active}
                onClick={() => start.mutate()}
              >
                <Play className="h-4 w-4" aria-hidden="true" />
                Bắt đầu chấm
              </Button>
            </CardHeader>

            <CardContent className="flex flex-col gap-4 p-6">
              {!active && (
                <Alert variant="warning">
                  <AlertDescription>
                    Môn này chưa có rubric đang dùng. Tạo rubric ở trên trước khi chấm.
                  </AlertDescription>
                </Alert>
              )}

              {start.isError && (
                <Alert variant="destructive">
                  <AlertDescription>{start.error.message}</AlertDescription>
                </Alert>
              )}

              {start.isSuccess && (
                <Alert variant="info">
                  <AlertDescription>
                    Đã chấm {start.data.queued} bài bằng rubric phiên bản{' '}
                    {start.data.rubricVersion}
                    {start.data.alreadyGraded > 0
                      ? `; bỏ qua ${start.data.alreadyGraded} bài đã chấm trước đó.`
                      : '.'}
                  </AlertDescription>
                </Alert>
              )}

              {results.isLoading ? (
                <Skeleton className="h-5 w-1/2" />
              ) : (results.data?.length ?? 0) === 0 ? (
                <p className="rounded-md border border-dashed border-border px-4 py-3 text-small text-muted-foreground">
                  Chưa chấm bài nào. Hệ thống không tự chấm sau khi thu bài — bạn bấm nút thì
                  mới chạy.
                </p>
              ) : (
                <ResultsTable results={results.data!} />
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function ResultsTable({ results }: { results: GradingResult[] }) {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead scope="col">Sinh viên</TableHead>
            <TableHead scope="col">Điểm AI đề xuất</TableHead>
            <TableHead scope="col">Mô hình</TableHead>
            <TableHead scope="col">Trạng thái</TableHead>
            <TableHead scope="col" className="text-right">
              <span className="sr-only">Bằng chứng</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {results.map((result) => (
            <>
              <TableRow key={result.id}>
                <TableCell>
                  <span className="font-medium">{result.studentName}</span>{' '}
                  <span className="font-mono text-muted-foreground">{result.studentMssv}</span>
                </TableCell>
                <TableCell className="tabular-nums">
                  {/* "Đề xuất", never "điểm": the teacher decides, and the
                      column heading has to say so every time it is read. */}
                  {result.aiTotalScore ?? '—'}
                </TableCell>
                <TableCell className="font-mono text-caption text-muted-foreground">
                  {result.modelUsed ?? '—'}
                </TableCell>
                <TableCell>
                  {result.flagForReview ? (
                    <Badge variant="warning">Cần giảng viên xem</Badge>
                  ) : (
                    <Badge variant="success">Tự duyệt</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setOpen(open === result.id ? null : result.id)}
                  >
                    {open === result.id ? 'Ẩn' : 'Bằng chứng'}
                  </Button>
                </TableCell>
              </TableRow>
              {open === result.id && (
                <TableRow key={`${result.id}-evidence`} className="hover:bg-transparent">
                  <TableCell colSpan={5} className="bg-surface-2/60">
                    <ul className="flex flex-col gap-2 py-2">
                      {result.criterionResults.map((criterion, index) => (
                        <li key={criterion.criterionId ?? index} className="flex flex-col gap-0.5">
                          <span className="text-small font-medium">
                            {VERDICT_LABELS[criterion.verdict] ?? criterion.verdict} ·{' '}
                            {criterion.points} điểm
                          </span>
                          <span className="text-caption text-muted-foreground">
                            {criterion.evidence}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </TableCell>
                </TableRow>
              )}
            </>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/**
 * The rubric editor. Saving always creates a new VERSION — there is no
 * update path in the API, because changing criteria that existing results
 * cite is what Security rule 7 forbids. The card says so, so a version
 * number climbing during authoring reads as intended rather than as a bug.
 */
function RubricCard({ courseId }: { courseId: string | undefined }) {
  const rubrics = useRubrics(courseId);
  const save = useSaveRubric(courseId);
  const active = rubrics.data?.find((rubric) => rubric.isActive);
  const [draft, setDraft] = useState<{ description: string; maxPoints: string }[] | null>(
    null,
  );

  const rows =
    draft ??
    active?.criteria.map((c) => ({
      description: c.description,
      maxPoints: String(c.maxPoints),
    })) ??
    [{ description: '', maxPoints: '5' }];

  function update(next: typeof rows) {
    setDraft(next);
  }

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-4">
        <CardTitle className="text-h3">
          Rubric
          {active && (
            <span className="ml-2 font-normal text-muted-foreground">
              phiên bản {active.version} · {active.totalPoints} điểm
            </span>
          )}
        </CardTitle>
        <Button
          type="button"
          size="sm"
          variant="outline"
          loading={save.isPending}
          disabled={!courseId}
          onClick={() =>
            save.mutate(
              rows
                .filter((row) => row.description.trim() !== '')
                .map((row) => ({
                  description: row.description.trim(),
                  maxPoints: Number(row.maxPoints) || 0,
                })),
              { onSuccess: () => setDraft(null) },
            )
          }
        >
          Lưu thành phiên bản mới
        </Button>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <p className="text-small text-muted-foreground">
          Mỗi lần lưu tạo một phiên bản mới. Bài đã chấm vẫn giữ nguyên phiên bản cũ — sửa
          rubric không được phép làm thay đổi những kết quả đã có.
        </p>

        {!courseId && (
          <Alert variant="info">
            <AlertDescription>
              Chưa xác định được môn của phiên thi này. Hãy chọn một phiên thi thuộc lớp bạn
              đang dạy.
            </AlertDescription>
          </Alert>
        )}

        {save.isError && (
          <Alert variant="destructive">
            <AlertDescription>{save.error.message}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col gap-3">
          {rows.map((row, index) => (
            <div key={index} className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex flex-1 flex-col gap-1.5">
                <Label htmlFor={`criterion-${index}`}>Tiêu chí {index + 1}</Label>
                <Input
                  id={`criterion-${index}`}
                  value={row.description}
                  placeholder="vd: Trình bày thuật toán rõ ràng, có độ phức tạp"
                  onChange={(event) =>
                    update(
                      rows.map((r, i) =>
                        i === index ? { ...r, description: event.target.value } : r,
                      ),
                    )
                  }
                />
              </div>
              <div className="flex w-28 flex-col gap-1.5">
                <Label htmlFor={`criterion-points-${index}`}>Điểm tối đa</Label>
                <Input
                  id={`criterion-points-${index}`}
                  type="number"
                  min={0.25}
                  step={0.25}
                  value={row.maxPoints}
                  onChange={(event) =>
                    update(
                      rows.map((r, i) =>
                        i === index ? { ...r, maxPoints: event.target.value } : r,
                      ),
                    )
                  }
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={rows.length === 1}
                aria-label={`Xoá tiêu chí ${index + 1}`}
                onClick={() => update(rows.filter((_, i) => i !== index))}
                className="shrink-0 hover:bg-danger-subtle hover:text-danger-strong"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          ))}
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => update([...rows, { description: '', maxPoints: '5' }])}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Thêm tiêu chí
        </Button>

        {rubrics.data && rubrics.data.length > 1 && (
          <p className="flex items-center gap-2 text-caption text-muted-foreground">
            <ClipboardCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Đã có {rubrics.data.length} phiên bản. Các phiên bản cũ được giữ lại để đối chiếu
            với những bài đã chấm theo chúng.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

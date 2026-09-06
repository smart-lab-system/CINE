'use client';

import { Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Play } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useSessionOverview } from '@/hooks/useSubmissionOverview';
import { ReviewWorkspace } from './_components/ReviewWorkspace';
import { FinalizeGradesButton } from './_components/FinalizeGradesButton';
import {
  useGradingResults,
  useRubrics,
  useSetSessionRubric,
  useStartGrading,
} from '@/hooks/useGrading';

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
  // Nguồn là overview, không phải GET /exam-sessions. Ba lý do, mỗi lý do
  // tự nó đã đủ: endpoint kia có trần cứng 50 phiên; overview đã mang sẵn
  // `courseId`, chấm dứt trò suy courseId bằng cách khớp TÊN môn (hai môn
  // cùng tên khác học kỳ khớp nhầm bản đầu, và giảng viên sửa rubric của
  // môn sai); và nó đã có số liệu bài nộp lẫn rubric đã ghim, đủ dựng cả
  // trạng thái chặn mà không gọi thêm API nào.
  const overview = useSessionOverview();
  const [sessionId, setSessionId] = useState<string>(() => searchParams.get('sessionId') ?? '');

  // Chỉ phiên có bài để chấm.
  //
  // KHÔNG lọc theo rubric — phiên thiếu rubric phải hiện ra kèm trạng thái
  // chặn, vì bài thi thật của SV đang nằm trong đó (spec §5.3).
  //
  // KHÔNG lọc theo archivedAt — lưu trữ là khái niệm của luồng THU BÀI;
  // gắn nó vào chấm điểm nghĩa là giảng viên dọn dẹp một màn hình thì âm
  // thầm mất đường vào màn hình kia.
  const gradable = useMemo(
    () =>
      (overview.data ?? []).filter(
        (item) => item.fullySubmittedCount + item.partialCount > 0,
      ),
    [overview.data],
  );

  const session = gradable.find((item) => item.id === sessionId);
  const courseId = session?.courseId;

  const results = useGradingResults(sessionId || undefined);
  const start = useStartGrading(sessionId || undefined);
  const hasResults = (results.data?.length ?? 0) > 0;

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
                placeholder={overview.isLoading ? 'Đang tải…' : 'Chọn một phiên thi'}
              />
            </SelectTrigger>
            <SelectContent>
              {gradable.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name} — {item.courseName}
                  {/* Nhìn thấy được TRƯỚC khi chọn. Danh sách là một
                      <Select>, badge không đặt được trong option, nên hậu
                      tố văn bản là cách duy nhất. */}
                  {item.rubricId ? '' : ' — chưa gắn rubric'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!overview.isLoading && gradable.length === 0 && (
            <p className="text-caption text-muted-foreground">
              Chưa có phiên thi nào thu được bài. Chấm điểm chỉ làm việc với bài đã thu.
            </p>
          )}
          {session && session.status !== 'completed' && (
            <p className="text-caption text-muted-foreground">
              Phiên thi này chưa chốt bài. Chấm được, nhưng chỉ chấm những bài đã thu xong.
            </p>
          )}
        </CardContent>
      </Card>

      {session && (
        <>
          <SessionRubricCard
            sessionId={session.id}
            courseId={courseId}
            rubricVersion={session.rubricVersion}
            hasResults={hasResults}
          />

          <Card className="overflow-hidden">
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-4 border-b border-border bg-surface-2/60">
              <CardTitle className="text-h3">Kết quả chấm</CardTitle>
              <Button
                type="button"
                size="sm"
                loading={start.isPending}
                // Theo rubric ĐÃ GHIM của phiên, không theo bản `isActive`
                // của môn. Bản active có thể đã là v5 trong khi phiên này
                // ghim v3 — và v3 mới là thứ nó sẽ được chấm bằng.
                disabled={!session.rubricId}
                title={
                  session.rubricId
                    ? undefined
                    : 'Phiên thi này chưa gắn rubric — gắn rubric ở trên trước khi chấm.'
                }
                onClick={() => start.mutate()}
              >
                <Play className="h-4 w-4" aria-hidden="true" />
                Bắt đầu chấm
              </Button>
            </CardHeader>

            <CardContent className="flex flex-col gap-4 p-6">
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
                <div className="flex flex-col gap-4">
                  <ReviewWorkspace examSessionId={sessionId} results={results.data!} />
                  <FinalizeGradesButton
                    examSessionId={sessionId}
                    results={results.data!}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

/**
 * Rubric của phiên thi này — hiển thị, và đổi được cho tới khi bài đầu tiên
 * được chấm.
 *
 * KHÔNG phải editor. Soạn rubric là việc theo MÔN, làm một lần, và sống ở
 * /teacher/rubrics. Ở đây chỉ có một quyết định: phiên này chấm bằng bản
 * nào — và phiên bản hiện ra là bản ĐÃ GHIM của phiên, không phải bản mới
 * nhất của môn.
 */
function SessionRubricCard({
  sessionId,
  courseId,
  rubricVersion,
  hasResults,
}: {
  sessionId: string;
  courseId: string | undefined;
  rubricVersion: number | null;
  hasResults: boolean;
}) {
  const rubrics = useRubrics(courseId);
  const setRubric = useSetSessionRubric(sessionId);
  const options = rubrics.data ?? [];

  // Phiên chưa gắn rubric: chặn, nhưng KHÔNG ẩn khỏi danh sách và không im
  // lặng. Bài thi thật của sinh viên đang nằm trong phiên này (spec §5.3).
  if (rubricVersion === null) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-4 py-6">
          <Alert variant="warning">
            <AlertDescription>
              <span className="font-semibold">
                Phiên thi này chưa gắn rubric — chưa chấm được.
              </span>{' '}
              Bài đã thu vẫn còn nguyên; chọn rubric bên dưới là chấm được ngay.
            </AlertDescription>
          </Alert>

          {options.length > 0 ? (
            <div className="flex flex-wrap items-center gap-3">
              <Select
                onValueChange={(value) => setRubric.mutate(value)}
                disabled={setRubric.isPending}
              >
                <SelectTrigger id="attach-rubric" className="max-w-md">
                  <SelectValue placeholder="Chọn rubric cho phiên thi này" />
                </SelectTrigger>
                <SelectContent>
                  {options.map((rubric) => (
                    <SelectItem key={rubric.id} value={rubric.id}>
                      Phiên bản {rubric.version} — {rubric.totalPoints} điểm
                      {rubric.isActive ? ' (mới nhất)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Link
                href="/teacher/rubrics"
                className="text-small font-semibold underline underline-offset-2"
              >
                Quản lý rubric
              </Link>
            </div>
          ) : (
            <p className="text-small text-muted-foreground">
              Môn này chưa có rubric nào.{' '}
              <Link
                href="/teacher/rubrics"
                className="font-semibold underline underline-offset-2"
              >
                Soạn rubric
              </Link>{' '}
              rồi quay lại đây.
            </p>
          )}

          {setRubric.isError && (
            <Alert variant="destructive">
              <AlertDescription>{setRubric.error.message}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
        <p className="text-small">
          Phiên thi này chấm theo{' '}
          <span className="font-semibold">rubric phiên bản {rubricVersion}</span>.{' '}
          <Link
            href="/teacher/rubrics"
            className="underline underline-offset-2 text-muted-foreground"
          >
            Quản lý rubric
          </Link>
        </p>

        {hasResults ? (
          // Không phải nút tắt câm: nói luôn vì sao. Đổi rubric sau khi đã
          // chấm là viết lại thứ mà kết quả đã trỏ tới — Security rule 7.
          <p className="text-caption text-muted-foreground">
            Đã có kết quả chấm nên không đổi được rubric nữa.
          </p>
        ) : (
          <Select
            onValueChange={(value) => setRubric.mutate(value)}
            disabled={setRubric.isPending || options.length === 0}
          >
            <SelectTrigger id="change-rubric" className="max-w-xs">
              <SelectValue placeholder="Đổi rubric" />
            </SelectTrigger>
            <SelectContent>
              {options.map((rubric) => (
                <SelectItem key={rubric.id} value={rubric.id}>
                  Phiên bản {rubric.version} — {rubric.totalPoints} điểm
                  {rubric.isActive ? ' (mới nhất)' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </CardContent>
    </Card>
  );
}

'use client';

import { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
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
import { SessionRubricCard } from './_components/SessionRubricCard';
import { ReadinessStrip } from './_components/ReadinessStrip';
import { GradingReferenceDialog } from './_components/GradingReferenceDialog';
import { ConfidenceTiles } from './_components/ConfidenceTiles';
import { AnomalyPanel } from './_components/AnomalyPanel';
import { NotBuiltYetPanel } from './_components/NotBuiltYetPanel';
import { bucketOf, type Bucket } from '@/lib/grading-triage';
import {
  useGradingResults,
  useGradingReadiness,
  useRegradeStuck,
  useRubrics,
  useGradingProgress,
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

  const results = useGradingResults(sessionId || undefined);
  const start = useStartGrading(sessionId || undefined);
  const progress = useGradingProgress(sessionId || undefined);
  // Chỉ "đang chấm" khi THẬT SỰ còn bài chưa xong. Dùng chính con số
  // của phiên này, không dùng trạng thái nút bấm: mutation kết thúc sau
  // vài trăm mili giây, còn lượt chấm thì chạy tiếp nhiều phút.
  const grading = (progress.data?.pending ?? 0) > 0;
  const hasResults = (results.data?.length ?? 0) > 0;

  const readiness = useGradingReadiness(sessionId || undefined);
  const regrade = useRegradeStuck(sessionId || undefined);
  const rubrics = useRubrics();
  const [configuring, setConfiguring] = useState(false);
  const [bucket, setBucket] = useState<Bucket>('flagged');

  // Rubric ĐÃ GHIM của phiên, không phải bản mới nhất của môn: bản active
  // có thể đã là v5 trong khi phiên này được chấm bằng v3, và thang điểm
  // dùng để quy kiến nghị phản biện phải là thang đã chấm.
  const pinnedRubric = rubrics.data?.find(
    (item) => item.version === session?.rubricVersion,
  );

  const queueActive = progress.data?.queue.active ?? 0;
  const shown = useMemo(
    () => (results.data ?? []).filter((item) => bucketOf(item, queueActive) === bucket),
    [results.data, queueActive, bucket],
  );
  const stuckCount = useMemo(
    () => (results.data ?? []).filter((item) => bucketOf(item, queueActive) === 'stuck').length,
    [results.data, queueActive],
  );

  /**
   * Phiên CÓ đề bài, nhưng lượt chấm trả lời mà không dùng tới nó.
   *
   * `contextUsedQuestion` nói về BẬC MODEL ĐÃ TRẢ LỜI, không về cấu hình
   * phiên — provider sàn (đếm từ khoá) khai `false` một cách trung thực vì
   * nó không đụng tới đề bài. Nên câu chữ đi kèm KHÔNG được suy ra nguyên
   * nhân "file bị xoá": với cấu hình không có Claude thì đây là mọi bài, và
   * một cảnh báo đúng 100% số lần nhưng sai nguyên nhân còn tệ hơn im lặng.
   *
   * `=== false` chứ không `!contextUsedQuestion`: `null` nghĩa là bài chấm
   * trước khi hệ thống ghi lại điều này, và gộp nó vào đây sẽ báo động giả
   * trên mọi bài cũ.
   */
  const contextMismatch =
    readiness.data?.hasQuestion === true &&
    (results.data ?? []).some((item) => item.contextUsedQuestion === false);

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
          <Select
            value={sessionId}
            onValueChange={(value) => {
              setSessionId(value);
              // Mutation state (banner "Đã chấm X bài...", "Đã xếp lại...") sống
              // theo COMPONENT, không theo phiên — không reset thì banner của
              // phiên vừa rời khỏi vẫn hiện dưới bảng kết quả của phiên mới chọn.
              start.reset();
              regrade.reset();
            }}
          >
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
            rubricVersion={session.rubricVersion}
            hasResults={hasResults}
          />

          {/* Mức sẵn sàng đứng TRƯỚC tiến độ. "Đã chấm 45/45" không nói gì
              về việc 45 bài ấy được chấm với đề bài trong tay hay không, và
              lượt phản biện chỉ chạy khi có đề bài. */}
          {readiness.data && (
            <ReadinessStrip
              readiness={readiness.data}
              onConfigure={() => setConfiguring(true)}
            />
          )}

          {contextMismatch && (
            <Alert variant="info">
              <AlertDescription>
                Phiên này có đề bài, nhưng một số bài được chấm bởi một lượt{' '}
                <span className="font-semibold">không dùng tới đề bài</span>. Thường là do mô
                hình dự phòng đang trả lời thay — nó chỉ đối chiếu rubric. Lượt phản biện vẫn
                chạy bình thường, vì nó đọc đề bài bằng đường riêng.
              </AlertDescription>
            </Alert>
          )}

          <GradingReferenceDialog
            examSessionId={session.id}
            open={configuring}
            onOpenChange={setConfiguring}
            readiness={
              readiness.data ?? {
                level: 'rubric_only',
                warning: null,
                hasQuestion: false,
                hasModelAnswer: false,
              }
            }
          />

          {hasResults && (
            <>
              <ConfidenceTiles
                results={results.data!}
                queueActive={queueActive}
                active={bucket}
                onChange={setBucket}
              />
              <AnomalyPanel results={results.data!} rubric={pinnedRubric} />
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3">
                <p className="flex-1 text-small text-muted-foreground">
                  Nhiều bài cùng một kiểu? Xử lý cả nhóm trong một màn thay vì mở từng bài.
                </p>
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/teacher/grading/matrix?sessionId=${sessionId}`}>
                    Mở ma trận điều hành
                  </Link>
                </Button>
              </div>
            </>
          )}

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
                //
                // Cũng chặn khi lượt chấm trước còn đang chạy: bấm lại lúc
                // đó không tạo thêm gì (jobId trùng bị bỏ qua), nhưng nút
                // bấm được trong khi không có gì xảy ra là một lời nói dối.
                disabled={!session.rubricId || grading}
                title={
                  session.rubricId
                    ? grading
                      ? 'Đang chấm — chờ lượt hiện tại xong đã.'
                      : undefined
                    : 'Phiên thi này chưa gắn rubric — gắn rubric ở trên trước khi chấm.'
                }
                onClick={() => start.mutate()}
              >
                <Play className="h-4 w-4" aria-hidden="true" />
                Bắt đầu chấm
              </Button>
            </CardHeader>

            <CardContent className="flex flex-col gap-4 p-6">
              {/* Mặc định của React Query: một lượt refetch lỗi giữ nguyên
                  `data` thành công gần nhất — không có dòng này, bảng dưới
                  vẫn hiện y như cũ và giảng viên không biết đang xem dữ liệu
                  cũ, có thể đã lệch với thực tế. */}
              {results.isError && (
                <Alert variant="destructive">
                  <AlertDescription>
                    Không tải được kết quả chấm mới nhất — {results.error.message}. Bảng dưới
                    đây (nếu có) là dữ liệu cũ, có thể không còn đúng. Thử tải lại trang.
                  </AlertDescription>
                </Alert>
              )}

              {start.isError && (
                <Alert variant="destructive">
                  <AlertDescription>{start.error.message}</AlertDescription>
                </Alert>
              )}

              {/* Chấm điểm chạy NỀN từ 2026-09-11: `Bắt đầu chấm` trả về
                  ngay sau khi xếp hàng, và một lượt 40 bài mất nhiều phút.
                  Không có dòng này thì giảng viên bấm nút rồi nhìn một màn
                  hình không đổi gì — đúng thứ mà việc chuyển sang hàng đợi
                  lẽ ra phải cải thiện, không phải làm tệ đi. */}
              {grading && (
                <Alert variant="info">
                  <AlertDescription className="flex flex-col gap-2">
                    <span>
                      Đang chấm {progress.data!.done}/{progress.data!.total} bài. Trang tự
                      cập nhật — không cần chờ ở đây.
                    </span>
                    <span
                      className="h-1.5 w-full overflow-hidden rounded-full bg-border"
                      role="progressbar"
                      aria-valuenow={progress.data!.done}
                      aria-valuemin={0}
                      aria-valuemax={progress.data!.total}
                    >
                      <span
                        className="block h-full rounded-full bg-primary transition-[width] duration-500"
                        style={{
                          width: `${Math.round(
                            (progress.data!.done / Math.max(progress.data!.total, 1)) * 100,
                          )}%`,
                        }}
                      />
                    </span>
                    {progress.data!.queue.failed > 0 && (
                      // Hàng đợi TOÀN hệ thống, không phải của riêng phiên
                      // này — nên nó nói "có gì đó đang hỏng", không nói
                      // "bài của bạn hỏng". Hai câu khác nhau.
                      <span className="text-caption text-muted-foreground">
                        Hàng đợi đang có {progress.data!.queue.failed} job lỗi — nếu tiến độ
                        đứng yên, hãy báo quản trị viên.
                      </span>
                    )}
                  </AlertDescription>
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
                  {shown.length === 0 ? (
                    <p className="rounded-md border border-dashed border-border px-4 py-3 text-small text-muted-foreground">
                      Không có bài nào trong nhóm đang lọc. Chọn một ô khác ở trên.
                    </p>
                  ) : (
                    <ReviewWorkspace examSessionId={sessionId} results={shown} />
                  )}

                  <div className="flex flex-wrap items-center gap-3">
                    {/* Chỉ bật khi hàng đợi KHÔNG còn job chạy. Một bài đang
                        được worker chấm dở cũng ở `ai_grading`, và xếp lại
                        nó là tự tạo ra đúng lượt chấm trùng mà jobId sinh ra
                        để chặn — chặn được, nhưng con số trả về sẽ nói dối. */}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      loading={regrade.isPending}
                      disabled={queueActive > 0 || stuckCount === 0}
                      title={
                        stuckCount === 0
                          ? 'Không có bài nào treo.'
                          : queueActive > 0
                            ? 'Hàng đợi còn đang chạy — chờ xong đã, nếu không sẽ xếp lại cả bài đang được chấm dở.'
                            : undefined
                      }
                      onClick={() => regrade.mutate()}
                    >
                      Chấm lại {stuckCount} bài treo
                    </Button>
                    {regrade.isSuccess && (
                      <span className="text-caption text-muted-foreground">
                        Đã xếp lại {regrade.data.requeued}/{regrade.data.stuck} bài.
                      </span>
                    )}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <NotBuiltYetPanel
                      title="Điều khiển hàng đợi"
                      missing="Hàng đợi đã có sẵn cơ chế tạm dừng và chạy lại, nhưng chưa có đường gọi từ màn hình này."
                    >
                      <Button variant="outline" size="sm">Tạm dừng</Button>
                      <Button variant="outline" size="sm">Huỷ phần còn lại</Button>
                    </NotBuiltYetPanel>

                    <NotBuiltYetPanel
                      title="Chấm thử trước"
                      missing="Hiện chỉ chấm được cả phiên một lượt — chưa chọn được một nhóm nhỏ để thử trước khi giao cả lớp."
                    >
                      <Button variant="outline" size="sm">Chọn 3 bài chấm thử</Button>
                    </NotBuiltYetPanel>
                  </div>

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

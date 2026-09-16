'use client';

import { use, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useGradingReadiness,
  useGradingResults,
  useRubrics,
  useSubmissionText,
  useSubmitReview,
} from '@/hooks/useGrading';
import { useSessionOverview } from '@/hooks/useSubmissionOverview';
import type { ReviewCriterion } from '@/lib/api/grading';
import { AnswerPane } from './_components/AnswerPane';
import { CriterionCard } from './_components/CriterionCard';
import { AdvocatePanel } from './_components/AdvocatePanel';

/** AI còn đang làm việc — chưa duyệt được. */
const IN_PROGRESS = ['ai_grading', 'ai_graded'];
/** Điểm đã CÔNG BỐ — sửa từ đây trở đi để lại dấu vết trong nhật ký. */
const PUBLISHED = ['finalized', 'exported'];

/**
 * Bàn chấm một bài.
 *
 * Route RIÊNG chứ không phải panel: split-view cần hai cột 50-50, và một
 * đường dẫn trỏ thẳng vào một bài là thứ cần thật khi sinh viên phúc khảo.
 */
export default function GradingDetailPage({
  params,
}: {
  params: Promise<{ resultId: string }>;
}) {
  const { resultId } = use(params);
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('sessionId') ?? '';

  const results = useGradingResults(sessionId || undefined);
  const readiness = useGradingReadiness(sessionId || undefined);
  const text = useSubmissionText(resultId);
  const overview = useSessionOverview();
  const session = (overview.data ?? []).find((item) => item.id === sessionId);
  const rubrics = useRubrics(session?.courseId);
  const rubric = rubrics.data?.find((item) => item.version === session?.rubricVersion);

  const submit = useSubmitReview(sessionId || undefined);
  const result = results.data?.find((item) => item.id === resultId);

  const [draft, setDraft] = useState<ReviewCriterion[] | null>(null);
  const [activeCriterionId, setActive] = useState<string | null>(null);
  const [privateNote, setPrivateNote] = useState('');
  const [studentFeedback, setStudentFeedback] = useState('');

  // Điểm khởi đầu: bản giảng viên đã sửa nếu có, chưa thì bản AI đề xuất.
  const initial = useMemo<ReviewCriterion[]>(
    () =>
      result?.editedCriteria ??
      (result?.criterionResults ?? []).map((criterion) => ({
        criterionId: criterion.criterionId,
        verdict: criterion.verdict,
        points: criterion.points,
      })),
    [result],
  );
  const rows = draft ?? initial;

  // Tổng LUÔN tính từ các ô, không cho nhập tay — khớp với việc server cũng
  // tính bằng tổng và bỏ qua mọi tổng client gửi lên.
  const total = Math.round(rows.reduce((sum, row) => sum + row.points, 0) * 100) / 100;

  const criterionIndexOf = (criterionId: string) =>
    rubric?.criteria.findIndex((criterion) => criterion.id === criterionId) ?? 0;

  function update(criterionId: string, patch: Partial<ReviewCriterion>) {
    setDraft(rows.map((row) => (row.criterionId === criterionId ? { ...row, ...patch } : row)));
  }

  /**
   * Gán một đoạn bôi đen làm minh chứng.
   *
   * Ghi vào bản nháp của tiêu chí ĐANG CHỌN. Payload lưu vẫn là toàn bộ tiêu
   * chí — server đòi phủ đủ, nên không có ca "gán minh chứng mà quên cập
   * nhật đánh giá".
   */
  function pinEvidence(selected: string) {
    if (!activeCriterionId) return;
    update(activeCriterionId, { pinnedEvidence: selected });
  }

  if (results.isLoading || text.isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (!result) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Không tìm thấy bài này. Quay lại{' '}
          <Link href="/teacher/grading" className="font-semibold underline underline-offset-2">
            màn Điều phối
          </Link>{' '}
          và chọn lại.
        </AlertDescription>
      </Alert>
    );
  }

  const readOnly = IN_PROGRESS.includes(result.status);
  const published = PUBLISHED.includes(result.status);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Link
            href={`/teacher/grading?sessionId=${sessionId}`}
            className="flex w-fit items-center gap-1.5 text-caption text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Về màn Điều phối
          </Link>
          <h1 className="text-h1">{result.studentName}</h1>
          <p className="text-caption text-muted-foreground">
            <span className="font-mono">{result.studentMssv}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {readiness.data && (
            <Badge variant={readiness.data.hasQuestion ? 'accent' : 'warning'}>
              {readiness.data.hasQuestion ? 'Mức 2 — có đề bài' : 'Mức 1 — chỉ có thang chấm'}
            </Badge>
          )}
          {result.contextUsedQuestion === false && readiness.data?.hasQuestion && (
            <Badge variant="destructive">bài này chấm mà không đọc được đề</Badge>
          )}
        </div>
      </div>

      {readOnly && (
        <Alert variant="info">
          <AlertDescription>
            AI đang chấm bài này — chưa duyệt được. Tải lại sau ít phút.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader className="border-b border-border/70">
            <CardTitle className="text-h3">Bài làm</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            {text.data ? (
              <AnswerPane
                text={text.data}
                criterionIndexOf={criterionIndexOf}
                activeCriterionId={activeCriterionId}
                onSelectCriterion={setActive}
                onPin={readOnly ? undefined : pinEvidence}
              />
            ) : (
              <p className="text-small text-muted-foreground">Chưa tải được nội dung bài làm.</p>
            )}
            {!readOnly && (
              <p className="mt-3 border-l-2 border-border pl-2.5 text-caption text-muted-foreground">
                Bôi đen một đoạn trong bài làm để gán nó làm minh chứng cho tiêu chí đang chọn.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="flex flex-col overflow-hidden">
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 border-b border-border/70">
            <CardTitle className="text-h3">Thang chấm &amp; giải trình</CardTitle>
            {result.confidence !== null && (
              <Badge variant="warning">
                độ tin cậy {result.confidence.toFixed(2).replace('.', ',')}
              </Badge>
            )}
          </CardHeader>

          <CardContent className="flex max-h-[64vh] flex-col gap-3 overflow-y-auto p-4 [scroll-padding-top:0.75rem]">
            {rows.map((row) => {
              const criterion = result.criterionResults.find(
                (item) => item.criterionId === row.criterionId,
              );
              const spec = rubric?.criteria.find((item) => item.id === row.criterionId);
              if (!criterion) return null;
              return (
                <CriterionCard
                  key={row.criterionId}
                  criterion={criterion}
                  index={criterionIndexOf(row.criterionId)}
                  description={spec?.description ?? 'Tiêu chí'}
                  maxPoints={spec?.maxPoints ?? 0}
                  confidence={result.confidence}
                  draft={row}
                  active={activeCriterionId === row.criterionId}
                  onActivate={() => setActive(row.criterionId)}
                  onChange={(patch) => update(row.criterionId, patch)}
                >
                  <AdvocatePanel
                    opinion={result.advocateOpinion}
                    criterionId={row.criterionId}
                    maxPoints={spec?.maxPoints ?? 0}
                    hasQuestion={readiness.data?.hasQuestion ?? false}
                    onApply={(next) => update(row.criterionId, next)}
                  />
                </CriterionCard>
              );
            })}
          </CardContent>

          {!readOnly && (
            <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-surface px-5 py-3.5">
              <div>
                <span className="text-h1 tabular-nums">{total}</span>
                <span className="text-caption text-muted-foreground">
                  {' '}
                  / {rubric?.totalPoints ?? '—'} · AI đề xuất{' '}
                  <span className="tabular-nums">{result.aiTotalScore ?? '—'}</span>
                </span>
              </div>
              <Button
                size="sm"
                loading={submit.isPending}
                onClick={() =>
                  submit.mutate(
                    { gradingResultId: result.id, criteria: rows, privateNote, studentFeedback },
                    { onSuccess: () => setDraft(null) },
                  )
                }
              >
                {published ? 'Lưu và ghi nhật ký' : 'Lưu duyệt'}
              </Button>
            </div>
          )}
        </Card>
      </div>

      {published && (
        <Alert variant="warning">
          <AlertDescription>
            Điểm đã chốt — thay đổi này sẽ được ghi vào nhật ký.
          </AlertDescription>
        </Alert>
      )}

      {submit.isError && (
        <Alert variant="destructive">
          <AlertDescription>{submit.error.message}</AlertDescription>
        </Alert>
      )}

      {!readOnly && (
        <Card>
          <CardHeader>
            <CardTitle className="text-h3">Ghi chú</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="private-note">Ghi chú riêng của bạn</Label>
              <textarea
                id="private-note"
                rows={3}
                maxLength={4000}
                value={privateNote}
                onChange={(event) => setPrivateNote(event.target.value)}
                placeholder="Ví dụ: đã châm chước 0,5đ lỗi diễn đạt."
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-small"
              />
              <p className="text-caption text-muted-foreground">
                Không gửi cho sinh viên.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="student-feedback">Nhận xét gửi sinh viên</Label>
              <textarea
                id="student-feedback"
                rows={3}
                maxLength={4000}
                value={studentFeedback}
                onChange={(event) => setStudentFeedback(event.target.value)}
                placeholder="Ví dụ: bài tốt, thiếu ví dụ minh hoạ cho phần nhất quán dữ liệu."
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-small"
              />
              <p className="text-caption text-muted-foreground">
                Xuất ra phiếu phúc khảo kèm trích dẫn đã cho điểm.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

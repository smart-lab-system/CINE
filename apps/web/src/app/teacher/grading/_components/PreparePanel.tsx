'use client';

import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useConfirmBlueprint, useExamSessionDetail } from '@/hooks/useExamSession';
import { useGradingReadiness, useRubrics, useStartGrading } from '@/hooks/useGrading';
import { useRubricOverview } from '@/hooks/useRubricErrors';
import { useTestBundles } from '@/hooks/useTestBundle';
import { preflightOf } from '@/lib/preflight';
import type { SessionOverviewItem } from '@/lib/api/submissions';
import { DeliverableLanguages } from './DeliverableLanguages';
import { PreflightColumn } from './PreflightColumn';
import { ReferenceForm } from './ReferenceForm';
import { RubricRow } from './RubricRow';
import { TestBundleCard } from './TestBundleCard';
import { TestBundleReview } from './TestBundleReview';

/**
 * Chuẩn bị chấm (spec §3.7) — khi phiên chưa có bài nào được chấm (hoặc mọi bài đều "không chấm được" và tài liệu
 * mở khoá lại). Thay `GradingReferenceDialog`, `SessionRubricCard` và nút bắt đầu cũ.
 *
 * Bắt đầu chấm KHOÁ tài liệu và rubric (server: `isGradingLocked`), nên nút chỉ bật khi không dòng nào của cột
 * "Trước khi bắt đầu" chặn — kể cả "còn thay đổi chưa lưu" — và khi bị chặn thì KHÔNG request nào được gửi
 * (T-UI-11). Server vẫn là bên quyết định: nếu nó từ chối, câu của nó hiện nguyên văn.
 */
export function PreparePanel({
  sessionId,
  session,
  allUngradable = false,
  mode = 'edit',
}: {
  sessionId: string;
  session: SessionOverviewItem;
  /** Mọi kết quả hiện có đều là "không chấm được" — màn này được mở lại để sửa thước rồi chấm lại. */
  allUngradable?: boolean;
  /** `review`: sau khi đã bắt đầu chấm — chỉ đọc, không nút bắt đầu. */
  mode?: 'edit' | 'review';
}) {
  const rubrics = useRubrics();
  const readiness = useGradingReadiness(sessionId);
  const detail = useExamSessionDetail(sessionId);
  const overviews = useRubricOverview();
  const bundles = useTestBundles(sessionId);
  const start = useStartGrading(sessionId);
  const confirmBlueprint = useConfirmBlueprint(sessionId);
  const [dirty, setDirty] = useState(false);

  const rubric = session.rubricId ? rubrics.data?.find((r) => r.id === session.rubricId) : undefined;
  const board = rubric ? overviews.data?.find((o) => o.rubricName === rubric.name) : undefined;

  const deliverables = detail.data?.requiredDeliverables ?? [];
  const needsBlueprint = deliverables.length > 1;
  const blueprintConfirmed = Boolean(detail.data?.blueprintConfirmedAt) || confirmBlueprint.isSuccess === true;
  const hasCode = deliverables.some((d) => d.deliverableType === 'code_project');
  const bundleList = bundles.data ?? [];
  const review = mode === 'review';

  const preflight = preflightOf({
    counts: {
      fullySubmitted: session.fullySubmittedCount,
      partial: session.partialCount,
      attendedNoSubmission: session.attendedNoSubmissionCount,
      neverAttended: session.neverAttendedCount,
    },
    hasRubricId: Boolean(session.rubricId),
    rubric,
    readiness: readiness.data,
    deliverables: deliverables.map((d) => ({ deliverableType: d.deliverableType, language: d.language, pipeline: d.pipeline })),
    bundle: {
      pinned: Boolean(detail.data?.testBundleId),
      total: bundleList.length,
      approved: bundleList.filter((b) => b.approvedAt).length,
    },
    board,
    dirty,
    blueprintConfirmed: needsBlueprint ? blueprintConfirmed : null,
    mode: review ? 'review' : 'prepare',
  });

  return (
    <div className="flex flex-col gap-6">
      {!review && allUngradable && (
        <Alert variant="info" role="status">
          <AlertDescription>
            Mọi bài đều không chấm được. Bạn có thể sửa tài liệu chấm rồi chấm lại; nếu phiên chưa mở khoá cho việc
            đó, máy chủ sẽ nói lý do khi bạn lưu.
          </AlertDescription>
        </Alert>
      )}

      {review && (
        <Alert variant="info" role="status">
          <AlertDescription>
            Phiên đã bắt đầu chấm. Tài liệu chấm và rubric đã khoá — màn này chỉ để xem lại. Phiên thi này đã có bài
            mang điểm hoặc đang chấm.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex flex-col gap-6">
          <RubricRow sessionId={sessionId} rubricId={session.rubricId} readOnly={review} />
          <ReferenceForm
            sessionId={sessionId}
            readiness={readiness.data}
            onDirtyChange={setDirty}
            hasPinnedBundle={Boolean(detail.data?.testBundleId)}
            readOnly={review}
          />
          <DeliverableLanguages sessionId={sessionId} deliverables={deliverables} hasResults={allUngradable} readOnly={review} />

          {hasCode && (
            <section aria-label="Gói test" className="flex flex-col gap-3">
              {review ? (
                <TestBundleReview sessionId={sessionId} pinnedBundleId={detail.data?.testBundleId ?? null} />
              ) : (
                <TestBundleCard sessionId={sessionId} pinnedBundleId={detail.data?.testBundleId ?? null} />
              )}
            </section>
          )}
        </div>

        <aside className="flex flex-col gap-4">
          <PreflightColumn rows={preflight.rows} label={review ? 'Đã dùng để chấm' : 'Trước khi bắt đầu'} />

          {!review && <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
            {needsBlueprint && !blueprintConfirmed && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  disabled={dirty}
                  loading={confirmBlueprint.isPending}
                  onClick={() => confirmBlueprint.mutate()}
                >
                  Xác nhận đề cương
                </Button>
                <p className="text-caption text-muted-foreground">
                  Phiên có {deliverables.length} file bắt buộc. Đã chọn đề và đáp án mẫu vẫn chưa xác nhận đề
                  cương — đáp án mẫu phải đã lưu, rồi bấm nút này trước khi bắt đầu chấm.
                </p>
                {confirmBlueprint.isError && (
                  <Alert variant="destructive">
                    <AlertDescription>{confirmBlueprint.error.message}</AlertDescription>
                  </Alert>
                )}
              </>
            )}
            <Button
              type="button"
              disabled={!preflight.canStart}
              loading={start.isPending}
              onClick={() => start.mutate()}
            >
              {preflight.collected > 0 ? `Bắt đầu chấm ${preflight.collected} bài` : 'Bắt đầu chấm'}
            </Button>
            {!preflight.canStart && (
              <p data-testid="start-reason" className="text-caption font-medium text-danger-strong">
                {preflight.reason}
              </p>
            )}
            <p className="text-caption text-muted-foreground">
              Từ lúc bấm, tài liệu chấm và rubric khoá lại; đóng trang không dừng việc chấm — nó chạy tiếp trên máy
              chủ.
            </p>
            {start.isSuccess && (
              <Alert variant="success" role="status">
                <AlertDescription>
                  Đã xếp {start.data.queued} bài vào hàng đợi chấm (rubric phiên bản {start.data.rubricVersion})
                  {start.data.alreadyGraded > 0
                    ? `; bỏ qua ${start.data.alreadyGraded} bài đã chấm trước đó.`
                    : '.'}
                </AlertDescription>
              </Alert>
            )}
            {start.isError && (
              <Alert variant="destructive">
                <AlertDescription>{start.error.message}</AlertDescription>
              </Alert>
            )}
          </div>}
        </aside>
      </div>
    </div>
  );
}

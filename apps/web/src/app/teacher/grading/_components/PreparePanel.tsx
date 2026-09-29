'use client';

import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { NeedsBackend } from '@/components/needs-backend';
import { useExamSessionDetail } from '@/hooks/useExamSession';
import { useGradingReadiness, useRubrics, useStartGrading } from '@/hooks/useGrading';
import { useRules, useWaivers } from '@/hooks/useRules';
import { useTestBundles } from '@/hooks/useTestBundle';
import { preflightOf } from '@/lib/preflight';
import type { SessionOverviewItem } from '@/lib/api/submissions';
import { PreflightColumn } from './PreflightColumn';
import { ReferenceForm } from './ReferenceForm';
import { RubricRow } from './RubricRow';
import { TestBundleCard } from './TestBundleCard';

/**
 * Chuẩn bị chấm (spec §3.7) — khi phiên chưa có bài nào được chấm (hoặc mọi bài đều "không chấm được" và tài liệu
 * mở khoá lại). Thay `GradingReferenceDialog`, `SessionRubricCard` và nút bắt đầu cũ.
 *
 * Bắt đầu chấm KHOÁ tài liệu và trần điểm (server: `isGradingLocked`), nên nút chỉ bật khi không dòng nào của cột
 * "Trước khi bắt đầu" chặn — kể cả "còn thay đổi chưa lưu" — và khi bị chặn thì KHÔNG request nào được gửi
 * (T-UI-11). Server vẫn là bên quyết định: nếu nó từ chối, câu của nó hiện nguyên văn.
 */
export function PreparePanel({
  sessionId,
  session,
  allUngradable = false,
}: {
  sessionId: string;
  session: SessionOverviewItem;
  /** Mọi kết quả hiện có đều là "không chấm được" — màn này được mở lại để sửa thước rồi chấm lại. */
  allUngradable?: boolean;
}) {
  const rubrics = useRubrics();
  const readiness = useGradingReadiness(sessionId);
  const detail = useExamSessionDetail(sessionId);
  const rules = useRules();
  const bundles = useTestBundles(sessionId);
  const start = useStartGrading(sessionId);
  const [dirty, setDirty] = useState(false);

  const rubric = session.rubricId ? rubrics.data?.find((r) => r.id === session.rubricId) : undefined;
  const waivers = useWaivers(rubric?.id);

  const deliverables = detail.data?.requiredDeliverables ?? [];
  const hasCode = deliverables.some((d) => d.deliverableType === 'code_project');
  const bundleList = bundles.data ?? [];

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
    hasCodeDeliverable: hasCode,
    bundle: {
      pinned: Boolean(detail.data?.testBundleId),
      total: bundleList.length,
      approved: bundleList.filter((b) => b.approvedAt).length,
    },
    rules: rules.data ?? [],
    waivedKeys: (waivers.data ?? []).map((w) => w.criterionKey),
    dirty,
  });

  return (
    <div className="flex flex-col gap-6">
      {allUngradable && (
        <Alert variant="info" role="status">
          <AlertDescription>
            Mọi bài đều không chấm được. Bạn có thể sửa tài liệu chấm rồi chấm lại; nếu phiên chưa mở khoá cho việc
            đó, máy chủ sẽ nói lý do khi bạn lưu.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex flex-col gap-6">
          <RubricRow sessionId={sessionId} rubricId={session.rubricId} />
          <ReferenceForm sessionId={sessionId} readiness={readiness.data} onDirtyChange={setDirty} />

          {hasCode && (
            <section aria-label="Gói test" className="flex flex-col gap-3">
              <TestBundleCard sessionId={sessionId} pinnedBundleId={detail.data?.testBundleId ?? null} />
              <div className="flex flex-wrap gap-2 rounded-lg border border-dashed border-border p-3">
                <Button type="button" variant="outline" size="sm" disabled>
                  Sinh đáp án mẫu và gói test từ đề
                  <NeedsBackend className="ml-2" />
                </Button>
                <Button type="button" variant="outline" size="sm" disabled>
                  Sinh gói test từ đáp án của bạn
                  <NeedsBackend className="ml-2" />
                </Button>
                <Button type="button" variant="outline" size="sm" disabled>
                  Chạy thử đáp án mẫu với gói test
                  <NeedsBackend className="ml-2" />
                </Button>
              </div>
            </section>
          )}
        </div>

        <aside className="flex flex-col gap-4">
          <PreflightColumn rows={preflight.rows} />

          <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
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
              Từ lúc bấm, tài liệu chấm và trần điểm khoá lại; đóng trang không dừng việc chấm — nó chạy tiếp trên máy
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
          </div>
        </aside>
      </div>
    </div>
  );
}

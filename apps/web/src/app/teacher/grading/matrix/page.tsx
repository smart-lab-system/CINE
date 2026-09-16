'use client';

import { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useSessionOverview } from '@/hooks/useSubmissionOverview';
import {
  useBulkReview,
  useGradingProgress,
  useGradingResults,
  useRubrics,
} from '@/hooks/useGrading';
import { deltaGroupOf, type DeltaGroup } from '@/lib/grading-triage';
import type { BulkReviewOutcome, BulkRule } from '@/lib/api/grading';
import { NotBuiltYetPanel } from '../_components/NotBuiltYetPanel';
import { DeltaGroups } from './_components/DeltaGroups';
import { MatrixTable } from './_components/MatrixTable';
import { BulkActionBar } from './_components/BulkActionBar';
import { CriterionAdjustPanel } from './_components/CriterionAdjustPanel';

/**
 * Ma trận điều hành — xử lý cả nhóm bài trong một màn, thay vì mở từng bài.
 *
 * Màn Điều phối trả lời "còn bao nhiêu bài chờ tôi"; màn này trả lời "tôi
 * chốt chúng thế nào". Nó cố tình KHÔNG có chỗ sửa điểm từng tiêu chí: sửa
 * tay một bài là việc của bàn chấm chi tiết, và gộp cả hai vào đây sẽ cho ra
 * một màn hình vừa thô vừa nguy hiểm.
 */
export default function MatrixPage() {
  // `useSearchParams` cần một biên Suspense trong App Router.
  return (
    <Suspense>
      <MatrixPageContent />
    </Suspense>
  );
}

function MatrixPageContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('sessionId') ?? '';

  // Nguồn là overview, không phải `GET /exam-sessions`: nó đã mang sẵn
  // `courseId`, chấm dứt trò suy courseId bằng cách khớp TÊN môn — hai môn
  // trùng tên khác học kỳ đã khớp nhầm một lần, và hậu quả là sửa rubric của
  // môn sai.
  const overview = useSessionOverview();
  const session = (overview.data ?? []).find((item) => item.id === sessionId);

  const results = useGradingResults(sessionId || undefined);
  const rubrics = useRubrics(session?.courseId);
  const progress = useGradingProgress(sessionId || undefined);
  const bulk = useBulkReview(sessionId || undefined);

  // Rubric ĐÃ GHIM của phiên, không phải bản `isActive`. Hai lý do, mỗi lý do
  // tự nó đã đủ: thang điểm dùng để quy kiến nghị phản biện phải là thang đã
  // chấm; và id tiêu chí khác nhau giữa hai phiên bản, nên một luật lấy từ
  // bản mới sẽ áp nhầm tiêu chí.
  const rubric = rubrics.data?.find((item) => item.version === session?.rubricVersion);

  const [group, setGroup] = useState<DeltaGroup>('large');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [outcome, setOutcome] = useState<BulkReviewOutcome | undefined>();

  const all = useMemo(() => results.data ?? [], [results.data]);
  const visible = useMemo(() => {
    const maxByCriterion = new Map(
      (rubric?.criteria ?? []).map((criterion) => [criterion.id, criterion.maxPoints]),
    );
    return all.filter((row) => deltaGroupOf(row, maxByCriterion) === group);
  }, [all, rubric, group]);

  function changeGroup(next: DeltaGroup) {
    setGroup(next);
    // Bỏ chọn hết. Giữ lựa chọn qua một lần đổi nhóm sẽ áp luật cho những
    // bài không còn nhìn thấy trên màn hình.
    setSelectedIds([]);
    setOutcome(undefined);
  }

  async function apply(rule: BulkRule, resultIds: string[]) {
    const written = await bulk.mutateAsync({ resultIds, rule });
    setOutcome(written);
    setSelectedIds([]);
  }

  if (!sessionId) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Ma trận điều hành" />
        <Alert>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            Chọn một phiên thi ở màn Điều phối chấm điểm rồi quay lại đây.
            <Button variant="outline" size="sm" asChild>
              <Link href="/teacher/grading">Về màn Điều phối</Link>
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Ma trận điều hành"
        description="Xử lý cả nhóm bài cùng lúc. Mọi thao tác ở đây đều tạo một lượt duyệt của bạn — điểm do lượt chấm đề xuất không bao giờ bị ghi đè."
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href={`/teacher/grading?sessionId=${sessionId}`}>Về màn Điều phối</Link>
          </Button>
        }
      />

      <DeltaGroups results={all} rubric={rubric} active={group} onChange={changeGroup} />

      <MatrixTable
        results={visible}
        rubric={rubric}
        queueActive={progress.data?.queue.active ?? 0}
        selectedIds={selectedIds}
        onToggle={(resultId, checked) =>
          setSelectedIds((prev) =>
            checked ? [...prev, resultId] : prev.filter((id) => id !== resultId),
          )
        }
        onToggleAll={(checked) => setSelectedIds(checked ? visible.map((row) => row.id) : [])}
      />

      <CriterionAdjustPanel
        results={all}
        rubric={rubric}
        pending={bulk.isPending}
        // Áp cho MỌI bài của phiên, không chỉ nhóm đang lọc: một tiêu chí ra
        // đề không rõ thì nó không rõ với cả lớp, không riêng nhóm đang xem.
        onApply={(rule) => void apply(rule, all.map((row) => row.id))}
      />

      <NotBuiltYetPanel
        title="Gom nhóm bài trả lời giống nhau"
        missing="Cần một đường đo độ tương đồng giữa các bài — chưa có. Hiện tại bạn lọc theo mức lệch giữa hai lượt chấm ở trên."
      >
        <Button size="sm" variant="outline">
          Gom nhóm theo nội dung
        </Button>
      </NotBuiltYetPanel>

      <BulkActionBar
        selectedIds={selectedIds}
        results={all}
        outcome={outcome}
        pending={bulk.isPending}
        onApply={(rule) => void apply(rule, selectedIds)}
      />
    </div>
  );
}

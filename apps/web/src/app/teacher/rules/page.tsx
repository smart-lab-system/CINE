'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useRubrics } from '@/hooks/useGrading';
import { useRubricErrors, useRubricOverview } from '@/hooks/useRubricErrors';
import { useLibrary, useProposals } from '@/hooks/useRules';
import type { OverviewCriterion, RubricErrorItem } from '@/lib/api/rubric-errors';
import type { ProposalItem } from '@/lib/api/rules';
import { pushRecent, readRecent, writeRecent } from '@/lib/rubric-board';
import { rulesHref } from '@/lib/rules-links';
import { cn } from '@/lib/utils';
import { AddErrorDrawer } from './_components/AddErrorDrawer';
import { EditErrorDrawer } from './_components/EditErrorDrawer';
import { DANGLING_KEY, ErrorsTab } from './_components/ErrorsTab';
import { LibraryTab } from './_components/LibraryTab';
import { Onboarding } from './_components/Onboarding';
import { ProposalsTab } from './_components/ProposalsTab';
import { ReadinessBanner } from './_components/ReadinessBanner';
import { RubricDialog } from './_components/RubricDialog';
import { RubricMeta } from './_components/RubricMeta';
import { RubricSwitcher } from './_components/RubricSwitcher';
import { WaiverDialog } from './_components/WaiverDialog';

type RulesTab = 'errors' | 'proposals' | 'library';
type Drawer =
  | { kind: 'add'; criterionKey: string | null; prefill: ProposalItem | null }
  | { kind: 'edit'; ruleId: string; fromRubric: string | null }
  | null;

/**
 * Bảng lỗi theo rubric (spec 2026-10-07): chọn rubric trước, rồi thấy đúng các lỗi của rubric đó, nhóm theo tiêu
 * chí, mỗi lỗi một điểm trừ riêng. Rubric đang mở nằm trong URL (`?rubric=<tên>`) để mở thẳng và giữ khi tải lại.
 * `useSearchParams` đòi ranh giới Suspense khi build tĩnh, nên phần ruột tách ra.
 */
export default function RulesPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <RulesContent />
    </Suspense>
  );
}

function RulesContent() {
  const router = useRouter();
  const params = useSearchParams();
  const overview = useRubricOverview();
  const rubrics = useRubrics();
  const library = useLibrary();

  const [tab, setTab] = useState<RulesTab>('errors');
  const [sem, setSem] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [rubricDialog, setRubricDialog] = useState<'edit' | 'create' | null>(null);
  const [waiver, setWaiver] = useState<OverviewCriterion | null>(null);
  const [focus, setFocus] = useState<{ key: string; n: number } | null>(null);
  const [recent, setRecent] = useState<string[]>([]);

  const overviews = useMemo(() => overview.data ?? [], [overview.data]);
  const wanted = params.get('rubric');
  const found = wanted === null ? undefined : overviews.find((o) => o.rubricName === wanted);
  // Tên không còn tồn tại (đổi tên, gõ sai) → rubric đầu tiên. Nhưng vừa tạo rubric mà tổng quan còn đang tải lại thì
  // CHỜ, đừng mở nhầm rubric khác rồi nhảy (Review Focus 2).
  const waiting = wanted !== null && found === undefined && overview.isFetching;
  const current = found ?? (waiting ? undefined : overviews[0]);
  const teacherId = rubrics.data?.[0]?.teacherId ?? null;

  const errors = useRubricErrors(current?.rubricName);
  const proposals = useProposals(current?.rubricName);

  // "Gần đây": nạp từ localStorage khi biết giảng viên, đẩy rubric đang mở lên đầu, rồi ghi lại. Ba effect riêng để
  // phần cập nhật state thuần (không ghi lưu trữ trong hàm cập nhật) và để không ghi đè lịch sử bằng danh sách rỗng
  // trước khi nạp xong (`loadedFor`).
  const loadedFor = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    setRecent(readRecent(teacherId));
    loadedFor.current = teacherId;
  }, [teacherId]);
  useEffect(() => {
    const name = current?.rubricName;
    if (!name) return;
    setRecent((prev) => (prev[0] === name ? prev : pushRecent(prev, name)));
  }, [current?.rubricName, teacherId]);
  useEffect(() => {
    if (loadedFor.current === teacherId && recent.length > 0) writeRecent(teacherId, recent);
  }, [recent, teacherId]);

  const select = useCallback(
    (name: string) => {
      setTab('errors');
      router.replace(rulesHref(name), { scroll: false });
    },
    [router],
  );
  const goToCriterion = (key: string) => {
    setTab('errors');
    setFocus((prev) => ({ key, n: (prev?.n ?? 0) + 1 }));
  };

  if (overview.isLoading || waiting) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-small text-muted-foreground">Đang tải…</p>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (overview.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>Không tải được Bảng lỗi — {overview.error?.message}. Thử tải lại trang.</AlertDescription>
      </Alert>
    );
  }

  const rubricRecord = current ? rubrics.data?.find((r) => r.id === current.rubricId) : undefined;
  const errorCounts = Object.fromEntries((current?.criteria ?? []).map((c) => [c.key, c.errorCount]));
  const editRule = drawer?.kind === 'edit' ? library.data?.find((r) => r.id === drawer.ruleId) : undefined;

  const tabButton = (id: RulesTab, label: string, count: number | null, warn = false) => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === id}
      onClick={() => setTab(id)}
      className={cn(
        '-mb-px flex items-center gap-2 border-b-2 px-3.5 py-2.5 font-semibold',
        tab === id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
      )}
    >
      {label}
      {count !== null && (
        <>
          {/* Khoảng trắng thật giữa chữ và số: tên truy cập của tab là "Lỗi theo tiêu chí 2", không dính liền. */}
          {' '}
          <span
            className={cn(
              'inline-grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-caption',
              warn && count > 0 ? 'bg-warning text-foreground' : 'bg-surface-2 text-muted-foreground',
            )}
          >
            {count}
          </span>
        </>
      )}
    </button>
  );

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Bảng lỗi"
        description={
          current
            ? 'Chọn rubric, rồi ghi lại những lỗi sinh viên hay mắc ở từng tiêu chí và điểm bị trừ cho mỗi lỗi. Bài chấm sẽ trừ điểm đúng theo bảng này.'
            : 'Nơi bạn ghi lại những lỗi sinh viên hay mắc và điểm bị trừ cho từng lỗi, để bài thi được chấm đúng theo cách của bạn.'
        }
        actions={
          <Button type="button" variant="primary" disabled={!current} onClick={() => setDrawer({ kind: 'add', criterionKey: null, prefill: null })}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Thêm lỗi
          </Button>
        }
      />

      {!current ? (
        <div className="mt-6">
          <Onboarding onCreate={() => setRubricDialog('create')} />
        </div>
      ) : (
        <>
          <div className="mt-6">
            <RubricSwitcher
              overviews={overviews}
              current={current}
              recent={recent}
              sem={sem}
              onSem={setSem}
              onSelect={select}
              onNew={() => setRubricDialog('create')}
            />
          </div>
          <RubricMeta
            overview={current}
            onEdit={() => {
              // Cần bản đầy đủ của rubric (từ danh sách rubric) để sửa; chưa tải xong thì chưa mở.
              if (rubricRecord) setRubricDialog('edit');
            }}
          />
          <ReadinessBanner
            overview={current}
            overviews={overviews}
            errors={errors.data}
            onAddManually={() => setDrawer({ kind: 'add', criterionKey: null, prefill: null })}
            onGoToCriterion={goToCriterion}
            onOpenProposals={() => setTab('proposals')}
            onOpenDangling={() => goToCriterion(DANGLING_KEY)}
          />

          <div role="tablist" aria-label="Nội dung" className="mt-6 flex gap-1 border-b border-border">
            {tabButton('errors', 'Lỗi theo tiêu chí', current.errorCount)}
            {tabButton('proposals', 'Lỗi AI đề xuất', current.proposalCount, true)}
            {tabButton('library', 'Thư viện lỗi', library.data?.length ?? null)}
          </div>

          {tab === 'errors' && (
            <ErrorsTab
              overview={current}
              errors={errors.data}
              loading={errors.isLoading}
              error={errors.isError ? errors.error : null}
              focus={focus}
              onAdd={(criterionKey) => setDrawer({ kind: 'add', criterionKey, prefill: null })}
              onEdit={(item: RubricErrorItem) => setDrawer({ kind: 'edit', ruleId: item.ruleId, fromRubric: current.rubricName })}
              onWaive={setWaiver}
              onUnwaive={setWaiver}
              onOpenRubric={select}
            />
          )}
          {tab === 'proposals' && (
            <ProposalsTab
              overview={current}
              proposals={proposals.data}
              loading={proposals.isLoading}
              error={proposals.isError ? proposals.error : null}
              onAdd={(prefill) => setDrawer({ kind: 'add', criterionKey: null, prefill })}
            />
          )}
          {tab === 'library' && (
            <LibraryTab
              rules={library.data}
              loading={library.isLoading}
              error={library.isError ? library.error : null}
              overviews={overviews}
              onEdit={(rule) => setDrawer({ kind: 'edit', ruleId: rule.id, fromRubric: null })}
              onOpenRubric={select}
            />
          )}
        </>
      )}

      {drawer?.kind === 'add' && current && (
        <AddErrorDrawer overview={current} library={library.data} criterionKey={drawer.criterionKey} prefill={drawer.prefill} onClose={() => setDrawer(null)} />
      )}
      {drawer?.kind === 'edit' && (
        <EditErrorDrawer rule={editRule} loading={library.isLoading} fromRubric={drawer.fromRubric} overviews={overviews} onClose={() => setDrawer(null)} />
      )}
      <WaiverDialog target={waiver && current ? { criterion: waiver, rubricId: current.rubricId } : null} onClose={() => setWaiver(null)} />
      <RubricDialog
        open={rubricDialog !== null}
        onOpenChange={(open) => !open && setRubricDialog(null)}
        rubric={rubricDialog === 'edit' ? rubricRecord : undefined}
        existingNames={overviews.map((o) => o.rubricName)}
        errorCounts={errorCounts}
        overviews={overviews}
        onSaved={(saved) => {
          // Rubric mới chưa gắn phiên nào nên chưa thuộc học kỳ nào: bỏ lọc để nó không biến mất khỏi danh sách.
          setSem(null);
          select(saved.name);
        }}
      />
    </div>
  );
}

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/layout/page-header';
import { useGradingSessionSummaries } from '@/hooks/useGrading';
import type { SessionOverviewItem } from '@/lib/api/submissions';
import {
  DEFAULT_SORT_DIR,
  EMPTY_LIST_FILTERS,
  buildRows,
  facetOptions,
  groupRows,
  matchesFilters,
  sortRows,
  statusCounts,
  type SortKey,
} from '@/lib/session-list';
import { FilterBar } from './FilterBar';
import { BulkBar } from './BulkBar';
import { BulkDialog, type BulkRequest } from './BulkDialog';
import { SessionTable } from './SessionTable';
import { StatusTabs } from './StatusTabs';
import { useSessionListState } from './useSessionListState';

const DENSITY_KEY = 'grading.list.density';
type Density = 'cozy' | 'compact';

function useDensity(): [Density, (d: Density) => void] {
  const [density, setDensity] = useState<Density>('cozy');
  useEffect(() => {
    try {
      if (localStorage.getItem(DENSITY_KEY) === 'compact') setDensity('compact');
    } catch {
      /* không đọc được thì để Rộng */
    }
  }, []);
  return [
    density,
    (d) => {
      setDensity(d);
      try {
        localStorage.setItem(DENSITY_KEY, d);
      } catch {
        /* không nhớ được thì thôi */
      }
    },
  ];
}

const SORT_PRESETS: Array<[string, string]> = [
  ['priority:asc', 'Cần xử lý trước'],
  ['date:desc', 'Ngày thi mới nhất'],
  ['date:asc', 'Ngày thi cũ nhất'],
  ['name:asc', 'Tên A đến Z'],
  ['submitted:desc', 'Nhiều bài nộp nhất'],
];

/**
 * Chọn phiên để chấm: bảng có trạng thái chấm, tìm, lọc, sắp xếp, nhóm (spec 2026-09-29-grading-session-list).
 * Mỗi phiên vẫn là một liên kết giữ `sessionId` trên URL — trang một-route-ba-trạng-thái chọn màn theo dữ liệu.
 */
export function SessionList({ sessions, loading, error }: { sessions: SessionOverviewItem[]; loading: boolean; error: Error | null }) {
  const summaries = useGradingSessionSummaries();
  const { filters, view, setFilters, setView } = useSessionListState();
  const [density, setDensity] = useDensity();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [bulk, setBulk] = useState<BulkRequest | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  // Một mốc thời gian, làm mới khi dữ liệu đổi — bộ lọc thời gian không nên chớp mỗi lần gõ.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => setNow(Date.now()), [sessions]);

  const rows = useMemo(() => buildRows(sessions, summaries.data, now), [sessions, summaries.data, now]);
  const visible = useMemo(() => sortRows(rows.filter((r) => matchesFilters(r, filters, now)), view), [rows, filters, view, now]);
  const groups = useMemo(() => groupRows(visible, view.group), [visible, view.group]);
  // "Đang hiện" là hàng giảng viên NHÌN THẤY: hàng trong nhóm đã thu gọn vẫn được tick nhưng không tính vào thanh
  // thao tác (spec mục 5) — thao tác hàng loạt lên thứ không thấy là thao tác mù.
  const shownRows = useMemo(() => groups.flatMap((g) => (g.key !== null && collapsed.has(g.key) ? [] : g.rows)), [groups, collapsed]);
  const selectedRows = useMemo(() => shownRows.filter((r) => selected.has(r.session.id)), [shownRows, selected]);
  const options = useMemo(() => facetOptions(rows, filters, now), [rows, filters, now]);
  const counts = useMemo(() => (summaries.data ? statusCounts(rows, filters, now) : null), [rows, filters, now, summaries.data]);
  const noRubricCount = useMemo(() => rows.filter((r) => r.session.rubricId === null && matchesFilters(r, { ...filters, noRubric: false }, now)).length, [rows, filters, now]);

  // Vùng chọn chỉ giữ phiên ĐANG HIỆN: thao tác hàng loạt lên phiên đã bị bộ lọc giấu là thao tác lên thứ giảng viên không thấy.
  useEffect(() => {
    setSelected((prev) => {
      const shown = new Set(visible.map((r) => r.session.id));
      const next = new Set([...prev].filter((id) => shown.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [visible]);

  // "/" nhảy vào ô tìm, như các trang danh sách khác — trừ khi đang gõ ở đâu đó.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName ?? '').toUpperCase();
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const toggleRows = (ids: string[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
      return next;
    });
  const toggleGroup = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const sortBy = (key: SortKey) =>
    setView({ ...view, sortKey: key, sortDir: view.sortKey === key ? (view.sortDir === 'asc' ? 'desc' : 'asc') : DEFAULT_SORT_DIR[key] });

  const presetValue = `${view.sortKey}:${view.sortDir}`;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Chấm điểm" description="Chọn một phiên thi để chuẩn bị, chấm và chốt điểm. Hệ thống chỉ làm việc với bài đã thu." />

      {error && (
        <Alert variant="destructive">
          <AlertDescription>Không tải được danh sách phiên thi — {error.message}.</AlertDescription>
        </Alert>
      )}
      {summaries.isError && (
        <Alert variant="destructive">
          <AlertDescription>
            Không tải được trạng thái chấm của các phiên — {summaries.error?.message}. Bảng vẫn tìm, lọc và mở phiên được; tab trạng thái,
            thanh tiến độ và thao tác hàng loạt tạm ẩn.
          </AlertDescription>
        </Alert>
      )}

      {loading && <Skeleton className="h-40 w-full" />}

      {!loading && !error && rows.length === 0 && (
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-small text-muted-foreground">
          Chưa có phiên thi nào thu được bài. Chấm điểm chỉ làm việc với bài đã thu.
        </p>
      )}

      {!loading && rows.length > 0 && (
        <>
          <StatusTabs counts={counts} value={filters.status} onChange={(status) => setFilters({ ...filters, status })} />

          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <FilterBar filters={filters} options={options} noRubricCount={noRubricCount} onChange={setFilters} searchRef={searchRef} />
            </div>
            <div className="flex flex-wrap items-center gap-3 text-caption text-muted-foreground">
              <label className="flex items-center gap-2">
                Nhóm theo
                <select
                  value={view.group}
                  onChange={(e) => setView({ ...view, group: e.target.value as typeof view.group })}
                  className="h-9 rounded-md border border-input bg-surface px-2 text-small font-medium text-foreground"
                >
                  <option value="none">Không nhóm</option>
                  <option value="class">Lớp</option>
                  <option value="semester">Học kỳ</option>
                </select>
              </label>
              <label className="flex items-center gap-2">
                Sắp xếp
                <select
                  value={SORT_PRESETS.some(([v]) => v === presetValue) ? presetValue : 'custom'}
                  onChange={(e) => {
                    if (e.target.value === 'custom') return;
                    const [sortKey, sortDir] = e.target.value.split(':') as [SortKey, 'asc' | 'desc'];
                    setView({ ...view, sortKey, sortDir });
                  }}
                  className="h-9 rounded-md border border-input bg-surface px-2 text-small font-medium text-foreground"
                >
                  {SORT_PRESETS.map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                  <option value="custom" hidden>Theo cột đã chọn</option>
                </select>
              </label>
              <div role="group" aria-label="Mật độ hàng" className="inline-flex overflow-hidden rounded-md border border-border bg-surface">
                {(['cozy', 'compact'] as Density[]).map((d) => (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={density === d}
                    onClick={() => setDensity(d)}
                    className={density === d ? 'h-9 bg-primary-subtle px-3 text-small font-semibold text-primary' : 'h-9 px-3 text-small font-semibold text-muted-foreground hover:text-foreground'}
                  >
                    {d === 'cozy' ? 'Rộng' : 'Gọn'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <p role="status" aria-live="polite" className="text-caption text-muted-foreground">
            Hiển thị {visible.length} trong {rows.length} phiên
          </p>

          {visible.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-surface px-4 py-12 text-center">
              <strong className="text-body">Không có phiên nào khớp</strong>
              <p className="max-w-[46ch] text-small text-muted-foreground">
                {/* Không chỉ vào một tab không được vẽ: chưa có tóm tắt thì không có tab. */}
                {counts !== null ? 'Thử bỏ bớt bộ lọc, chọn tab “Tất cả”, hoặc tìm bằng tên lớp hay phòng.' : 'Thử bỏ bớt bộ lọc, hoặc tìm bằng tên lớp hay phòng.'}
              </p>
              <Button type="button" variant="outline" size="sm" onClick={() => setFilters(EMPTY_LIST_FILTERS)}>
                Xoá bộ lọc
              </Button>
            </div>
          ) : (
            <SessionTable
              groups={groups}
              view={view}
              onSort={sortBy}
              selected={selected}
              onToggleRows={toggleRows}
              collapsed={collapsed}
              onToggleGroup={toggleGroup}
              onStart={(row) => setBulk({ kind: 'start', rows: [row], skipped: 0 })}
              density={density}
              now={now}
            />
          )}

          {/* `counts !== null` cũng là "đã biết trạng thái": chưa biết thì không có thao tác hàng loạt. */}
          {selectedRows.length > 0 && counts !== null && (
            <BulkBar selected={selectedRows} onRequest={setBulk} onClear={() => setSelected(new Set())} />
          )}
        </>
      )}

      {bulk && (
        <BulkDialog
          request={bulk}
          onClose={() => setBulk(null)}
          onFinished={() => {
            setBulk(null);
            setSelected(new Set());
          }}
        />
      )}
    </div>
  );
}

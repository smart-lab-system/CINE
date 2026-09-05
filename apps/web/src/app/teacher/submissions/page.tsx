'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Inbox } from 'lucide-react';
import {
  useArchiveSession,
  useCloseAttention,
  useSessionOverview,
  useTeacherSubmissions,
} from '@/hooks/useSubmissionOverview';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import {
  PHASE_LABELS,
  PHASE_VARIANTS,
  getAttentionReasons,
  getSessionPhase,
  groupByCourseClass,
} from '@/lib/submission-attention';
import {
  EMPTY_FILTERS,
  applyFilters,
  buildFacets,
  detectRoomFailure,
  pickDefaultSemester,
  type FilterState,
} from '@/lib/submission-filters';
import type { SessionOverviewItem } from '@/lib/api/submissions';
import { EXAM_TYPE_LABELS } from '@/lib/exam-session-display';
import { EmptyState } from '@/components/layout/empty-state';
import { PageHeader } from '@/components/layout/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { FilterRail } from './_components/FilterRail';
import { RoomFailureBanner } from './_components/RoomFailureBanner';
import { SessionTable } from './_components/SessionTable';

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Dòng kết quả tìm kiếm — KHÔNG dùng lại bảng triage.
 *
 * Search trả lời một câu hỏi khác: "bài của sinh viên này nằm ở phiên nào?".
 * Câu trả lời là danh tính phiên + mốc thời gian, nên dòng ở đây cố ý gọn và
 * không mang cột Tình trạng: mức độ là chuyện của chế độ duyệt, và người đang
 * tra một sinh viên sẽ bấm vào phiên để xem tiếp.
 */
function SearchResultRow({
  item,
  now,
  studentHint,
}: {
  item: SessionOverviewItem;
  now: number;
  studentHint: string;
}) {
  const phase = getSessionPhase(item, now);

  return (
    <Link
      href={`/teacher/submissions/${item.id}?student=${encodeURIComponent(studentHint)}`}
      className="flex flex-col gap-2 rounded-lg border border-border bg-surface-1 px-4 py-3 transition-colors hover:bg-surface-2/60"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-foreground">{item.name}</span>
        <Badge variant="outline">{EXAM_TYPE_LABELS[item.examType] ?? item.examType}</Badge>
        <Badge variant={PHASE_VARIANTS[phase]}>{PHASE_LABELS[phase]}</Badge>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-small text-muted-foreground">
        <span className="text-foreground">
          {item.courseName}
          {item.className ? ` — ${item.className}` : ''}
        </span>
        <span>{formatDateTime(item.startTime)}</span>
        <span>{item.roomName}</span>
      </div>

      <span className="text-caption text-muted-foreground">
        Sinh viên {studentHint} trong phiên này
      </span>
    </Link>
  );
}

/**
 * "Quản lý bài thu" — cột lọc bên trái, một bảng bên phải.
 *
 * Bố cục hai cột thay cho hai section chồng dọc của bản trước: dải "Cần chú ý"
 * cũ lặp lại đúng những phiên nằm trong nhóm bên dưới, nên giảng viên đọc
 * thành "thấy cùng một phiên hai lần", và trang thì dài gấp đôi mà không thêm
 * thông tin. Xem
 * docs/superpowers/specs/2026-09-05-submissions-triage-layout-design.md.
 */
export default function SubmissionsPage() {
  const { data, isLoading, error, refetch } = useSessionOverview();
  // Chốt `now` một lần mỗi render thay vì gọi Date.now() rải rác: hai dòng
  // cạnh nhau phải được phân loại theo cùng một mốc thời gian.
  const now = Date.now();

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const trimmedSearch = debouncedSearch.trim();
  const isSearching = trimmedSearch !== '';

  // pageSize 200: đủ để gom hết bài của MỘT sinh viên qua ~8 kỳ/năm (spec
  // §1.2) trong một trang, nên luồng này không cần phân trang riêng.
  const searchResults = useTeacherSubmissions(
    { page: 1, pageSize: 200, search: trimmedSearch || undefined },
    isSearching,
  );

  /**
   * Phiên có xuất hiện trong kết quả search, kèm MSSV khớp — gom theo
   * examSessionId. Endpoint /submissions trả về dòng-per-file, còn câu trả
   * lời GV cần là "nằm ở phiên nào" (spec §3.4).
   */
  const searchGroups = useMemo(() => {
    if (!isSearching) return [];
    const byId = new Map<string, { item: SessionOverviewItem; mssv: string }>();
    for (const row of searchResults.data?.items ?? []) {
      const item = (data ?? []).find((session) => session.id === row.examSessionId);
      if (item && !byId.has(item.id)) {
        byId.set(item.id, { item, mssv: row.studentMssv });
      }
    }
    return [...byId.values()].sort(
      (a, b) => new Date(b.item.startTime).getTime() - new Date(a.item.startTime).getTime(),
    );
  }, [isSearching, searchResults.data, data]);

  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const items = useMemo(() => data ?? [], [data]);

  // Học kỳ mặc định chỉ chốt MỘT LẦN, khi dữ liệu về lần đầu — nếu tính lại
  // mỗi render thì lựa chọn của giảng viên sẽ bị ghi đè ngay lập tức.
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current || items.length === 0) return;
    seededRef.current = true;
    setFilters((prev) => ({ ...prev, semesterId: pickDefaultSemester(items, Date.now()) }));
  }, [items]);

  const facets = useMemo(() => buildFacets(items, filters, now), [items, filters, now]);
  const visible = useMemo(() => applyFilters(items, filters, now), [items, filters, now]);
  const groups = useMemo(() => groupByCourseClass(visible, now), [visible, now]);
  const roomFailure = useMemo(() => detectRoomFailure(visible, now), [visible, now]);
  const attentionTotal = useMemo(
    () => visible.filter((i) => getAttentionReasons(i, now).length > 0).length,
    [visible, now],
  );

  const archive = useArchiveSession();
  const close = useCloseAttention();

  // Dùng chung cho cả nhánh loading và nhánh chính — ô search phải luôn có
  // mặt, kể cả khi danh sách phiên (browse) còn đang tải.
  const header = (
    <>
      <PageHeader
        title="Quản lý bài thu"
        description="Phiên thi nào đã thu đủ bài, phiên nào còn thiếu — và tìm bài của một sinh viên qua tất cả các kỳ."
      />
      <Input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Tìm sinh viên theo MSSV hoặc tên..."
        aria-label="Tìm sinh viên theo MSSV hoặc tên"
        className="sm:max-w-sm"
      />
    </>
  );

  if (isLoading) {
    return (
      <div className="flex flex-col gap-8">
        {header}
        <Card>
          <CardContent
            className="flex flex-col gap-3 p-6"
            aria-label="Đang tải danh sách phiên thi"
          >
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {header}

      {error ? (
        <Alert variant="destructive">
          <AlertDescription className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>Không tải được danh sách phiên thi. Hãy thử lại.</span>
            <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>
              Thử lại
            </Button>
          </AlertDescription>
        </Alert>
      ) : isSearching ? (
        searchResults.isLoading ? (
          <Card>
            <CardContent className="flex flex-col gap-3 p-6">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </CardContent>
          </Card>
        ) : searchGroups.length === 0 ? (
          <Card>
            <EmptyState
              icon={Inbox}
              title={`Không tìm thấy bài nộp nào khớp «${trimmedSearch}»`}
              // Honest về giới hạn: endpoint /submissions chỉ tìm được SV đã
              // nộp ÍT NHẤT một file — SV chưa nộp gì thì search này không
              // thấy. Nói thẳng điều đó thay vì một câu "không tìm thấy" trơ
              // trọi — im lặng bỏ sót đúng ca GV đang cần tra ("em có nộp mà
              // thầy!") còn tệ hơn một search thừa nhận điểm mù của nó.
              description="Sinh viên chưa nộp gì sẽ không xuất hiện ở đây — hãy mở phiên thi tương ứng để xem danh sách vắng."
              action={
                <Button type="button" variant="outline" onClick={() => setSearch('')}>
                  Xoá tìm kiếm
                </Button>
              }
            />
          </Card>
        ) : (
          <div data-animate className="flex flex-col gap-2">
            {searchGroups.map(({ item, mssv }) => (
              <SearchResultRow key={item.id} item={item} now={now} studentHint={mssv} />
            ))}
          </div>
        )
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon={Inbox}
            title="Chưa có phiên thi nào"
            description="Bài nộp sẽ xuất hiện ở đây sau khi bạn tạo phiên thi và sinh viên bắt đầu nộp bài."
          />
        </Card>
      ) : (
        <div data-animate className="flex flex-col gap-4 lg:flex-row lg:items-start">
          <div className="lg:w-[205px] lg:shrink-0">
            <FilterRail
              facets={facets}
              filters={filters}
              onChange={setFilters}
              attentionTotal={attentionTotal}
            />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            {roomFailure && <RoomFailureBanner {...roomFailure} />}
            {groups.length === 0 ? (
              <Card>
                <EmptyState
                  icon={Inbox}
                  title="Không có phiên thi nào khớp bộ lọc"
                  description="Thử bỏ bớt bộ lọc ở cột bên trái, hoặc đổi sang học kỳ khác."
                />
              </Card>
            ) : (
              <SessionTable
                groups={groups}
                now={now}
                onArchive={(id, on) => archive.mutate({ id, on })}
                onCloseAttention={(id, on) => close.mutate({ id, on })}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

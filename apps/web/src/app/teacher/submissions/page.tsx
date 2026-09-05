'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ChevronDown, ChevronRight, Inbox } from 'lucide-react';
import { useSessionOverview, useTeacherSubmissions } from '@/hooks/useSubmissionOverview';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import {
  PHASE_LABELS,
  PHASE_VARIANTS,
  compareSessions,
  getAttentionReasons,
  getSessionPhase,
  groupByCourseClass,
  hasRatio,
} from '@/lib/submission-attention';
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
 * Một phiên. `showContext` bật khi dòng nằm ở dải ghim — lúc đó nó đã bị tách
 * khỏi nhóm môn, nên phải tự mang môn/lớp theo, không thì GV không biết nó
 * thuộc đâu (spec §4.4).
 */
function SessionRow({
  item,
  now,
  showContext,
  studentHint,
}: {
  item: SessionOverviewItem;
  now: number;
  showContext: boolean;
  studentHint?: string;
}) {
  const phase = getSessionPhase(item, now);
  const reasons = getAttentionReasons(item, now);
  const href = studentHint
    ? `/teacher/submissions/${item.id}?student=${encodeURIComponent(studentHint)}`
    : `/teacher/submissions/${item.id}`;

  return (
    <Link
      href={href}
      className="flex flex-col gap-2 rounded-lg border border-border bg-surface-1 px-4 py-3 transition-colors hover:bg-surface-2/60"
    >
      <div className="flex flex-wrap items-center gap-2">
        {reasons.length > 0 && (
          <AlertTriangle className="h-4 w-4 shrink-0 text-danger-strong" aria-hidden="true" />
        )}
        <span className="font-medium text-foreground">{item.name}</span>
        <Badge variant="outline">{EXAM_TYPE_LABELS[item.examType] ?? item.examType}</Badge>
        <Badge variant={PHASE_VARIANTS[phase]}>{PHASE_LABELS[phase]}</Badge>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-small text-muted-foreground">
        {showContext && (
          <span className="text-foreground">
            {item.courseName}
            {item.className ? ` — ${item.className}` : ''}
          </span>
        )}
        <span>{formatDateTime(item.startTime)}</span>
        <span>{item.roomName}</span>
        {hasRatio(item) ? (
          <span className="font-medium text-foreground">
            {item.fullySubmittedCount}/{item.expectedCount} đã nộp đủ
          </span>
        ) : (
          <>
            {/*
              !hasRatio(item) chỉ xảy ra ở đúng 2 trường hợp, và expectedCount
              có nghĩa khác nhau ở mỗi trường hợp — không được dùng chung một
              câu cho cả hai (đó chính là lỗi bị bắt ở review):
                - !rosterKnown: không có roster, expectedCount đếm SINH VIÊN
                  đã nộp gì đó, không phải BÀI -> phải nói rõ là sinh viên.
                - rosterKnown && requiredDeliverableCount === 0: expectedCount
                  là sĩ số lớp, không phải số đã nộp -> không có gì trung
                  thực để đếm, nên KHÔNG hiện số (spec §3.3: hiện "đã thu 40
                  bài" cho phiên chưa từng yêu cầu gì là báo động giả kiểu
                  ngược).
            */}
            {!item.rosterKnown && (
              <span className="font-medium text-foreground">
                đã thu bài của {item.expectedCount} sinh viên
              </span>
            )}
            <span className="text-caption">
              {item.rosterKnown ? 'phiên chưa khai file bắt buộc' : 'phiên không gắn lớp'}
            </span>
          </>
        )}
      </div>

      {studentHint && (
        <span className="text-caption text-muted-foreground">
          Sinh viên {studentHint} trong phiên này
        </span>
      )}

      {reasons.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {reasons.map((reason) => (
            <Badge key={reason.kind} variant={reason.variant}>
              {reason.label}
            </Badge>
          ))}
        </div>
      )}
    </Link>
  );
}

/**
 * "Quản lý bài thu" — trả lời "phiên nào cần tôi chú ý ngay bây giờ?" trước,
 * rồi mới tới việc duyệt theo môn. Xem
 * docs/superpowers/specs/2026-09-03-submissions-rollup-page-design.md.
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

  const attention = useMemo(
    () =>
      (data ?? [])
        .filter((item) => getAttentionReasons(item, now).length > 0)
        .sort((a, b) => compareSessions(a, b, now)),
    [data, now],
  );
  const groups = useMemo(() => groupByCourseClass(data ?? [], now), [data, now]);

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
              <SessionRow key={item.id} item={item} now={now} showContext studentHint={mssv} />
            ))}
          </div>
        )
      ) : (data ?? []).length === 0 ? (
        <Card>
          <EmptyState
            icon={Inbox}
            title="Chưa có phiên thi nào"
            description="Bài nộp sẽ xuất hiện ở đây sau khi bạn tạo phiên thi và sinh viên bắt đầu nộp bài."
          />
        </Card>
      ) : (
        <div data-animate className="flex flex-col gap-8">
          {attention.length > 0 && (
            <section
              aria-label="Cần chú ý"
              className="flex flex-col gap-3 rounded-xl border border-danger-subtle bg-danger-subtle/30 p-4"
            >
              <h2 className="text-h3 text-foreground">Cần chú ý</h2>
              <p className="text-small text-muted-foreground">
                Phiên đã kết thúc mà chưa thu đủ bài. Xử lý những phiên này trước.
              </p>
              <div className="flex flex-col gap-2">
                {attention.map((item) => (
                  <SessionRow key={item.id} item={item} now={now} showContext />
                ))}
              </div>
            </section>
          )}

          <div className="flex flex-col gap-4">
            {groups.map((group) => (
              <SessionGroupCard key={group.key} group={group} now={now} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SessionGroupCard({
  group,
  now,
}: {
  group: ReturnType<typeof groupByCourseClass>[number];
  now: number;
}) {
  // Nhóm không có cảnh báo thì thu gọn — nó không cần giành chú ý (§4.4).
  const [open, setOpen] = useState(group.attentionCount > 0);
  const heading = `${group.courseName}${group.className ? ` — ${group.className}` : ' — không gắn lớp'}`;

  return (
    <section aria-label={heading} className="rounded-xl border border-border bg-surface-1">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        )}
        <span className="font-medium text-foreground">{heading}</span>
        <span className="text-small text-muted-foreground">
          · {group.sessions.length} phiên
          {group.attentionCount > 0 ? ` · ${group.attentionCount} cần chú ý` : ''}
        </span>
      </button>

      {open && (
        <div className="flex flex-col gap-2 border-t border-border p-4">
          {group.sessions.map((item) => (
            <SessionRow key={item.id} item={item} now={now} showContext={false} />
          ))}
        </div>
      )}
    </section>
  );
}

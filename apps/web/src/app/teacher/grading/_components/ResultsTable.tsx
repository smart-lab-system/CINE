'use client';

import Link from 'next/link';
import { EyeOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { StatusPill } from '@/components/status-pill';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { NARROW_LIST_QUERY, useMediaQuery } from '@/hooks/useMediaQuery';
import { STATE_LABEL, STATE_ORDER, countStates, sortByState, stateOf, type SessionState } from '@/lib/session-triage';
import type { GradingResult } from '@/lib/api/grading';
import { ResultCards } from './ResultCards';
import { resultRowView } from './result-row-view';

export type ResultsFilter = SessionState | 'all';

/**
 * Danh sách bài của phiên (spec §3.3): sinh viên (MSSV là link mở hồ sơ) · trạng thái · điểm (kèm *tạm tính* /
 * *chưa có điểm*) · số lỗi đã trừ và chờ giá · **vì sao cần bạn** (một câu). Mặc định sắp cần-bạn-trước.
 *
 * Lý do và số lỗi đọc từ `result.triage` mà danh sách đã mang sẵn (G1 §2) - không còn một request hồ sơ cho mỗi
 * bài. Bài chưa có `triage` thì KHÔNG đoán: chỉ đường mở hồ sơ.
 *
 * Dưới 820px mỗi bài là một thẻ (`ResultCards`), từ 820px là bảng; cả hai đọc cùng `resultRowView`. Khi từ hai bài
 * trở lên đang hiện đều chấm bằng cách đọc mã, câu đó nói MỘT lần ở đầu danh sách thay vì lặp ở từng hàng.
 */
export function ResultsTable({
  sessionId,
  sessionClassId,
  results,
  filter,
  onFilterChange,
}: {
  sessionId: string;
  sessionClassId: string | null;
  results: GradingResult[];
  filter: ResultsFilter;
  onFilterChange: (filter: ResultsFilter) => void;
}) {
  const narrow = useMediaQuery(NARROW_LIST_QUERY);
  const counts = countStates(results);
  const shown = sortByState(filter === 'all' ? results : results.filter((r) => stateOf(r) === filter));
  const views = shown.map((r) => resultRowView(r, { sessionId, sessionClassId }));
  const sharedReadingCode = views.length >= 2 && views.every((v) => v.method === 'reading-code');
  const showMethodChip = !sharedReadingCode;

  return (
    <section aria-label="Danh sách bài" className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <FilterChip pressed={filter === 'all'} onClick={() => onFilterChange('all')}>
          Tất cả · {results.length}
        </FilterChip>
        {STATE_ORDER.filter((s) => counts[s] > 0).map((s) => (
          <FilterChip key={s} pressed={filter === s} onClick={() => onFilterChange(s)}>
            {STATE_LABEL[s]} · {counts[s]}
          </FilterChip>
        ))}
      </div>

      {sharedReadingCode && (
        <p className="text-caption text-muted-foreground">Mọi bài trong danh sách này được chấm bằng cách đọc mã, không chạy thử.</p>
      )}

      {views.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-small text-muted-foreground">
          Không có bài nào ở nhóm này. Chọn &quot;Tất cả&quot; để xem toàn bộ phiên.
        </p>
      ) : narrow ? (
        <ResultCards views={views} showMethodChip={showMethodChip} />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sinh viên</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead className="text-right">Điểm</TableHead>
                <TableHead>Lỗi</TableHead>
                <TableHead>Vì sao cần bạn</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {views.map((v) => (
                <TableRow key={v.id}>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={v.href} className="font-medium text-accent-strong hover:underline">
                        {v.mssv}
                      </Link>
                      <span>{v.name}</span>
                      {v.makeup && <Badge variant="info">{v.makeup}</Badge>}
                      {v.method === 'reading-code' ? (
                        showMethodChip && <Badge variant="info">Chấm bằng đọc mã, không chạy</Badge>
                      ) : (
                        v.method === 'essay' && <Badge variant="outline">Bài tự luận</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusPill status={v.status} ungradableReason={v.ungradableReason} pipeline={v.pipeline} />
                  </TableCell>
                  <TableCell data-cell="score" className="text-right">
                    {v.auditHidden && <EyeOff className="mr-1 inline h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />}
                    <span className="font-semibold tabular-nums">{v.score.text}</span>{' '}
                    <span className="text-caption text-muted-foreground">{v.score.tag}</span>
                  </TableCell>
                  <TableCell className="text-small tabular-nums">{v.errors}</TableCell>
                  <TableCell className="max-w-[360px] text-small text-muted-foreground">{v.reason}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}

function FilterChip({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-small ${
        pressed ? 'border-accent bg-accent-subtle font-semibold text-accent-strong' : 'border-border bg-surface hover:bg-surface-2'
      }`}
    >
      {children}
    </button>
  );
}

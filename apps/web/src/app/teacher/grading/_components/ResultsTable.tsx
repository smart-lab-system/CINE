'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { StatusPill } from '@/components/status-pill';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { isMakeupSubmission } from '@/lib/grading-triage';
import {
  STATE_LABEL,
  STATE_ORDER,
  countStates,
  errorCounts,
  isReadingCode,
  reasonOf,
  scoreCell,
  sortByState,
  stateOf,
  type SessionState,
} from '@/lib/session-triage';
import type { GradingResult } from '@/lib/api/grading';

export type ResultsFilter = SessionState | 'all';

function errorsText(triage: GradingResult['triage']): string {
  const counts = errorCounts(triage);
  if (counts === null) return '—';
  const parts: string[] = [];
  if (counts.counted > 0) parts.push(`${counts.counted} đã trừ`);
  if (counts.unpriced > 0) parts.push(`${counts.unpriced} chờ giá`);
  return parts.length > 0 ? parts.join(' · ') : 'Không lỗi nào';
}

/**
 * Danh sách bài của phiên (spec §3.3): sinh viên (MSSV là link mở hồ sơ) · trạng thái · điểm (kèm *tạm tính* /
 * *chưa có điểm*) · số lỗi đã trừ và chờ giá · **vì sao cần bạn** (một câu). Mặc định sắp cần-bạn-trước.
 *
 * Lý do và số lỗi đọc từ `result.triage` mà danh sách đã mang sẵn (G1 §2) — không còn một request hồ sơ cho mỗi
 * bài. Bài chưa có `triage` thì KHÔNG đoán: chỉ đường mở hồ sơ.
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
  const counts = countStates(results);
  const shown = sortByState(filter === 'all' ? results : results.filter((r) => stateOf(r) === filter));

  const reasonCell = (r: GradingResult) => {
    const reason = reasonOf(r);
    if (reason !== null) return reason;
    return stateOf(r) === 'needsYou' ? 'Mở hồ sơ để xem lý do.' : '—';
  };

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

      {shown.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-small text-muted-foreground">
          Không có bài nào ở nhóm này. Chọn &quot;Tất cả&quot; để xem toàn bộ phiên.
        </p>
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
              {shown.map((r) => {
                const state = stateOf(r);
                const score = scoreCell(r, state);
                return (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/teacher/grading/${r.id}?sessionId=${sessionId}`}
                          className="font-medium text-accent-strong hover:underline"
                        >
                          {r.studentMssv}
                        </Link>
                        <span>{r.studentName}</span>
                        {isMakeupSubmission(r.homeClassId, sessionClassId) && (
                          <Badge variant="info">Thi bù — {r.homeClassName ?? r.homeClassId}</Badge>
                        )}
                        {isReadingCode(r) ? (
                          <Badge variant="info">Chấm bằng đọc mã, không chạy</Badge>
                        ) : (
                          r.pipeline === 'one_shot' && <Badge variant="outline">Bài tự luận</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusPill status={r.status} ungradableReason={r.ungradableReason} pipeline={r.pipeline} />
                    </TableCell>
                    <TableCell data-cell="score" className="text-right">
                      <span className="font-semibold tabular-nums">{score.text}</span>{' '}
                      <span className="text-caption text-muted-foreground">{score.tag}</span>
                    </TableCell>
                    <TableCell className="text-small tabular-nums">{errorsText(r.triage)}</TableCell>
                    <TableCell className="max-w-[360px] text-small text-muted-foreground">{reasonCell(r)}</TableCell>
                  </TableRow>
                );
              })}
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

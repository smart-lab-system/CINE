/**
 * Mirror API `apps/api/src/master-data/resolve-semester.ts`
 * (spec 2026-11-18 course hub) - giữ đồng bộ thủ công.
 */

export type SemesterStatusHint = 'planned' | 'active' | 'closed' | string;

export interface SemesterRange {
  id: string;
  startDate: string;
  endDate: string;
  status?: SemesterStatusHint;
}

const VN_TZ = 'Asia/Ho_Chi_Minh';

export function toVnCalendarDate(input: Date | string): string {
  const d = typeof input === 'string' ? new Date(input) : input;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: VN_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function parseYmd(ymd: string): number {
  const [y, m, day] = ymd.slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, day);
}

function inRange(ymd: string, start: string, end: string): boolean {
  const t = parseYmd(ymd);
  return t >= parseYmd(start) && t <= parseYmd(end);
}

function distanceDays(ymd: string, start: string, end: string): number {
  const t = parseYmd(ymd);
  const a = parseYmd(start);
  const b = parseYmd(end);
  if (t >= a && t <= b) return 0;
  if (t < a) return Math.round((a - t) / 86_400_000);
  return Math.round((t - b) / 86_400_000);
}

function statusRank(status: SemesterStatusHint | undefined): number {
  if (status === 'active') return 0;
  if (status === 'planned') return 1;
  return 2;
}

export function resolveSemester(
  createdAt: Date | string,
  updatedAt: Date | string,
  semesters: readonly SemesterRange[],
): SemesterRange | null {
  if (semesters.length === 0) return null;

  const created = toVnCalendarDate(createdAt);
  const updated = toVnCalendarDate(updatedAt);

  const byCreated = semesters.find((s) => inRange(created, s.startDate, s.endDate));
  if (byCreated) return byCreated;

  const byUpdated = semesters.find((s) => inRange(updated, s.startDate, s.endDate));
  if (byUpdated) return byUpdated;

  const sorted = [...semesters].sort((a, b) => {
    const da = distanceDays(created, a.startDate, a.endDate);
    const db = distanceDays(created, b.startDate, b.endDate);
    if (da !== db) return da - db;
    const startDiff =
      Math.abs(parseYmd(created) - parseYmd(a.startDate)) -
      Math.abs(parseYmd(created) - parseYmd(b.startDate));
    if (startDiff !== 0) return startDiff;
    return statusRank(a.status) - statusRank(b.status);
  });

  return sorted[0] ?? null;
}

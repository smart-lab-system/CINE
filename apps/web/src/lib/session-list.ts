import type { GradingSessionSummary } from './api/grading';
import type { SessionOverviewItem } from './api/submissions';
import { EXAM_TYPE_LABELS } from './exam-session-display';
import { STATE_ORDER, countsFromSummary, type SessionState } from './session-triage';

/**
 * Logic thuần của danh sách phiên chấm (spec 2026-09-29-grading-session-list-design.md).
 * Không chạm DOM, mạng hay đồng hồ: `now` luôn được truyền vào, để test không phụ thuộc ngày chạy.
 */

const DAY_MS = 86_400_000;
/** Phiên cần xem / sẵn sàng chốt mà thi đã quá số ngày này thì nói ra. */
export const STALE_AFTER_DAYS = 14;

/* ------------------------------------------------------------------ trạng thái */

export type ListStatus = 'attention' | 'ready' | 'todo' | 'running' | 'done';

/** Việc cần làm trước, việc xong sau. Cũng là thứ tự tab. */
export const LIST_STATUS_ORDER: ListStatus[] = ['attention', 'ready', 'todo', 'running', 'done'];

export const LIST_STATUS_LABEL: Record<ListStatus, string> = {
  attention: 'Cần bạn xem',
  ready: 'Sẵn sàng chốt',
  todo: 'Chưa chấm',
  running: 'Đang chấm',
  done: 'Đã chốt',
};

/** Hai điều kiện bắt đầu chấm mà DANH SÁCH biết được; phần còn lại của `preflightOf` chỉ hiện ở màn chuẩn bị. */
export type Blocker = 'no-rubric' | 'no-question' | 'in-progress';

/**
 * Giờ làm bài chưa hết. So với `endTime`, KHÔNG đọc `status`: status của phiên không đáng tin (hầu hết phiên
 * sinh ra là 'active', memory cine-session-status-is-always-active) — thời gian mới là ranh giới. Ngày
 * không đọc được thì coi như đã hết: chặn nhầm một phiên đã xong đắt hơn cho bắt đầu sớm một phiên hỏng ngày.
 */
function examStillRunning(session: SessionOverviewItem, now: number): boolean {
  const end = Date.parse(session.endTime);
  return Number.isFinite(end) && end > now;
}

export interface SessionRow {
  session: SessionOverviewItem;
  /** `null` = chưa biết (bảng tóm tắt chưa tải hoặc lỗi). Mọi thứ không cần trạng thái vẫn chạy. */
  status: ListStatus | null;
  counts: Record<SessionState, number>;
  /** Số bài đã có bản ghi chấm. */
  graded: number;
  /** Chỉ khác null khi `status === 'todo'`. */
  blocker: Blocker | null;
}

const zeroCounts = (): Record<SessionState, number> =>
  Object.fromEntries(STATE_ORDER.map((s) => [s, 0])) as Record<SessionState, number>;

/**
 * Năm giá trị từ bảy con số. `attention` thắng `running`: bài cần xem đã mở được khi lượt chấm còn chạy
 * (trang phiên hiện bảng trong lúc chạy), nên giấu nó sau nhãn "Đang chấm" là giấu việc đang chờ.
 */
export function listStatusOf(counts: Record<SessionState, number>): ListStatus {
  const total = STATE_ORDER.reduce((sum, s) => sum + counts[s], 0);
  if (total === 0) return 'todo';
  if (counts.needsYou + counts.audit + counts.ungradable > 0) return 'attention';
  if (counts.grading > 0) return 'running';
  if (counts.finalised === total) return 'done';
  return 'ready';
}

/** Bài đã thu — cùng phép đếm với `submittedLabel`. */
export function submittedCount(session: SessionOverviewItem): number {
  return session.fullySubmittedCount + session.partialCount;
}

/**
 * Chỉ phiên CÓ bài đã thu (như `SessionPicker` cũ) — nhưng KHÔNG lọc theo rubric hay lưu trữ: phiên thiếu
 * rubric phải hiện ra kèm dấu, vì bài thi thật của sinh viên nằm trong đó.
 */
export function buildRows(
  sessions: SessionOverviewItem[],
  summaries: GradingSessionSummary[] | undefined,
  now: number = Date.now(),
): SessionRow[] {
  const byId = summaries ? new Map(summaries.map((s) => [s.examSessionId, s])) : null;
  return sessions
    .filter((s) => submittedCount(s) > 0)
    .map((session): SessionRow => {
      if (!byId) return { session, status: null, counts: zeroCounts(), graded: 0, blocker: null };
      const summary = byId.get(session.id);
      const counts = summary ? countsFromSummary(summary) : zeroCounts();
      const graded = STATE_ORDER.reduce((sum, s) => sum + counts[s], 0);
      const status = listStatusOf(counts);
      let blocker: Blocker | null = null;
      if (status === 'todo') {
        if (session.rubricId === null) blocker = 'no-rubric';
        // Thiếu cả tóm tắt của phiên → không biết đã có đề bài chưa → coi như chưa (an toàn: không cho bắt đầu).
        else if (!summary?.hasQuestion) blocker = 'no-question';
        // Bắt đầu chấm khi sinh viên còn đang nộp là chấm trên một tập bài thiếu, và khoá rubric + tài liệu chấm.
        else if (examStillRunning(session, now)) blocker = 'in-progress';
      }
      return { session, status, counts, graded, blocker };
    });
}

/* ---------------------------------------------------------------------- lọc */

export interface ListFilters {
  q: string;
  status: ListStatus | 'all';
  semesters: string[];
  /** `classId`, không phải tên: tên chỉ để hiện, khoá mới phân biệt hai lớp trùng tên. */
  classIds: string[];
  examTypes: string[];
  rooms: string[];
  time: 'all' | '7' | '30';
  noRubric: boolean;
}

export const EMPTY_LIST_FILTERS: ListFilters = {
  q: '',
  status: 'all',
  semesters: [],
  classIds: [],
  examTypes: [],
  rooms: [],
  time: 'all',
  noRubric: false,
};

export function hasActiveFilters(f: ListFilters): boolean {
  return (
    f.q.trim() !== '' ||
    f.status !== 'all' ||
    f.semesters.length > 0 ||
    f.classIds.length > 0 ||
    f.examTypes.length > 0 ||
    f.rooms.length > 0 ||
    f.time !== 'all' ||
    f.noRubric
  );
}

/** Bỏ dấu, hạ chữ thường, đ → d: gõ "giua ky" vẫn ra "Giữa kỳ". */
export function foldText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd');
}

export type FacetKey = 'semesters' | 'classIds' | 'examTypes' | 'rooms';
export const FACET_KEYS: FacetKey[] = ['semesters', 'classIds', 'examTypes', 'rooms'];

const FACET_VALUE: Record<FacetKey, (s: SessionOverviewItem) => string> = {
  semesters: (s) => s.semesterName,
  classIds: (s) => s.classId,
  examTypes: (s) => s.examType,
  rooms: (s) => s.roomName,
};
const FACET_LABEL: Record<FacetKey, (s: SessionOverviewItem) => string> = {
  semesters: (s) => s.semesterName,
  classIds: (s) => s.className ?? 'Không rõ lớp',
  examTypes: (s) => EXAM_TYPE_LABELS[s.examType] ?? s.examType,
  rooms: (s) => s.roomName,
};

/**
 * `skip` bỏ MỘT bộ lọc ra khỏi phép so — dùng để đếm số lượng của chính bộ lọc đó (đếm theo các bộ lọc KHÁC),
 * và để đếm tab trạng thái. Trong một nhóm: OR. Giữa các nhóm: AND. Nhóm rỗng = không lọc.
 */
export function matchesFilters(row: SessionRow, f: ListFilters, now: number, skip?: FacetKey | 'status'): boolean {
  const s = row.session;
  const words = foldText(f.q).split(/\s+/).filter(Boolean);
  if (words.length > 0) {
    const haystack = foldText(
      [s.name, s.className ?? '', s.roomName, s.semesterName, s.code, EXAM_TYPE_LABELS[s.examType] ?? ''].join(' '),
    );
    if (!words.every((w) => haystack.includes(w))) return false;
  }
  for (const key of FACET_KEYS) {
    if (key !== skip && f[key].length > 0 && !f[key].includes(FACET_VALUE[key](s))) return false;
  }
  if (f.time !== 'all') {
    const age = now - Date.parse(s.startTime);
    // Ngày không đọc được → không loại (NaN so sánh luôn sai): giấu phiên vì một ô ngày hỏng đắt hơn hiện thừa.
    if (age > Number(f.time) * DAY_MS) return false;
  }
  if (f.noRubric && s.rubricId !== null) return false;
  // Trạng thái chưa biết (bảng tóm tắt đang tải hoặc lỗi) không phải "trạng thái khác": bộ lọc trạng thái từ
  // URL chưa có gì để so, và giấu mọi hàng vì thế biến một chỗ chưa biết thành một danh sách trống.
  if (skip !== 'status' && f.status !== 'all' && row.status !== null && row.status !== f.status) return false;
  return true;
}

export interface FacetOption {
  value: string;
  label: string;
  count: number;
}

export function facetOptions(rows: SessionRow[], f: ListFilters, now: number): Record<FacetKey, FacetOption[]> {
  const out = {} as Record<FacetKey, FacetOption[]>;
  for (const key of FACET_KEYS) {
    const labels = new Map<string, string>();
    const newest = new Map<string, number>();
    const counts = new Map<string, number>();
    for (const r of rows) {
      const value = FACET_VALUE[key](r.session);
      labels.set(value, FACET_LABEL[key](r.session));
      newest.set(value, Math.max(newest.get(value) ?? 0, Date.parse(r.session.startTime) || 0));
      if (matchesFilters(r, f, now, key)) counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    const options = [...labels].map(([value, label]) => ({ value, label, count: counts.get(value) ?? 0 }));
    if (key === 'semesters') options.sort((a, b) => (newest.get(b.value) ?? 0) - (newest.get(a.value) ?? 0));
    else if (key === 'examTypes') options.sort((a, b) => ['TK', 'GK', 'CK'].indexOf(a.value) - ['TK', 'GK', 'CK'].indexOf(b.value));
    else options.sort((a, b) => a.label.localeCompare(b.label, 'vi', { numeric: true }));
    out[key] = options;
  }
  return out;
}

export function statusCounts(rows: SessionRow[], f: ListFilters, now: number): Record<ListStatus | 'all', number> {
  const counts: Record<ListStatus | 'all', number> = { all: 0, attention: 0, ready: 0, todo: 0, running: 0, done: 0 };
  for (const r of rows) {
    if (!matchesFilters(r, f, now, 'status')) continue;
    counts.all += 1;
    if (r.status !== null) counts[r.status] += 1;
  }
  return counts;
}

/* ----------------------------------------------------------- sắp xếp, nhóm */

export type SortKey = 'priority' | 'date' | 'name' | 'submitted';

export interface ListView {
  sortKey: SortKey;
  sortDir: 'asc' | 'desc';
  group: 'none' | 'class' | 'semester';
}

export const DEFAULT_VIEW: ListView = { sortKey: 'priority', sortDir: 'asc', group: 'none' };
/** Chiều tự nhiên của từng khoá khi bấm tiêu đề cột lần đầu. */
export const DEFAULT_SORT_DIR: Record<SortKey, 'asc' | 'desc'> = { priority: 'asc', date: 'desc', name: 'asc', submitted: 'desc' };

const rank = (r: SessionRow): number => (r.status === null ? LIST_STATUS_ORDER.length : LIST_STATUS_ORDER.indexOf(r.status));
const newestFirst = (a: SessionRow, b: SessionRow): number => Date.parse(b.session.startTime) - Date.parse(a.session.startTime) || 0;

const COMPARE: Record<SortKey, (a: SessionRow, b: SessionRow) => number> = {
  priority: (a, b) => rank(a) - rank(b) || newestFirst(a, b),
  date: (a, b) => Date.parse(a.session.startTime) - Date.parse(b.session.startTime) || 0,
  name: (a, b) => a.session.name.localeCompare(b.session.name, 'vi', { numeric: true }) || newestFirst(a, b),
  submitted: (a, b) => submittedCount(a.session) - submittedCount(b.session) || newestFirst(a, b),
};

export function sortRows(rows: SessionRow[], view: ListView): SessionRow[] {
  const sign = view.sortDir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => sign * COMPARE[view.sortKey](a, b));
}

export interface RowGroup {
  key: string | null;
  label: string | null;
  rows: SessionRow[];
}

export function groupRows(rows: SessionRow[], group: ListView['group']): RowGroup[] {
  if (group === 'none') return [{ key: null, label: null, rows }];
  const map = new Map<string, RowGroup>();
  for (const r of rows) {
    const key = group === 'class' ? r.session.classId : r.session.semesterName;
    const label = group === 'class' ? (r.session.className ?? 'Không rõ lớp') : r.session.semesterName;
    const entry = map.get(key) ?? { key, label, rows: [] };
    entry.rows.push(r);
    map.set(key, entry);
  }
  const groups = [...map.values()];
  if (group === 'class') return groups.sort((a, b) => a.label!.localeCompare(b.label!, 'vi', { numeric: true }));
  const newest = (g: RowGroup) => Math.max(...g.rows.map((r) => Date.parse(r.session.startTime) || 0));
  return groups.sort((a, b) => newest(b) - newest(a));
}

/* -------------------------------------------------------------- hàng loạt */

export interface BulkPlan {
  /** Chưa chấm, có rubric, có đề bài — ứng viên cho "Bắt đầu chấm". Máy chủ vẫn là người quyết. */
  start: SessionRow[];
  /** Chưa chấm và chưa có rubric. */
  assignRubric: SessionRow[];
  mix: Partial<Record<ListStatus, number>>;
}

export function bulkPlan(selected: SessionRow[]): BulkPlan {
  const plan: BulkPlan = { start: [], assignRubric: [], mix: {} };
  for (const r of selected) {
    if (r.status === null) continue;
    plan.mix[r.status] = (plan.mix[r.status] ?? 0) + 1;
    if (r.status !== 'todo') continue;
    if (r.session.rubricId === null) plan.assignRubric.push(r);
    else if (r.blocker === null) plan.start.push(r);
  }
  return plan;
}

/* ---------------------------------------------------------------- hàng */

export function sessionHref(sessionId: string, state?: SessionState): string {
  return `/teacher/grading?sessionId=${sessionId}${state ? `&state=${state}` : ''}`;
}

export type RowAction =
  | { kind: 'link'; label: string; href: string; tone: 'primary' | 'outline' | 'ghost' }
  | { kind: 'start'; label: string; tone: 'primary' };

export function rowActionOf(row: SessionRow): RowAction {
  const id = row.session.id;
  switch (row.status) {
    case 'attention': {
      const first = (['needsYou', 'audit', 'ungradable'] as SessionState[]).find((s) => row.counts[s] > 0);
      return { kind: 'link', label: 'Xem xét', href: sessionHref(id, first), tone: 'primary' };
    }
    case 'ready':
      return { kind: 'link', label: 'Chốt điểm', href: `/teacher/grading/finalize?sessionId=${id}`, tone: 'outline' };
    case 'todo':
      return row.blocker
        ? { kind: 'link', label: 'Chuẩn bị', href: sessionHref(id), tone: 'outline' }
        : { kind: 'start', label: 'Bắt đầu chấm', tone: 'primary' };
    case 'running':
      return { kind: 'link', label: 'Xem tiến độ', href: sessionHref(id), tone: 'outline' };
    case 'done':
      return { kind: 'link', label: 'Mở kết quả', href: sessionHref(id), tone: 'ghost' };
    default:
      return { kind: 'link', label: 'Mở', href: sessionHref(id), tone: 'outline' };
  }
}

export function staleDays(row: SessionRow, now: number): number | null {
  if (row.status !== 'attention' && row.status !== 'ready') return null;
  const days = Math.floor((now - Date.parse(row.session.startTime)) / DAY_MS);
  return days >= STALE_AFTER_DAYS ? days : null;
}

/** Dòng chú thích dưới pill trạng thái: lý do chặn, sẵn sàng, hoặc "để quá lâu". */
export function rowNote(row: SessionRow, now: number): { text: string; tone: 'warn' | 'ok' } | null {
  if (row.status === 'todo') {
    if (row.blocker === 'no-rubric') return { text: 'Thiếu rubric', tone: 'warn' };
    if (row.blocker === 'no-question') return { text: 'Thiếu đề bài', tone: 'warn' };
    if (row.blocker === 'in-progress') return { text: 'Phiên chưa kết thúc', tone: 'warn' };
    return { text: 'Sẵn sàng chấm', tone: 'ok' };
  }
  const stale = staleDays(row, now);
  return stale === null ? null : { text: `Thi cách đây ${stale} ngày`, tone: 'warn' };
}

export function progressCaption(row: SessionRow): string {
  const c = row.counts;
  const attn = c.needsYou + c.audit + c.ungradable;
  switch (row.status) {
    case 'attention':
      return c.grading > 0 ? `${attn} cần xem · ${c.grading} đang chấm` : `${attn} cần xem`;
    case 'running':
      return `${row.graded - c.grading}/${row.graded} đã chấm`;
    case 'ready':
      return `${c.auto + c.reviewed} chờ chốt`;
    case 'todo':
      return `0/${submittedCount(row.session)} đã chấm`;
    case 'done':
      return `${row.graded}/${row.graded} đã chốt`;
    default:
      return '';
  }
}

/** Cho trình đọc màn hình: ĐỦ các con số của thanh, không chỉ màu. */
export function progressLabel(row: SessionRow): string {
  const c = row.counts;
  const parts = [
    [c.needsYou + c.audit + c.ungradable, 'cần xem'],
    [c.grading, 'đang chấm'],
    [c.auto + c.reviewed, 'chờ chốt'],
    [c.finalised, 'đã chốt'],
  ]
    .filter(([n]) => (n as number) > 0)
    .map(([n, text]) => `${n} ${text}`);
  return `Tiến độ ${row.session.name}: ${parts.length > 0 ? parts.join(', ') : 'chưa chấm bài nào'}`;
}

/** Giờ máy người xem, không phải giờ UTC: giảng viên đọc "07:30", không đọc "00:30Z". */
export function formatSessionDate(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: '—', time: '' };
  const p = (n: number) => String(n).padStart(2, '0');
  return { date: `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`, time: `${p(d.getHours())}:${p(d.getMinutes())}` };
}

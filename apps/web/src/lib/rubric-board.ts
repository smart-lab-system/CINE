import type { OverviewCriterion, OverviewSession, RubricOverview, RubricSessionState } from './api/rubric-errors';
import { formatVnPoints } from './format';

/**
 * Logic thuần của trang Bảng lỗi (spec mục 5.2, 5.6): trạng thái và việc cần làm của một rubric, ô chọn rubric
 * khi có nhiều rubric, học kỳ, xem trước sao chép và câu "Lưu thì áp vào đâu". Không React, không mạng — để test
 * được từng luật (T-RBE-UI-1). Chỗ DUY NHẤT chạm `localStorage` của trang cũng nằm ở đây, luôn trong try/catch.
 */

/** Quá ngưỡng này, hàng thẻ chuyển thành ô "Rubric đang mở" có tìm kiếm. */
export const MANY = 4;
export const RECENT_SHOWN = 3;
export const RECENT_STORED = 8;
/** Giá trị bộ lọc cho rubric chưa gắn phiên thi nào (không có học kỳ). */
export const NO_SEMESTER = '__none';

// ── trạng thái và việc cần làm ───────────────────────────────────────────────────────────────

export type BoardStatus = 'new' | 'todo' | 'ready';
export type BoardTask =
  | { kind: 'empty_criteria'; criteria: OverviewCriterion[] }
  | { kind: 'unpriced'; count: number }
  | { kind: 'proposals'; count: number }
  | { kind: 'dangling'; count: number };

/** Mỗi LOẠI việc có mặt đếm một (không đếm theo số lỗi) — đúng "Còn N việc" ở mock-up. */
export function tasksOf(o: RubricOverview): BoardTask[] {
  const tasks: BoardTask[] = [];
  const empty = o.criteria.filter((c) => c.errorCount === 0 && c.waiverId === null);
  if (empty.length > 0) tasks.push({ kind: 'empty_criteria', criteria: empty });
  if (o.unpricedCount > 0) tasks.push({ kind: 'unpriced', count: o.unpricedCount });
  if (o.proposalCount > 0) tasks.push({ kind: 'proposals', count: o.proposalCount });
  if (o.danglingCount > 0) tasks.push({ kind: 'dangling', count: o.danglingCount });
  return tasks;
}

/**
 * `new`: chưa có lỗi nào (và chưa phải mọi tiêu chí đều "không trừ điểm"); `todo`: còn việc; `ready`: hết việc.
 * Đúng với T-FLOOR-6: tiêu chí không có lỗi và không được đánh dấu thì bài chấm theo rubric không tự quyết.
 */
export function statusOf(o: RubricOverview): { status: BoardStatus; tasks: BoardTask[]; label: string } {
  const tasks = tasksOf(o);
  const allWaived = o.criteria.every((c) => c.waiverId !== null);
  if (o.errorCount === 0 && !allWaived) return { status: 'new', tasks, label: 'Chưa có lỗi nào' };
  if (tasks.length > 0) return { status: 'todo', tasks, label: `Còn ${tasks.length} việc` };
  return { status: 'ready', tasks, label: 'Sẵn sàng chấm tự động' };
}

function taskSentence(task: BoardTask): string {
  switch (task.kind) {
    case 'empty_criteria':
      return `Tiêu chí ${capNames(task.criteria.map((c) => shorten(c.description)), 3, 'tiêu chí')} chưa có lỗi nào — bài dính tiêu chí đó không tự quyết.`;
    case 'unpriced':
      return `${task.count} lỗi chưa có điểm trừ — bài dính chúng sẽ vào nhóm cần bạn xem.`;
    case 'proposals':
      return `${task.count} lỗi AI đề xuất chưa xử lý — đang bị loại khỏi điểm.`;
    case 'dangling':
      return `${task.count} lỗi gắn tiêu chí không còn trong rubric — chuyển sang tiêu chí khác.`;
  }
}

/** Các câu cảnh báo cho màn chuẩn bị chấm (`preflight`); rỗng = sẵn sàng. */
export function warningSentences(o: RubricOverview): string[] {
  const { status, tasks } = statusOf(o);
  if (status === 'ready') return [];
  if (status === 'new') {
    return ['Rubric này chưa có lỗi nào — mọi bài chấm theo rubric này sẽ chuyển sang “Cần bạn xem” thay vì tự duyệt.'];
  }
  return tasks.map(taskSentence);
}

// ── chuỗi ────────────────────────────────────────────────────────────────────────────────────

/** Bỏ dấu tiếng Việt (kể cả đ), chữ thường — để tìm "cuoi ky" ra "Cuối kỳ". */
export const fold = (s: string): string =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

/** "A, B và 8 rubric khác" — mọi chỗ liệt kê rubric / phiên đều chặn trần (D7). */
export function capNames(names: string[], max = 2, unit = 'rubric'): string {
  return names.length <= max ? names.join(', ') : `${names.slice(0, max).join(', ')} và ${names.length - max} ${unit} khác`;
}

export function shorten(text: string, max = 40): string {
  const t = text.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

// ── học kỳ (D8) ──────────────────────────────────────────────────────────────────────────────

export const semestersOf = (o: RubricOverview): string[] => (o.semesters.length > 0 ? o.semesters : [NO_SEMESTER]);

export function semesterLabel(value: string | null): string {
  if (value === null) return 'Tất cả học kỳ';
  return value === NO_SEMESTER ? 'Chưa gắn học kỳ' : value;
}

/**
 * Học kỳ là chuỗi giảng viên gõ ("HK1 2026-2027") nên không có ngày để sắp. Xếp theo năm đầu tiên trong chuỗi rồi
 * theo số HK: đủ để "mới nhất trước" đúng với cách đặt tên thông thường; chuỗi lạ rơi về cuối theo thứ tự chữ.
 */
function semesterRank(label: string): number {
  const year = /(\d{4})/.exec(label);
  const term = /HK\s*(\d)/i.exec(label);
  return year ? Number(year[1]) * 10 + (term ? Number(term[1]) : 0) : 0;
}

export function semesterChoices(all: RubricOverview[]): { value: string | null; label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const o of all) for (const s of semestersOf(o)) counts.set(s, (counts.get(s) ?? 0) + 1);
  const named = [...counts.keys()]
    .filter((s) => s !== NO_SEMESTER)
    .sort((a, b) => semesterRank(b) - semesterRank(a) || b.localeCompare(a));
  const choices: { value: string | null; label: string; count: number }[] = [
    { value: null, label: semesterLabel(null), count: all.length },
    ...named.map((value) => ({ value, label: value, count: counts.get(value)! })),
  ];
  if (counts.has(NO_SEMESTER)) choices.push({ value: NO_SEMESTER, label: semesterLabel(NO_SEMESTER), count: counts.get(NO_SEMESTER)! });
  return choices;
}

/** Lọc theo học kỳ chỉ THU HẸP tầm nhìn — không bao giờ chặn thao tác (`CLAUDE.md` §1.2). */
export const inSemester = (all: RubricOverview[], sem: string | null): RubricOverview[] =>
  sem === null ? all : all.filter((o) => semestersOf(o).includes(sem));

// ── ô chọn rubric ────────────────────────────────────────────────────────────────────────────

export type PickFilter = 'all' | 'todo' | 'ready' | 'new';
export type PickSort = 'recent' | 'name' | 'todo';
export interface PickQuery {
  q: string;
  filter: PickFilter;
  sort: PickSort;
  sem: string | null;
}

export function filterCounts(all: RubricOverview[], sem: string | null): Record<PickFilter, number> {
  const base = inSemester(all, sem);
  const counts: Record<PickFilter, number> = { all: base.length, todo: 0, ready: 0, new: 0 };
  for (const o of base) counts[statusOf(o).status]++;
  return counts;
}

/**
 * "Gần đây" = rubric đã mở gần đây trước (theo lịch sử), rồi theo thứ tự máy chủ trả (lưu mới nhất trước) —
 * không sắp theo tên khi chưa có lịch sử, vì rubric vừa lưu mới là cái giảng viên đang tìm.
 */
export function pickRubrics(all: RubricOverview[], query: PickQuery, recent: string[]): RubricOverview[] {
  const needle = fold(query.q.trim());
  const rows = inSemester(all, query.sem)
    .map((o, index) => ({ o, index, status: statusOf(o).status }))
    .filter(({ o, status }) => (query.filter === 'all' || status === query.filter) && fold(o.rubricName).includes(needle));
  const rank = (name: string) => {
    const i = recent.indexOf(name);
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  const order: Record<BoardStatus, number> = { todo: 0, new: 1, ready: 2 };
  type Row = (typeof rows)[number];
  const compare: Record<PickSort, (a: Row, b: Row) => number> = {
    name: (a, b) => a.o.rubricName.localeCompare(b.o.rubricName, 'vi'),
    todo: (a, b) => order[a.status] - order[b.status] || rank(a.o.rubricName) - rank(b.o.rubricName) || a.index - b.index,
    recent: (a, b) => rank(a.o.rubricName) - rank(b.o.rubricName) || a.index - b.index,
  };
  return rows.sort(compare[query.sort]).map((r) => r.o);
}

// ── lịch sử "gần đây": localStorage, luôn trong try/catch ──────────────────────────────────────

const recentKey = (teacherId: string) => `rules.recent.${teacherId}`;

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readRecent(teacherId: string | null): string[] {
  if (!teacherId) return [];
  try {
    const raw = storage()?.getItem(recentKey(teacherId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string').slice(0, RECENT_STORED) : [];
  } catch {
    return [];
  }
}

export const pushRecent = (list: string[], name: string): string[] => [name, ...list.filter((x) => x !== name)].slice(0, RECENT_STORED);

export function writeRecent(teacherId: string | null, list: string[]): void {
  if (!teacherId) return;
  try {
    storage()?.setItem(recentKey(teacherId), JSON.stringify(list));
  } catch {
    // Chế độ riêng tư / hết dung lượng: bỏ qua. Lịch sử chỉ là tiện ích, trang vẫn chạy đúng (Review Focus 3).
  }
}

// ── sao chép lỗi từ rubric khác ──────────────────────────────────────────────────────────────

/** Nguồn hợp lệ: rubric khác, có ít nhất một lỗi. */
export const copySources = (all: RubricOverview[], target: string): RubricOverview[] =>
  all.filter((o) => o.rubricName !== target && o.errorCount > 0);

/** Xem trước theo dữ liệu tổng quan: ghép theo KHOÁ tiêu chí, đúng như máy chủ sẽ làm. */
export function copyStats(source: RubricOverview, target: RubricOverview): { errors: number; criteria: number; skipped: number } {
  const targetKeys = new Set(target.criteria.map((c) => c.key));
  let errors = 0;
  let criteria = 0;
  let skipped = 0;
  for (const c of source.criteria) {
    if (targetKeys.has(c.key)) {
      if (c.errorCount > 0) {
        errors += c.errorCount;
        criteria++;
      }
    } else {
      skipped += c.errorCount;
    }
  }
  return { errors, criteria, skipped };
}

export function copyPreviewText(s: { errors: number; criteria: number; skipped: number }): string {
  return (
    `Sẽ sao chép ${s.errors} lỗi vào ${s.criteria} tiêu chí trùng tên, giữ nguyên điểm trừ để bạn chỉnh cho kỳ này.` +
    (s.skipped > 0 ? ` ${s.skipped} lỗi thuộc tiêu chí không có ở rubric này sẽ không được sao chép.` : '') +
    ' Sau khi sao chép, hai rubric độc lập.'
  );
}

// ── "Lưu thì áp vào đâu" ─────────────────────────────────────────────────────────────────────

export const NO_SESSION_IMPACT =
  'Rubric này chưa gắn phiên thi nào nên lỗi chưa ảnh hưởng bài nào. Khi gắn vào phiên thi, lỗi sẽ được dùng để chấm.';

export interface ImpactLine {
  sessionId: string;
  name: string;
  state: RubricSessionState;
  text: string;
}

/** Chữ dựng từ phiên của rubric, không gọi API: máy chủ không có "bậc áp luật" nữa (spec 1.1). */
export function impactLines(sessions: OverviewSession[], detection: 'auto' | 'ai'): ImpactLine[] {
  return sessions.map((s) => ({
    sessionId: s.id,
    name: s.name,
    state: s.state,
    text:
      s.state === 'finalized'
        ? 'Giữ nguyên điểm — bảng điểm trừ đã được ghim lúc chốt.'
        : s.state === 'not_started'
          ? 'Chưa chấm bài nào — lỗi sẽ được dùng khi bắt đầu chấm.'
          : detection === 'auto'
            ? `Tính lại ngay các bài dính lỗi này (trong ${s.resultCount} bài).`
            : 'AI xét lỗi này từ các bài chưa chấm; bài đã chấm không tính lại.',
  }));
}

/** Hậu quả của một lần sửa lên một nhóm phiên (ngăn kéo "Sửa lỗi"). */
export function scopeLine(sessions: OverviewSession[], detection: 'auto' | 'ai'): string {
  const open = sessions.filter((s) => s.state === 'grading');
  const done = sessions.filter((s) => s.state === 'finalized');
  const what =
    open.length > 0
      ? `${capNames(open.map((s) => s.name), 2, 'phiên')} (đang chấm): ${
          detection === 'auto' ? 'tính lại ngay các bài dính lỗi' : 'AI xét theo mô tả mới, từ các bài chưa chấm'
        }`
      : 'chưa có phiên đang chấm';
  return `${what}${done.length > 0 ? `; ${capNames(done.map((s) => s.name), 2, 'phiên')} (đã chốt) giữ nguyên` : ''}.`;
}

/** Tổng các điểm trừ nếu vượt điểm tối đa của tiêu chí (bài chỉ bị trừ tới mức tối đa), không thì null. */
export function overCap(deductions: (string | null)[], max: number): number | null {
  const hundredths = deductions.reduce((sum, d) => sum + (d === null ? 0 : Math.round(Number(d) * 100)), 0);
  return hundredths > Math.round(max * 100) ? hundredths / 100 : null;
}

/** Tổng điểm hiện "10,0 điểm" — dùng chung cho ô chọn và thanh thông tin rubric. */
export const pointsText = (value: number): string => `${formatVnPoints(value)} điểm`;

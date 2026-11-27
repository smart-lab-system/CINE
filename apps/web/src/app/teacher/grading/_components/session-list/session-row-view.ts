import { EXAM_TYPE_LABELS } from '@/lib/exam-session-display';
import {
  formatSessionDate,
  rowActionOf,
  rowNote,
  sessionHref,
  submittedCount,
  type RowAction,
  type RowGroup,
  type SessionRow,
} from '@/lib/session-list';

/**
 * Mọi chữ, nhãn `aria-label` và điều kiện hiện nút của MỘT hàng phiên, tính một lần để bảng (`SessionTable`) và thẻ
 * (`SessionCards`) cùng đọc: hai cách vẽ không có chỗ nào để lệch nhau về nội dung.
 */
export interface SessionRowView {
  id: string;
  name: string;
  href: string;
  /** Lớp · phòng (bỏ phần trống). */
  meta: string;
  typeLabel: string;
  date: string;
  time: string;
  /** Số bài đã nộp, dạng chữ. */
  submitted: string;
  /** `/M` khi biết sĩ số, ngược lại rỗng. */
  expected: string;
  note: { text: string; tone: 'warn' | 'ok' } | null;
  action: RowAction;
  /** Tên truy cập của nút hành động: lặp lại tên phiên để mỗi nút phân biệt được. */
  actionLabel: string;
  selectLabel: string;
}

export function sessionRowView(row: SessionRow, now: number): SessionRowView {
  const s = row.session;
  const when = formatSessionDate(s.startTime);
  const action = rowActionOf(row);
  const withClass = `${s.name}${s.className ? `, ${s.className}` : ''}`;
  return {
    id: s.id,
    name: s.name,
    href: sessionHref(s.id),
    meta: [s.className, s.roomName].filter(Boolean).join(' · '),
    typeLabel: EXAM_TYPE_LABELS[s.examType] ?? s.examType,
    date: when.date,
    time: when.time,
    submitted: String(submittedCount(s)),
    expected: s.rosterKnown && s.expectedCount > 0 ? `/${s.expectedCount}` : '',
    note: rowNote(row, now),
    action,
    actionLabel: `${action.label}: ${withClass}`,
    selectLabel: `Chọn phiên ${withClass}`,
  };
}

/**
 * "Chọn tất cả phiên đang hiện": mọi id trong mọi nhóm (kể cả nhóm đã thu gọn, như bảng) và trạng thái của ô chọn.
 * Một nơi tính cho cả bảng lẫn thẻ.
 */
export function selectionOf(groups: RowGroup[], selected: ReadonlySet<string>): { ids: string[]; all: boolean; some: boolean } {
  const ids = groups.flatMap((g) => g.rows.map((r) => r.session.id));
  return { ids, all: ids.length > 0 && ids.every((id) => selected.has(id)), some: ids.some((id) => selected.has(id)) };
}

/** Số liệu ở tiêu đề một nhóm: tổng hàng và hai trạng thái được nêu bật. */
export function groupSummary(g: RowGroup): { total: number; attention: number; ready: number } {
  return {
    total: g.rows.length,
    attention: g.rows.filter((r) => r.status === 'attention').length,
    ready: g.rows.filter((r) => r.status === 'ready').length,
  };
}

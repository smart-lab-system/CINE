import type { SearchAuditLogParams } from '@/lib/api/audit-log';

/**
 * Ba nhóm hành động của trang audit log (spec §4.2): dữ liệu nền, phiên thi,
 * chấm điểm. Mỗi nhóm là một danh sách TIỀN TỐ gửi cho API; một hành động mới
 * thuộc nhóm nào thì tiền tố loại đối tượng của nó phải nằm ở đây.
 */
export type AuditGroup = 'all' | 'master' | 'session' | 'grading';

export const AUDIT_GROUP_LABELS: Record<AuditGroup, string> = {
  all: 'Tất cả hành động',
  master: 'Dữ liệu nền',
  session: 'Phiên thi',
  grading: 'Chấm điểm',
};

export const AUDIT_GROUP_PREFIXES: Record<Exclude<AuditGroup, 'all'>, string[]> = {
  master: ['semester.', 'room.', 'class.', 'administrative_class.'],
  session: ['exam_session.'],
  grading: ['grading_result.'],
};

export interface AuditFilterState {
  group: AuditGroup;
  /** `null` = mọi người thực hiện. */
  actorId: string | null;
  /** `yyyy-mm-dd` từ `<input type="date">`, hoặc rỗng. */
  fromDay: string;
  toDay: string;
}

export const EMPTY_AUDIT_FILTERS: AuditFilterState = {
  group: 'all',
  actorId: null,
  fromDay: '',
  toDay: '',
};

export function hasActiveFilters(state: AuditFilterState): boolean {
  return (
    state.group !== 'all' || state.actorId !== null || state.fromDay !== '' || state.toDay !== ''
  );
}

/** `yyyy-mm-dd` → Date lúc 00:00 giờ ĐỊA PHƯƠNG, hoặc null nếu sai định dạng/không có ngày đó. */
function localMidnight(day: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return null;
  const [year, month, date] = [Number(match[1]), Number(match[2]) - 1, Number(match[3])];
  const result = new Date(year, month, date);
  // `new Date(2026, 12, 45)` không ném mà tràn sang năm sau; chặn các ngày không có thật.
  if (result.getFullYear() !== year || result.getMonth() !== month || result.getDate() !== date) {
    return null;
  }
  return result;
}

/**
 * Khoảng ngày người dùng chọn → khoảng thời điểm API nhận.
 *
 * `to` là 00:00 của NGÀY SAU ngày kết thúc: API coi `to` là KHÔNG bao gồm,
 * nên chọn "đến 03/10" phải gồm trọn ngày 03/10.
 */
export function dayRangeToIso(fromDay: string, toDay: string): { from?: string; to?: string } {
  const out: { from?: string; to?: string } = {};
  const from = localMidnight(fromDay);
  if (from) out.from = from.toISOString();
  const to = localMidnight(toDay);
  if (to) {
    to.setDate(to.getDate() + 1);
    out.to = to.toISOString();
  }
  return out;
}

export function toSearchParams(
  state: AuditFilterState,
  page: number,
  pageSize: number,
): SearchAuditLogParams {
  return {
    ...(state.group !== 'all' ? { action: AUDIT_GROUP_PREFIXES[state.group] } : {}),
    ...(state.actorId ? { actorId: state.actorId } : {}),
    ...dayRangeToIso(state.fromDay, state.toDay),
    page,
    pageSize,
  };
}

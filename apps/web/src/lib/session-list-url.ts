import {
  DEFAULT_SORT_DIR,
  DEFAULT_VIEW,
  EMPTY_LIST_FILTERS,
  LIST_STATUS_ORDER,
  type ListFilters,
  type ListStatus,
  type ListView,
  type SortKey,
} from './session-list';
import { type SemesterSelection } from './semester-filter';

/**
 * Trạng thái danh sách ↔ query string. Giá trị lạ bị BỎ (không ném): URL do giảng viên dán, gõ tay hay
 * một bản deploy cũ tạo ra, và trang chấm điểm không được trắng vì một tham số hỏng.
 */
export interface ListState {
  filters: ListFilters;
  view: ListView;
}

const SORT_KEYS: SortKey[] = ['priority', 'date', 'name', 'submitted'];
const GROUPS: ListView['group'][] = ['none', 'class', 'semester'];
const MAX_Q = 100;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const YEAR = /^2\d{3}$/; // 2000–2999, như bộ lọc `academicYear` ở server (plan D3)

const many = (params: URLSearchParams, name: string): string[] => [...new Set(params.getAll(name).filter(Boolean))];

/**
 * `year` + `sem` (khoá). Giá trị lạ BỊ BỎ: URL cũ mang TÊN kỳ (`sem=HK1 2026-2027`, lặp nhiều lần), URL gõ tay, hay một id hỏng đều về "Tất cả" thay vì
 * giữ một bộ lọc không ai thấy. Không kiểm kỳ có tồn tại ở đây (chưa có danh sách kỳ): `SessionList` dọn việc đó bằng `reconcileSelection` khi danh
 * sách đã tải. `sem` không kèm `year` vẫn được giữ — năm được điền theo kỳ ở bước đó.
 */
function semesterOf(params: URLSearchParams): SemesterSelection {
  const year = params.get('year') ?? '';
  const sem = params.get('sem') ?? '';
  return { academicYear: YEAR.test(year) ? Number(year) : null, semesterId: UUID.test(sem) ? sem : null };
}

export function parseListState(params: URLSearchParams): ListState {
  const status = params.get('status');
  const time = params.get('time');
  const [rawKey = '', rawDir = ''] = (params.get('sort') ?? '').split(':');
  const key = SORT_KEYS.includes(rawKey as SortKey) ? (rawKey as SortKey) : null;
  const group = params.get('group');
  return {
    filters: {
      q: (params.get('q') ?? '').slice(0, MAX_Q),
      status: LIST_STATUS_ORDER.includes(status as ListStatus) ? (status as ListStatus) : 'all',
      semester: semesterOf(params),
      classIds: many(params, 'cls'),
      examTypes: many(params, 'type'),
      rooms: many(params, 'room'),
      time: time === '7' || time === '30' ? time : 'all',
      noRubric: params.get('norubric') === '1',
    },
    view: {
      sortKey: key ?? DEFAULT_VIEW.sortKey,
      sortDir: key === null ? DEFAULT_VIEW.sortDir : rawDir === 'asc' || rawDir === 'desc' ? rawDir : DEFAULT_SORT_DIR[key],
      group: GROUPS.includes(group as ListView['group']) ? (group as ListView['group']) : DEFAULT_VIEW.group,
    },
  };
}

/** Chỉ ghi cái khác mặc định — URL mặc định là URL trần. KHÔNG bao giờ ghi `sessionId`. */
export function serializeListState({ filters, view }: ListState): URLSearchParams {
  const p = new URLSearchParams();
  if (filters.q.trim()) p.set('q', filters.q.slice(0, MAX_Q));
  if (filters.status !== EMPTY_LIST_FILTERS.status) p.set('status', filters.status);
  if (filters.semester.academicYear !== null) p.set('year', String(filters.semester.academicYear));
  if (filters.semester.semesterId !== null) p.set('sem', filters.semester.semesterId);
  filters.classIds.forEach((v) => p.append('cls', v));
  filters.examTypes.forEach((v) => p.append('type', v));
  filters.rooms.forEach((v) => p.append('room', v));
  if (filters.time !== 'all') p.set('time', filters.time);
  if (filters.noRubric) p.set('norubric', '1');
  if (view.sortKey !== DEFAULT_VIEW.sortKey || view.sortDir !== DEFAULT_VIEW.sortDir) p.set('sort', `${view.sortKey}:${view.sortDir}`);
  if (view.group !== DEFAULT_VIEW.group) p.set('group', view.group);
  return p;
}

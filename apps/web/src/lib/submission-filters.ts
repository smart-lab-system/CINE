import type { SessionOverviewItem } from './api/submissions';
import { getAttentionReasons, type AttentionKind } from './submission-attention';
import { EXAM_TYPE_LABELS } from './exam-session-display';

export interface FilterState {
  /** null = tất cả học kỳ. */
  semesterId: string | null;
  kinds: AttentionKind[];
  /** Lọc "đã đủ" — phiên ended không lý do nào. */
  complete: boolean;
  examTypes: string[];
  rooms: string[];
  showArchived: boolean;
  showClosed: boolean;
}

export const EMPTY_FILTERS: FilterState = {
  semesterId: null, kinds: [], complete: false,
  examTypes: [], rooms: [], showArchived: false, showClosed: true,
};

export interface FacetOption { value: string; label: string; count: number }

/**
 * Học kỳ mặc định của trang — lấy từ ĐỊNH NGHĨA DÙNG CHUNG của "kỳ hiện
 * tại" (`useSemesterFilter.pickDefaultSemester`, tính từ start_date của
 * bảng `semester`), không tự suy lại.
 *
 * Trước 2026-09-15 file này có công thức RIÊNG, suy kỳ mặc định từ
 * start/end của CÁC PHIÊN THI. Nó trả lời lệch với badge học kỳ trên
 * topbar và với bộ lọc của "Lớp của tôi" — hai chỗ cùng đọc định nghĩa
 * dùng chung. Doc comment của định nghĩa đó đã nói trước: "Hai công thức
 * song song là cách chúng lệch nhau."
 *
 * `items` chỉ còn dùng cho bước LÙI, và chỉ khi câu trả lời dùng chung
 * không chỉ tới dữ liệu nào: giảng viên chưa có phiên nào trong kỳ hiện
 * tại mà mở trang ra thấy bảng rỗng sẽ đọc thành "mất dữ liệu", nên khi
 * đó lấy kỳ của phiên MỚI NHẤT họ thực sự có. Đây không phải định nghĩa
 * thứ hai của "kỳ hiện tại" — nó không bao giờ ghi đè câu trả lời dùng
 * chung, chỉ điền vào chỗ trống.
 */
export function resolveDefaultSemester(
  items: SessionOverviewItem[],
  currentSemesterId: string | null,
): string | null {
  if (items.length === 0) return null;

  if (currentSemesterId !== null && items.some((i) => i.semesterId === currentSemesterId)) {
    return currentSemesterId;
  }

  // Tự tìm phiên mới nhất thay vì tin vào thứ tự server trả về: endpoint
  // hiện sắp theo start_time DESC, nhưng đó là chi tiết của câu SQL chứ
  // không phải hợp đồng nào mà file này đọc được.
  const newest = items.reduce((a, b) =>
    new Date(b.startTime).getTime() > new Date(a.startTime).getTime() ? b : a,
  );
  return newest.semesterId;
}

/** Ẩn/hiện theo vòng đời. `archived` thắng `closed` — spec §4.3. */
function passesLifecycle(item: SessionOverviewItem, f: FilterState): boolean {
  if (item.archivedAt !== null) return f.showArchived;
  if (item.attentionClosedAt !== null) return f.showClosed;
  return true;
}

/** Trong một nhóm: OR. Giữa các nhóm: AND. Nhóm rỗng = không lọc. */
function passesGroups(
  item: SessionOverviewItem,
  f: FilterState,
  now: number,
  skip?: 'kinds' | 'examTypes' | 'rooms',
): boolean {
  if (f.semesterId !== null && item.semesterId !== f.semesterId) return false;

  if (skip !== 'examTypes' && f.examTypes.length > 0 && !f.examTypes.includes(item.examType)) {
    return false;
  }
  if (skip !== 'rooms' && f.rooms.length > 0 && !f.rooms.includes(item.roomName)) {
    return false;
  }
  if (skip !== 'kinds' && (f.kinds.length > 0 || f.complete)) {
    const reasons = getAttentionReasons(item, now);
    const matchesKind = f.kinds.some((k) => reasons.some((r) => r.kind === k));
    const matchesComplete = f.complete && reasons.length === 0;
    if (!matchesKind && !matchesComplete) return false;
  }
  return true;
}

export function applyFilters(
  items: SessionOverviewItem[],
  f: FilterState,
  now: number,
): SessionOverviewItem[] {
  return items.filter((i) => passesLifecycle(i, f) && passesGroups(i, f, now));
}

function countBy(
  items: SessionOverviewItem[],
  key: (i: SessionOverviewItem) => string,
  label: (i: SessionOverviewItem) => string,
): FacetOption[] {
  const map = new Map<string, FacetOption>();
  for (const item of items) {
    const value = key(item);
    const found = map.get(value);
    if (found) found.count += 1;
    else map.set(value, { value, label: label(item), count: 1 });
  }
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Số đếm của mỗi nhóm được tính với các bộ lọc KHÁC đang bật, nhưng KHÔNG
 * tính chính nhóm đó — nếu không, bật "A3-01" sẽ đưa "A3-02" về 0 và giảng
 * viên không bao giờ chọn thêm được phòng thứ hai.
 */
export function buildFacets(items: SessionOverviewItem[], f: FilterState, now: number) {
  const live = items.filter((i) => passesLifecycle(i, f));

  const forKinds = live.filter((i) => passesGroups(i, f, now, 'kinds'));
  const forTypes = live.filter((i) => passesGroups(i, f, now, 'examTypes'));
  const forRooms = live.filter((i) => passesGroups(i, f, now, 'rooms'));

  const KIND_LABELS: Record<AttentionKind, string> = {
    'attended-no-submission': 'Nghi mất bài',
    partial: 'Thiếu file',
    'never-attended': 'Vắng thi',
    'sat-elsewhere': 'Thi bù ở phiên khác',
  };
  const kinds: FacetOption[] = (Object.keys(KIND_LABELS) as AttentionKind[]).map((kind) => ({
    value: kind,
    label: KIND_LABELS[kind],
    count: forKinds.filter((i) => getAttentionReasons(i, now).some((r) => r.kind === kind)).length,
  }));
  kinds.push({
    value: 'complete',
    label: 'Đã đủ',
    count: forKinds.filter((i) => getAttentionReasons(i, now).length === 0).length,
  });

  const examTypes = countBy(
    forTypes,
    (i) => i.examType,
    (i) => EXAM_TYPE_LABELS[i.examType] ?? i.examType,
  );
  const rooms = countBy(forRooms, (i) => i.roomName, (i) => i.roomName);
  const semesters = countBy(items, (i) => i.semesterId, (i) => i.semesterName);

  // Một nhóm lọc chỉ có một lựa chọn là nhiễu — UI không render nó. Spec §4.3.
  const meaningful = (o: FacetOption[]) => (o.length > 1 ? o : []);

  return {
    semesters,
    kinds,
    examTypes: meaningful(examTypes),
    rooms: meaningful(rooms),
    archivedCount: items.filter((i) => i.archivedAt !== null).length,
    closedCount: items.filter((i) => i.archivedAt === null && i.attentionClosedAt !== null).length,
  };
}

/**
 * Cảnh báo hỏng-theo-phòng: mọi phiên đỏ đang xem cùng một phòng, >=2 phiên,
 * trải >=2 môn. Điều kiện >=2 môn để không kêu oan khi một môn thi nhiều ca ở
 * phòng cố định của nó. Spec §5.5.
 */
export function detectRoomFailure(
  items: SessionOverviewItem[],
  now: number,
): { room: string; sessionCount: number; courseCount: number } | null {
  const red = items.filter((i) =>
    getAttentionReasons(i, now).some((r) => r.kind === 'attended-no-submission'),
  );
  if (red.length < 2) return null;

  const rooms = new Set(red.map((i) => i.roomName));
  if (rooms.size !== 1) return null;

  const courses = new Set(red.map((i) => i.courseId));
  if (courses.size < 2) return null;

  return { room: red[0].roomName, sessionCount: red.length, courseCount: courses.size };
}

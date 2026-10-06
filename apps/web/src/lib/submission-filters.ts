import type { SessionOverviewItem } from './api/submissions';
import { getAttentionReasons, type AttentionKind } from './submission-attention';
import { tellApart } from './tell-apart';
import { semesterTextOf } from './master-data-forms';
import { EXAM_TYPE_LABELS } from './exam-session-display';
import { ALL_SEMESTERS, matchesSemester, type SemesterSelection } from './semester-filter';

export interface FilterState {
  /**
   * Học kỳ/năm học đang xem, so bằng KHOÁ (`semesterId`/`academicYear` trên từng dòng) — không bằng chữ. `ALL_SEMESTERS` = tất cả: mặc định ở mọi màn
   * hình, vì một bộ lọc mặc định đã che mất việc tồn đọng của kỳ cũ.
   */
  semester: SemesterSelection;
  kinds: AttentionKind[];
  /** Lọc "đã đủ" — phiên ended không lý do nào. */
  complete: boolean;
  examTypes: string[];
  rooms: string[];
  /**
   * `classId` chứ không phải tên lớp: tên chỉ để hiện ra, còn khoá ngoại
   * mới là thứ phân biệt. Hai lớp trùng tên hiển thị vẫn phải lọc tách nhau.
   */
  classIds: string[];
  showArchived: boolean;
  showClosed: boolean;
}

export const EMPTY_FILTERS: FilterState = {
  semester: ALL_SEMESTERS, kinds: [], complete: false,
  examTypes: [], rooms: [], classIds: [], showArchived: false, showClosed: true,
};

export interface FacetOption { value: string; label: string; count: number }

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
  skip?: 'kinds' | 'examTypes' | 'rooms' | 'classIds',
): boolean {
  // Dòng chưa có học kỳ (lớp cũ chưa backfill) KHÔNG khớp khi đang lọc, và khớp khi không lọc — không bao giờ nổ vì `null`.
  if (!matchesSemester(f.semester, item)) return false;

  if (skip !== 'examTypes' && f.examTypes.length > 0 && !f.examTypes.includes(item.examType)) {
    return false;
  }
  if (skip !== 'rooms' && f.rooms.length > 0 && !f.rooms.includes(item.roomName)) {
    return false;
  }
  if (skip !== 'classIds' && f.classIds.length > 0 && !f.classIds.includes(item.classId)) {
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
  const forClasses = live.filter((i) => passesGroups(i, f, now, 'classIds'));

  const KIND_LABELS: Record<AttentionKind, string> = {
    'attended-no-submission': 'Nghi mất bài',
    partial: 'Thiếu file',
    'archive-issue': 'File nén thiếu nội dung',
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
  // Khoá theo id, nhãn theo tên. Phiên không gắn lớp không tồn tại nữa
  // (`exam_session.class_id` là NOT NULL), nhưng tên thì vẫn có thể rỗng.
  const classes = countBy(
    forClasses,
    (i) => i.classId,
    (i) => i.classLabel ?? 'Không gắn lớp',
  );
  // Hai lớp cùng nhãn ở hai học kỳ là hai lựa chọn khác nhau (khoá classId) — gắn học kỳ vào nhãn khi trùng. Sắp lại sau khi đổi nhãn.
  const semesterOfClass = new Map(forClasses.map((i) => [i.classId, i] as const));
  tellApart(
    classes,
    (o) => o.label,
    (o, label) => {
      o.label = label;
    },
    (o) => semesterTextOf(semesterOfClass.get(o.value)!),
  );
  classes.sort((a, b) => a.label.localeCompare(b.label));

  // Một nhóm lọc chỉ có một lựa chọn là nhiễu — UI không render nó. Spec §4.3.
  const meaningful = (o: FacetOption[]) => (o.length > 1 ? o : []);

  return {
    // Không còn nhóm `semesters`: lựa chọn học kỳ đến từ bảng học kỳ (`useSemesters`), không từ các dòng đã tải.
    kinds,
    examTypes: meaningful(examTypes),
    rooms: meaningful(rooms),
    classes: meaningful(classes),
    archivedCount: items.filter((i) => i.archivedAt !== null).length,
    closedCount: items.filter((i) => i.archivedAt === null && i.attentionClosedAt !== null).length,
  };
}

/**
 * Cảnh báo hỏng-theo-phòng: mọi phiên đỏ đang xem cùng một phòng, >=2 phiên,
 * trải >=2 LỚP. Điều kiện thứ hai để không kêu oan khi một lớp thi nhiều ca ở
 * phòng cố định của nó — lúc đó thứ chung là cái lớp, không phải cái phòng.
 * Spec §5.5.
 *
 * Mẫu số từng là "môn", và từ lúc hệ thống chốt phục vụ một môn thì
 * `courses.size` luôn bằng 1: hàm này LUÔN trả `null` và cái banner không bao
 * giờ hiện ra nữa. Test cũ không bắt được vì nó tự dựng hai môn khác nhau,
 * một trạng thái dữ liệu không còn tồn tại được.
 */
export function detectRoomFailure(
  items: SessionOverviewItem[],
  now: number,
): { room: string; sessionCount: number; classCount: number } | null {
  const red = items.filter((i) =>
    getAttentionReasons(i, now).some((r) => r.kind === 'attended-no-submission'),
  );
  if (red.length < 2) return null;

  const rooms = new Set(red.map((i) => i.roomName));
  if (rooms.size !== 1) return null;

  const classes = new Set(red.map((i) => i.classId));
  if (classes.size < 2) return null;

  return { room: red[0].roomName, sessionCount: red.length, classCount: classes.size };
}

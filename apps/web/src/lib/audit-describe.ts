/**
 * Biến một dòng `audit_log` thành MỘT câu tiếng Việt đọc được.
 *
 * Registry `DESCRIBERS` là chỗ các plan sau thêm câu cho hành động của mình
 * (`room.update`, `exam_session.cancel`, …): mỗi hành động mới ghi audit phải
 * thêm một mục ở đây cùng test của nó. Hành động chưa có mục nào vẫn đọc được
 * qua nhánh dự phòng — tên hành động, đối tượng, và danh sách trường đổi.
 *
 * Quy ước cho hành động dữ liệu nền: người ghi đặt `targetLabel` (tên người
 * đọc được của đối tượng: mã phòng, nhãn học kỳ…) vào `newValue` — hoặc vào
 * `oldValue` với hành động xoá. Audit chỉ lưu id của đối tượng, và một câu
 * "đổi phòng 9f8e7d6c…" không giúp ai điều tra gì.
 */

export const ACTOR_SYSTEM_LABEL = 'Hệ thống';

export interface DescribableEntry {
  action: string;
  targetType: string;
  targetId: string;
  /** `null` khi giá trị vượt 4 KB và bị cắt ở API. */
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
}

type Describer = (entry: DescribableEntry) => string;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Nhãn tiếng Việt của các trường hay gặp; trường lạ giữ nguyên tên. */
const FIELD_LABELS: Record<string, string> = {
  name: 'tên',
  code: 'mã',
  capacity: 'sức chứa',
  isActive: 'đang hoạt động',
  startDate: 'ngày bắt đầu',
  endDate: 'ngày kết thúc',
  startTime: 'giờ bắt đầu',
  endTime: 'giờ kết thúc',
  examType: 'loại kỳ thi',
  groupName: 'nhóm',
  teacherName: 'giảng viên',
  roomName: 'phòng',
};

function short(id: unknown): string {
  return typeof id === 'string' ? `${id.slice(0, 8)}…` : '—';
}

function format(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'có' : 'không';
  if (typeof value === 'string') return UUID.test(value) ? `${value.slice(0, 8)}…` : value;
  if (typeof value === 'number') return String(value);
  const json = JSON.stringify(value);
  return json.length > 40 ? `${json.slice(0, 40)}…` : json;
}

/** Danh sách "nhãn cũ → mới" cho mọi trường khác `targetLabel`. */
function diff(oldValue: Record<string, unknown> | null, newValue: Record<string, unknown> | null): string {
  const before = oldValue ?? {};
  const after = newValue ?? {};
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(
    (key) => key !== 'targetLabel',
  );
  return keys
    .map((key) => {
      const label = FIELD_LABELS[key] ?? key;
      const hasOld = key in before;
      const hasNew = key in after;
      if (hasOld && hasNew) return `${label} ${format(before[key])} → ${format(after[key])}`;
      return `${label} ${format(hasNew ? after[key] : before[key])}`;
    })
    .join('; ');
}

const scoreChange = (prefix: string, oldScore: unknown, newScore: unknown, suffix = ''): string =>
  `${prefix}: ${format(oldScore)} → ${format(newScore)}${suffix}`;

/** Mô tả riêng cho từng hành động. Plan C, D, F thêm mục của mình vào đây. */
const DESCRIBERS: Record<string, Describer> = {
  'exam_session.reassign_teacher': (e) =>
    `Chuyển phiên thi sang giảng viên khác (${short(e.oldValue?.teacherId)} → ${short(e.newValue?.teacherId)})`,

  'exam_session.access_granted': (e) => {
    const name = format(e.newValue?.studentName);
    const mssv = format(e.newValue?.studentMssv);
    const reason = e.newValue?.reason;
    return (
      `Duyệt cho sinh viên ${name} (${mssv}) vào phòng thi` +
      (typeof reason === 'string' && reason !== '' ? ` — lý do: ${reason}` : '')
    );
  },

  'grading_result.manual_score_after_finalize': (e) =>
    scoreChange('Sửa điểm sau khi đã công bố', e.oldValue?.score, e.newValue?.score),

  // Ghi chú riêng của giảng viên là riêng tư: chỉ nói RẰNG có, không in nội dung.
  'grading_result.score_edited_after_finalize': (e) =>
    scoreChange(
      'Sửa điểm sau khi đã công bố',
      e.oldValue?.finalScore,
      e.newValue?.finalScore,
      e.newValue?.privateNote ? ' (có ghi chú riêng)' : '',
    ),

  'grading_result.score_reapplied_after_finalize': (e) =>
    scoreChange('Áp lại bảng giá cho bài đã công bố', e.oldValue?.score, e.newValue?.score),
};

function fallback(entry: DescribableEntry): string {
  const label = entry.newValue?.targetLabel ?? entry.oldValue?.targetLabel;
  const target = typeof label === 'string' && label !== '' ? label : short(entry.targetId);
  const head = `${entry.action} · ${entry.targetType} ${target}`;
  const changes = diff(entry.oldValue, entry.newValue);
  return changes ? `${head}: ${changes}` : head;
}

export function describeAuditEntry(entry: DescribableEntry): string {
  const describer = DESCRIBERS[entry.action];
  return describer ? describer(entry) : fallback(entry);
}

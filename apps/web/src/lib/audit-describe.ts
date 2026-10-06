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
  academicYearStart: 'năm học',
  term: 'kỳ',
  semester: 'học kỳ',
  administrativeClass: 'lớp danh nghĩa',
  room: 'phòng',
  status: 'trạng thái',
};

function short(id: unknown): string {
  return typeof id === 'string' ? `${id.slice(0, 8)}…` : '—';
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/** `2026-09-01` → `01/09/2026`. Không đi qua `Date`: một ngày thuần không có múi giờ để lệch. */
function formatDmy(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
}

/**
 * Thời điểm → `dd/mm/yyyy HH:mm` theo giờ VIỆT NAM, không theo máy người xem: một dòng audit đọc ở hai nơi phải cho cùng một giờ,
 * và "giờ bắt đầu" của một phiên thi chỉ có nghĩa ở nơi phòng thi đặt.
 */
const INSTANT_FORMAT = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  // `h23`, không phải `hour12: false`: một số bản ICU in nửa đêm là "24:00" với `hour12: false`.
  hourCycle: 'h23',
});
function formatInstant(iso: string): string {
  const parts = Object.fromEntries(INSTANT_FORMAT.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}`;
}

function format(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'có' : 'không';
  if (typeof value === 'string') {
    if (ISO_DATE.test(value)) return formatDmy(value);
    if (ISO_INSTANT.test(value)) return formatInstant(value);
    return UUID.test(value) ? `${value.slice(0, 8)}…` : value;
  }
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

/** Tên đọc được của đối tượng: `targetLabel` ở `newValue` (hoặc `oldValue` với hành động xoá); không có thì 8 ký tự đầu của id. */
function targetOf(entry: DescribableEntry): string {
  const label = entry.newValue?.targetLabel ?? entry.oldValue?.targetLabel;
  return typeof label === 'string' && label !== '' ? label : short(entry.targetId);
}

/** `Sửa {loại} {tên}` kèm danh sách "nhãn cũ → mới" của các trường đổi (nếu có). */
function updateSentence(noun: string, entry: DescribableEntry): string {
  const changes = diff(entry.oldValue, entry.newValue);
  const head = `Sửa ${noun} ${targetOf(entry)}`;
  return changes ? `${head}: ${changes}` : head;
}

/** "thêm N, cập nhật N, giữ nguyên N" của một lần nhập từ file. */
function importSentence(noun: string, entry: DescribableEntry): string {
  const v = entry.newValue ?? {};
  const base = `Nhập ${noun} từ file: thêm ${format(v.added)}, cập nhật ${format(v.updated)}, giữ nguyên ${format(v.unchanged)}`;
  const reassigned = typeof v.reassignedTotal === 'number' && v.reassignedTotal > 0 ? ` — đổi giảng viên ${v.reassignedTotal} lớp` : '';
  return base + reassigned;
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

  // ---- Dữ liệu nền (plan C, D, E1) ---------------------------------------------------------------------------

  'semester.create': (e) =>
    `Tạo học kỳ ${targetOf(e)} (${format(e.newValue?.startDate)}–${format(e.newValue?.endDate)})`,
  'semester.update': (e) => updateSentence('học kỳ', e),
  'semester.delete': (e) => `Xoá học kỳ ${targetOf(e)}`,
  'semester.import': (e) => importSentence('học kỳ', e),

  'room.create': (e) => {
    const capacity = e.newValue?.capacity;
    return `Thêm phòng ${targetOf(e)}` + (typeof capacity === 'number' ? ` (sức chứa ${capacity})` : '');
  },
  'room.update': (e) => updateSentence('phòng', e),
  'room.delete': (e) => `Xoá phòng ${targetOf(e)}`,
  'room.import': (e) => importSentence('phòng thi', e),

  'administrative_class.create': (e) => `Thêm mã lớp danh nghĩa ${targetOf(e)} vào Danh mục`,
  'administrative_class.update': (e) =>
    `Đổi mã lớp danh nghĩa ${format(e.oldValue?.code)} → ${format(e.newValue?.code)} (nhãn của mọi lớp dùng mã này đổi theo)`,
  'administrative_class.delete': (e) => `Xoá mã lớp danh nghĩa ${targetOf(e)} khỏi Danh mục`,
  'administrative_class.import': (e) => importSentence('mã lớp danh nghĩa', e),

  'class.create': (e) => {
    const teacher = e.newValue?.teacherName;
    return `Tạo lớp ${targetOf(e)}` + (typeof teacher === 'string' ? `, giảng viên ${teacher}` : '');
  },
  'class.update': (e) => updateSentence('lớp', e),
  'class.reassign_teacher': (e) =>
    `Đổi giảng viên lớp ${targetOf(e)}: ${format(e.oldValue?.teacherName)} → ${format(e.newValue?.teacherName)}`,
  'class.delete': (e) => `Xoá lớp ${targetOf(e)}`,
  'class.import': (e) => importSentence('lớp', e),

  // ---- Sửa và huỷ phiên thi (plan F) -------------------------------------------------------------------------

  'exam_session.update': (e) => {
    const code = e.newValue?.code;
    const head = `Sửa phiên thi ${targetOf(e)}` + (typeof code === 'string' ? ` (${code})` : '');
    // `code` và `targetLabel` là NHÃN của đối tượng, không phải trường đã đổi — `diff` chỉ lọc `targetLabel`, nên bỏ `code` ở đây.
    const before = { ...(e.oldValue ?? {}) };
    const after = { ...(e.newValue ?? {}) };
    delete before.code;
    delete after.code;
    const changes = diff(before, after);
    return changes ? `${head}: ${changes}` : head;
  },
  'exam_session.cancel': (e) => {
    const code = e.newValue?.code;
    const reason = e.newValue?.reason;
    return (
      `Huỷ phiên thi ${targetOf(e)}` +
      (typeof code === 'string' ? ` (${code})` : '') +
      (typeof reason === 'string' && reason !== '' ? ` — lý do: ${reason}` : '')
    );
  },
};

function fallback(entry: DescribableEntry): string {
  const target = targetOf(entry);
  const head = `${entry.action} · ${entry.targetType} ${target}`;
  const changes = diff(entry.oldValue, entry.newValue);
  return changes ? `${head}: ${changes}` : head;
}

export function describeAuditEntry(entry: DescribableEntry): string {
  const describer = DESCRIBERS[entry.action];
  return describer ? describer(entry) : fallback(entry);
}

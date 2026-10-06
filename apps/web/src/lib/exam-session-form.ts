import type { ExamSessionResponse, ExamType, UpdateExamSessionInput } from './api/exam-session';

/** Phần của một phiên mà form SỬA đọc và có thể đổi. */
export type EditableSession = Pick<ExamSessionResponse, 'name' | 'roomId' | 'examType' | 'startTime' | 'endTime'>;

export interface EditFormValues {
  name: string;
  /** '' = phiên cũ chưa có phòng trong danh mục (trước backfill). */
  roomId: string;
  examType: ExamType;
  startTime: string;
  endTime: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * `<input type="datetime-local">` đọc và ghi giờ MÁY người dùng dạng `YYYY-MM-DDTHH:mm` — không giây, không múi giờ. Chuỗi ngày hỏng → '' (ô
 * trống), không ném: một dòng dữ liệu xấu không được làm trắng cả trang sửa.
 */
export function toDatetimeLocal(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function editFormValuesOf(session: EditableSession): EditFormValues {
  return {
    name: session.name,
    roomId: session.roomId ?? '',
    examType: session.examType,
    startTime: toDatetimeLocal(session.startTime),
    endTime: toDatetimeLocal(session.endTime),
  };
}

const minuteOf = (iso: string) => Math.floor(Date.parse(iso) / 60_000);

/** ISO của một giờ-máy dạng `datetime-local`; `null` nếu ô trống hay hỏng. */
function isoOf(local: string): string | null {
  const date = new Date(local);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Thân `PATCH /exam-sessions/:id`: CHỈ các trường đổi. Server trả 200 không ghi gì khi gửi đúng giá trị cũ, nhưng gửi cả những trường không đổi
 * vẫn sai vì hai lẽ: kiểm va chạm phòng/giờ chạy khi phòng hay giờ **có mặt** trong thân, và một thân đầy đủ là thân dễ lỡ mang trường cấm.
 *
 * - Giờ so theo PHÚT: ô `datetime-local` không có giây, nên một phiên tạo qua API với giờ lẻ giây mà người dùng không đụng tới sẽ lệch 30 giây
 *   so với giá trị nạp lại — nếu so chính xác, mỗi lần sửa tên lại âm thầm đổi giờ bắt đầu.
 * - Phòng rỗng (phiên cũ chưa có phòng) hoặc không đổi (kể cả phòng đã ngừng hoạt động) → không gửi `roomId`.
 */
export function editPayload(original: EditableSession, values: EditFormValues): UpdateExamSessionInput {
  const body: UpdateExamSessionInput = {};
  const name = values.name.trim();
  if (name !== original.name) body.name = name;
  if (values.roomId !== '' && values.roomId !== original.roomId) body.roomId = values.roomId;
  if (values.examType !== original.examType) body.examType = values.examType;
  const start = isoOf(values.startTime);
  if (start !== null && minuteOf(start) !== minuteOf(original.startTime)) body.startTime = start;
  const end = isoOf(values.endTime);
  if (end !== null && minuteOf(end) !== minuteOf(original.endTime)) body.endTime = end;
  return body;
}

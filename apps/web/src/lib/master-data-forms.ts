import type { AdminClass, AdminClassInput } from '@/lib/api/admin-classes';
import type { Room, RoomInput, RoomUpdate } from '@/lib/api/rooms';
import type { Semester, SemesterInput } from '@/lib/api/semesters';

/**
 * Biểu mẫu của ba trang admin → thân yêu cầu. HÀM THUẦN tách khỏi trang: logic dễ sai (ô trống nghĩa là gì khi thêm so với khi sửa;
 * gửi trường nào khi sửa) test được không cần DOM, và hai trang không phải mỗi nơi tự nghĩ lại.
 */

// ------------------------------------------------------------------------------------------------ học kỳ

export interface SemesterForm {
  academicYearStart: string;
  term: string;
  startDate: string;
  endDate: string;
}

export const EMPTY_SEMESTER_FORM: SemesterForm = { academicYearStart: '', term: '1', startDate: '', endDate: '' };

export function semesterFormOf(semester: Semester): SemesterForm {
  return {
    academicYearStart: String(semester.academicYearStart),
    term: String(semester.term),
    // <input type="date"> cần yyyy-mm-dd; cột là kiểu ngày nên giá trị trên dây đã bắt đầu bằng đúng chuỗi đó.
    startDate: semester.startDate.slice(0, 10),
    endDate: semester.endDate.slice(0, 10),
  };
}

/** Chỉ kiểm HÌNH DẠNG để bật nút gửi; luật thật (không chồng ngày, ngày kết thúc không trước ngày bắt đầu) là của server. */
export function semesterFormComplete(form: SemesterForm): boolean {
  return (
    /^\d{4}$/.test(form.academicYearStart) &&
    ['1', '2', '3'].includes(form.term) &&
    form.startDate !== '' &&
    form.endDate !== ''
  );
}

export function semesterPayload(form: SemesterForm): SemesterInput {
  return {
    academicYearStart: Number(form.academicYearStart),
    term: Number(form.term),
    startDate: form.startDate,
    endDate: form.endDate,
  };
}

// --------------------------------------------------------------------------------------------------- phòng

export interface RoomForm {
  name: string;
  capacity: string;
}

export const EMPTY_ROOM_FORM: RoomForm = { name: '', capacity: '' };

export function roomFormOf(room: Room): RoomForm {
  return { name: room.name, capacity: room.capacity === null ? '' : String(room.capacity) };
}

/**
 * THÊM: sức chứa trống thì BỎ khỏi thân — chưa biết sức chứa không được chặn việc ghi nhận một phòng, và "không nói gì" là câu trả lời đúng.
 */
export function roomCreatePayload(form: RoomForm): RoomInput {
  const capacity = form.capacity.trim();
  return { name: form.name, ...(capacity === '' ? {} : { capacity: Number(capacity) }) };
}

/**
 * SỬA: sức chứa trống nghĩa là XOÁ sức chứa (`null`). Khác hẳn lúc thêm: ở form sửa ô luôn mang giá trị hiện có, nên một ô trống là một
 * quyết định của người dùng, và bỏ nó khỏi thân sẽ lặng lẽ giữ lại một sức chứa họ vừa xoá.
 */
export function roomUpdatePayload(form: RoomForm): RoomUpdate {
  const capacity = form.capacity.trim();
  return { name: form.name, capacity: capacity === '' ? null : Number(capacity) };
}

// --------------------------------------------------------------------------------------------------- lớp

export interface ClassForm {
  semesterId: string;
  administrativeClassId: string;
  groupName: string;
  teacherId: string;
}

export const EMPTY_CLASS_FORM: ClassForm = { semesterId: '', administrativeClassId: '', groupName: '', teacherId: '' };

export function classFormOf(klass: AdminClass): ClassForm {
  return {
    // Lớp cũ chưa backfill có thể chưa có học kỳ/lớp danh nghĩa: ô rỗng cho tới khi admin chọn.
    semesterId: klass.semesterId ?? '',
    administrativeClassId: klass.administrativeClassId ?? '',
    groupName: klass.groupName,
    teacherId: klass.teacherId,
  };
}

/** Ba ô CHỌN phải có; nhóm không bắt buộc. */
export function classFormComplete(form: ClassForm): boolean {
  return form.semesterId !== '' && form.administrativeClassId !== '' && form.teacherId !== '';
}

export function classCreateBody(form: ClassForm): AdminClassInput {
  const groupName = form.groupName.trim();
  return {
    semesterId: form.semesterId,
    administrativeClassId: form.administrativeClassId,
    teacherId: form.teacherId,
    ...(groupName === '' ? {} : { groupName }),
  };
}

/**
 * Thân sửa chỉ gồm các trường ĐÃ ĐỔI so với bản gốc. Gửi lại cả bốn thì server vẫn đúng (nó tự so), nhưng mỗi lần gửi một `semesterId`
 * không đổi là một lần đi qua đường kiểm "không đổi học kỳ của lớp đã có phiên" — và thân rỗng cho phép trang nói "không có gì để lưu".
 * Nhóm về rỗng là một thay đổi thật (bỏ nhóm), nên gửi `''` chứ không bỏ trường.
 */
export function classUpdateBody(form: ClassForm, original: AdminClass): Partial<AdminClassInput> {
  const body: Partial<AdminClassInput> = {};
  if (form.semesterId !== (original.semesterId ?? '')) body.semesterId = form.semesterId;
  if (form.administrativeClassId !== (original.administrativeClassId ?? '')) {
    body.administrativeClassId = form.administrativeClassId;
  }
  if (form.groupName.trim() !== original.groupName) body.groupName = form.groupName.trim();
  if (form.teacherId !== original.teacherId) body.teacherId = form.teacherId;
  return body;
}

/** Chữ học kỳ của một dòng lớp — dựng từ năm và kỳ, cùng công thức với server (`HK1 2026-2027`). */
export function semesterTextOf(row: { academicYear: number | null; term: number | null }): string {
  return row.academicYear !== null && row.term !== null
    ? `HK${row.term} ${row.academicYear}-${row.academicYear + 1}`
    : 'Chưa gán học kỳ';
}

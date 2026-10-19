import type { Attendance, AttendanceStudent, SessionRosterSource } from './api/attendance';
import type { SubmissionRowStudent } from './submission-rows';

/**
 * Trạng thái trên bảng SV gộp (spec 2026-10-18 exam-ops-lobby-ux).
 * Derive từ AttendanceStudentView + deadline — không suy từ submission.
 */
export type RoomStatus =
  | 'not_joined'
  | 'present'
  | 'disconnected'
  | 'absent'
  | 'makeup'
  | 'unknown';

export type LobbyRosterFilter =
  | 'all'
  | 'not_joined'
  | 'present'
  | 'absent'
  | 'makeup'
  | 'not_submitted';

export type RoomStatusOpts = {
  endTime: string;
  status: string;
  /** Epoch ms — tests inject; production defaults to Date.now(). */
  now?: number;
};

export interface LobbyRosterRow {
  studentMssv: string;
  fullName: string;
  roomStatus: RoomStatus;
  /** AttendanceStudent khi có trong present/absent/makeup — dùng cho StudentMarks */
  attendanceStudent: AttendanceStudent | null;
  makeupFromClass?: string;
  /** Nguồn ảnh chốt — `manual` mới hiện nút gỡ. */
  rosterSource: SessionRosterSource | null;
  byDeliverable: SubmissionRowStudent['byDeliverable'];
}

type AttendanceGroup = 'present' | 'absent' | 'makeup';

function indexAttendance(
  attendance: Attendance | undefined,
): Map<string, { group: AttendanceGroup; student: AttendanceStudent }> {
  const map = new Map<string, { group: AttendanceGroup; student: AttendanceStudent }>();
  if (!attendance) return map;

  for (const student of attendance.present) {
    map.set(student.mssv, { group: 'present', student });
  }
  for (const student of attendance.absent) {
    map.set(student.mssv, { group: 'absent', student });
  }
  for (const student of attendance.makeup) {
    map.set(student.mssv, { group: 'makeup', student });
  }
  return map;
}

export function isDeadlinePassed(opts: RoomStatusOpts): boolean {
  const now = opts.now ?? Date.now();
  if (opts.status === 'collecting' || opts.status === 'completed') return true;
  const end = Date.parse(opts.endTime);
  return Number.isFinite(end) && now >= end;
}

/**
 * Không tin tên mảng present/absent một mình — backend gộp mọi !connected
 * vào absent. Đọc connected + firstSeenAt + deadline.
 */
export function resolveRoomStatus(
  mssv: string,
  attendance: Attendance | undefined,
  opts: RoomStatusOpts,
): RoomStatus {
  const entry = indexAttendance(attendance).get(mssv);
  if (!entry) return 'unknown';

  if (entry.group === 'makeup') return 'makeup';

  const { connected, firstSeenAt } = entry.student;
  if (connected) return 'present';
  if (firstSeenAt != null) return 'disconnected';

  // Chưa từng vào
  return isDeadlinePassed(opts) ? 'absent' : 'not_joined';
}

/**
 * Ghép submission rows (đã sort MSSV) với trạng thái từ attendance + deadline.
 * Không mutate input.
 */
export function buildLobbyRosterRows(
  attendance: Attendance | undefined,
  submissionRows: SubmissionRowStudent[],
  opts: RoomStatusOpts,
): LobbyRosterRow[] {
  const byMssv = indexAttendance(attendance);
  const sources = attendance?.sessionRosterSources ?? {};

  return submissionRows.map((row) => {
    const entry = byMssv.get(row.studentMssv);
    const key = row.studentMssv.toLowerCase();
    return {
      studentMssv: row.studentMssv,
      fullName: row.fullName,
      roomStatus: resolveRoomStatus(row.studentMssv, attendance, opts),
      attendanceStudent: entry?.student ?? null,
      makeupFromClass:
        row.makeupFromClass ??
        entry?.student.homeClassName ??
        undefined,
      rosterSource:
        entry?.student.rosterSource ?? sources[key] ?? null,
      byDeliverable: row.byDeliverable,
    };
  });
}

/** Đảo của đủ mọi deliverable `collected` — spec §5.1 «Chưa nộp». */
export function isNotFullySubmitted(
  row: SubmissionRowStudent | LobbyRosterRow,
  deliverables: { id: string }[],
): boolean {
  if (deliverables.length === 0) {
    // Khớp countFullySubmitted === 0 → mọi dòng đều "chưa nộp".
    return true;
  }
  return !deliverables.every((d) => row.byDeliverable[d.id]?.state === 'collected');
}

/** Số SV có ≥ 1 deliverable `invalid` (đếm người, không đếm file). */
export function countInvalidStudents(
  rows: Array<SubmissionRowStudent | LobbyRosterRow>,
  deliverables: { id: string }[],
): number {
  if (deliverables.length === 0) return 0;
  return rows.filter((row) =>
    deliverables.some((d) => row.byDeliverable[d.id]?.state === 'invalid'),
  ).length;
}

export function filterLobbyRows(
  rows: LobbyRosterRow[],
  filter: LobbyRosterFilter,
  deliverables: { id: string }[],
): LobbyRosterRow[] {
  switch (filter) {
    case 'all':
      return rows;
    case 'not_joined':
      return rows.filter((row) => row.roomStatus === 'not_joined');
    case 'present':
      return rows.filter(
        (row) => row.roomStatus === 'present' || row.roomStatus === 'disconnected',
      );
    case 'absent':
      return rows.filter((row) => row.roomStatus === 'absent');
    case 'makeup':
      return rows.filter((row) => row.roomStatus === 'makeup');
    case 'not_submitted':
      return rows.filter((row) => isNotFullySubmitted(row, deliverables));
  }
}

/** Substring match họ tên / MSSV — không phân biệt hoa thường. */
export function matchesLobbySearch(
  row: Pick<LobbyRosterRow, 'fullName' | 'studentMssv'>,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    row.fullName.toLowerCase().includes(q) ||
    row.studentMssv.toLowerCase().includes(q)
  );
}

export const ROOM_STATUS_LABEL: Record<RoomStatus, string> = {
  not_joined: 'Chưa vào',
  present: 'Có mặt',
  disconnected: 'Mất kết nối',
  absent: 'Vắng mặt',
  makeup: 'Thi bổ sung',
  unknown: 'Chưa xác định',
};

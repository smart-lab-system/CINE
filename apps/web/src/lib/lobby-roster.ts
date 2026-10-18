import type { Attendance, AttendanceStudent, SessionRosterSource } from './api/attendance';
import type { SubmissionRowStudent } from './submission-rows';

/**
 * Trạng thái phòng trên bảng SV gộp (spec 2026-10-08 §6.2).
 * Map từ attendance — không suy từ submission.
 */
export type RoomStatus = 'present' | 'absent' | 'makeup' | 'disconnected' | 'unknown';

export type LobbyRosterFilter =
  | 'all'
  | 'present'
  | 'absent'
  | 'makeup'
  | 'not_submitted';

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

export function resolveRoomStatus(
  mssv: string,
  attendance: Attendance | undefined,
): RoomStatus {
  const entry = indexAttendance(attendance).get(mssv);
  if (!entry) return 'unknown';

  if (entry.group === 'absent') return 'absent';
  if (entry.group === 'makeup') return 'makeup';
  // present
  return entry.student.connected ? 'present' : 'disconnected';
}

/**
 * Ghép submission rows (đã sort MSSV) với trạng thái phòng từ attendance.
 * Không mutate input.
 */
export function buildLobbyRosterRows(
  attendance: Attendance | undefined,
  submissionRows: SubmissionRowStudent[],
): LobbyRosterRow[] {
  const byMssv = indexAttendance(attendance);
  const sources = attendance?.sessionRosterSources ?? {};

  return submissionRows.map((row) => {
    const entry = byMssv.get(row.studentMssv);
    const key = row.studentMssv.toLowerCase();
    return {
      studentMssv: row.studentMssv,
      fullName: row.fullName,
      roomStatus: resolveRoomStatus(row.studentMssv, attendance),
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

export const ROOM_STATUS_LABEL: Record<RoomStatus, string> = {
  present: 'Có mặt',
  absent: 'Vắng mặt',
  makeup: 'Thi bổ sung',
  disconnected: 'Mất kết nối',
  unknown: '—',
};

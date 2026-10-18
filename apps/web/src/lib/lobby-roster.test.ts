import { describe, expect, it } from 'vitest';
import type { Attendance } from './api/attendance';
import {
  buildLobbyRosterRows,
  countInvalidStudents,
  filterLobbyRows,
  isNotFullySubmitted,
  resolveRoomStatus,
  type LobbyRosterRow,
} from './lobby-roster';
import type { SubmissionRowStudent } from './submission-rows';

function attendance(overrides: Partial<Attendance> = {}): Attendance {
  return {
    classId: 'class-1',
    className: 'CNM01',
    rosterSize: 0,
    rosterFrozen: true,
    confirmedAt: null,
    confirmedCount: null,
    present: [],
    absent: [],
    makeup: [],
    sessionRosterSources: {},
    discrepancy: null,
    ...overrides,
  };
}

function student(
  mssv: string,
  name: string,
  overrides: Partial<Attendance['present'][number]> = {},
) {
  return {
    mssv,
    name,
    connected: true,
    joinedLate: false,
    firstSeenAt: null,
    lastEventAt: null,
    afterHeadcount: null,
    ...overrides,
  };
}

function submissionRow(
  mssv: string,
  byDeliverable: SubmissionRowStudent['byDeliverable'] = {},
): SubmissionRowStudent {
  return { studentMssv: mssv, fullName: mssv, byDeliverable };
}

describe('resolveRoomStatus', () => {
  it('present + connected → present', () => {
    const data = attendance({
      present: [student('SV01', 'A', { connected: true })],
    });
    expect(resolveRoomStatus('SV01', data)).toBe('present');
  });

  it('present + !connected → disconnected', () => {
    const data = attendance({
      present: [student('SV01', 'A', { connected: false, firstSeenAt: '2026-10-08T08:05:00Z' })],
    });
    expect(resolveRoomStatus('SV01', data)).toBe('disconnected');
  });

  it('absent → absent', () => {
    const data = attendance({ absent: [student('SV02', 'B')] });
    expect(resolveRoomStatus('SV02', data)).toBe('absent');
  });

  it('makeup → makeup (kể cả khi mất kết nối)', () => {
    const data = attendance({
      makeup: [student('SV03', 'C', { connected: false, homeClassName: 'CNM02' })],
    });
    expect(resolveRoomStatus('SV03', data)).toBe('makeup');
  });

  it('không có trong attendance → unknown', () => {
    expect(resolveRoomStatus('SV99', attendance())).toBe('unknown');
    expect(resolveRoomStatus('SV99', undefined)).toBe('unknown');
  });
});

describe('isNotFullySubmitted / Chưa nộp trên cả roster', () => {
  const deliverables = [{ id: 'd1' }, { id: 'd2' }];

  it('SV vắng mặt chưa có file vẫn là chưa nộp', () => {
    const row = submissionRow('SV02');
    expect(isNotFullySubmitted(row, deliverables)).toBe(true);
  });

  it('đủ mọi deliverable collected → đã nộp', () => {
    const row = submissionRow('SV01', {
      d1: { state: 'collected' },
      d2: { state: 'collected' },
    });
    expect(isNotFullySubmitted(row, deliverables)).toBe(false);
  });

  it('nộp thiếu → chưa nộp', () => {
    const row = submissionRow('SV01', { d1: { state: 'collected' } });
    expect(isNotFullySubmitted(row, deliverables)).toBe(true);
  });

  it('không có deliverable → mọi dòng chưa nộp (khớp countFullySubmitted === 0)', () => {
    expect(isNotFullySubmitted(submissionRow('SV01'), [])).toBe(true);
  });
});

describe('countInvalidStudents', () => {
  const deliverables = [{ id: 'd1' }, { id: 'd2' }];

  it('đếm SV có ≥1 invalid, không đếm theo số file', () => {
    const rows = [
      submissionRow('SV01', { d1: { state: 'invalid' }, d2: { state: 'invalid' } }),
      submissionRow('SV02', { d1: { state: 'collected' } }),
      submissionRow('SV03', { d2: { state: 'invalid' } }),
    ];
    expect(countInvalidStudents(rows, deliverables)).toBe(2);
  });
});

describe('filterLobbyRows', () => {
  const deliverables = [{ id: 'd1' }];

  function lobbyRow(
    mssv: string,
    roomStatus: LobbyRosterRow['roomStatus'],
    byDeliverable: LobbyRosterRow['byDeliverable'] = {},
  ): LobbyRosterRow {
    return {
      studentMssv: mssv,
      fullName: mssv,
      roomStatus,
      attendanceStudent: null,
      rosterSource: null,
      byDeliverable,
    };
  }

  const rows: LobbyRosterRow[] = [
    lobbyRow('SV01', 'present', { d1: { state: 'collected' } }),
    lobbyRow('SV02', 'absent'),
    lobbyRow('SV03', 'makeup'),
    lobbyRow('SV04', 'disconnected'),
  ];

  it("filter 'not_submitted' gồm cả dòng absent", () => {
    const filtered = filterLobbyRows(rows, 'not_submitted', deliverables);
    expect(filtered.map((r) => r.studentMssv)).toEqual(['SV02', 'SV03', 'SV04']);
  });

  it("filter 'makeup' chỉ makeup", () => {
    const filtered = filterLobbyRows(rows, 'makeup', deliverables);
    expect(filtered.map((r) => r.studentMssv)).toEqual(['SV03']);
  });

  it("filter 'absent' chỉ vắng mặt", () => {
    expect(filterLobbyRows(rows, 'absent', deliverables).map((r) => r.studentMssv)).toEqual([
      'SV02',
    ]);
  });

  it("filter 'present' gồm present và disconnected (nhóm có mặt cũ)", () => {
    expect(filterLobbyRows(rows, 'present', deliverables).map((r) => r.studentMssv)).toEqual([
      'SV01',
      'SV04',
    ]);
  });
});

describe('buildLobbyRosterRows', () => {
  it('ghép roomStatus và attendanceStudent từ attendance', () => {
    const data = attendance({
      present: [student('SV01', 'An', { joinedLate: true })],
      absent: [student('SV02', 'Bình')],
    });
    const submissionRows = [
      submissionRow('SV01'),
      submissionRow('SV02'),
      submissionRow('SV99'),
    ];
    const lobby = buildLobbyRosterRows(data, submissionRows);
    expect(lobby).toHaveLength(3);
    expect(lobby[0].roomStatus).toBe('present');
    expect(lobby[0].attendanceStudent?.joinedLate).toBe(true);
    expect(lobby[1].roomStatus).toBe('absent');
    expect(lobby[2].roomStatus).toBe('unknown');
    expect(lobby[2].attendanceStudent).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import type { Attendance } from './api/attendance';
import {
  buildLobbyRosterRows,
  countInvalidStudents,
  filterLobbyRows,
  isNotFullySubmitted,
  matchesLobbySearch,
  resolveRoomStatus,
  type LobbyRosterRow,
  type RoomStatusOpts,
} from './lobby-roster';
import type { SubmissionRowStudent } from './submission-rows';

const BEFORE_END: RoomStatusOpts = {
  endTime: '2026-10-08T12:00:00.000Z',
  status: 'active',
  now: Date.parse('2026-10-08T10:00:00.000Z'),
};

const AFTER_END: RoomStatusOpts = {
  endTime: '2026-10-08T12:00:00.000Z',
  status: 'active',
  now: Date.parse('2026-10-08T13:00:00.000Z'),
};

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
      present: [student('SV01', 'A', { connected: true, firstSeenAt: '2026-10-08T08:00:00Z' })],
    });
    expect(resolveRoomStatus('SV01', data, BEFORE_END)).toBe('present');
  });

  it('absent mảng nhưng đã từng vào (!connected + firstSeenAt) → disconnected', () => {
    const data = attendance({
      absent: [
        student('SV01', 'A', {
          connected: false,
          firstSeenAt: '2026-10-08T08:05:00Z',
        }),
      ],
    });
    expect(resolveRoomStatus('SV01', data, BEFORE_END)).toBe('disconnected');
  });

  it('chưa từng vào trước hết giờ → not_joined', () => {
    const data = attendance({
      absent: [student('SV02', 'B', { connected: false, firstSeenAt: null })],
    });
    expect(resolveRoomStatus('SV02', data, BEFORE_END)).toBe('not_joined');
  });

  it('chưa từng vào sau hết giờ → absent', () => {
    const data = attendance({
      absent: [student('SV02', 'B', { connected: false, firstSeenAt: null })],
    });
    expect(resolveRoomStatus('SV02', data, AFTER_END)).toBe('absent');
  });

  it('chưa từng vào + status collecting → absent dù chưa tới endTime tường', () => {
    const data = attendance({
      absent: [student('SV02', 'B', { connected: false, firstSeenAt: null })],
    });
    expect(
      resolveRoomStatus('SV02', data, {
        endTime: '2026-10-08T18:00:00.000Z',
        status: 'collecting',
        now: Date.parse('2026-10-08T10:00:00.000Z'),
      }),
    ).toBe('absent');
  });

  it('makeup → makeup (kể cả khi mất kết nối)', () => {
    const data = attendance({
      makeup: [student('SV03', 'C', { connected: false, homeClassName: 'CNM02' })],
    });
    expect(resolveRoomStatus('SV03', data, BEFORE_END)).toBe('makeup');
  });

  it('không có trong attendance → unknown', () => {
    expect(resolveRoomStatus('SV99', attendance(), BEFORE_END)).toBe('unknown');
    expect(resolveRoomStatus('SV99', undefined, BEFORE_END)).toBe('unknown');
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
    lobbyRow('SV05', 'not_joined'),
  ];

  it("filter 'not_submitted' gồm cả dòng absent / not_joined", () => {
    const filtered = filterLobbyRows(rows, 'not_submitted', deliverables);
    expect(filtered.map((r) => r.studentMssv)).toEqual([
      'SV02',
      'SV03',
      'SV04',
      'SV05',
    ]);
  });

  it("filter 'makeup' chỉ makeup", () => {
    const filtered = filterLobbyRows(rows, 'makeup', deliverables);
    expect(filtered.map((r) => r.studentMssv)).toEqual(['SV03']);
  });

  it("filter 'absent' chỉ vắng mặt (không gồm not_joined)", () => {
    expect(filterLobbyRows(rows, 'absent', deliverables).map((r) => r.studentMssv)).toEqual([
      'SV02',
    ]);
  });

  it("filter 'not_joined' chỉ chưa vào", () => {
    expect(
      filterLobbyRows(rows, 'not_joined', deliverables).map((r) => r.studentMssv),
    ).toEqual(['SV05']);
  });

  it("filter 'present' gồm present và disconnected (nhóm có mặt cũ)", () => {
    expect(filterLobbyRows(rows, 'present', deliverables).map((r) => r.studentMssv)).toEqual([
      'SV01',
      'SV04',
    ]);
  });
});

describe('matchesLobbySearch', () => {
  const row = {
    studentMssv: 'SV20120001',
    fullName: 'Nguyễn Văn An',
  };

  it('rỗng → khớp mọi dòng', () => {
    expect(matchesLobbySearch(row, '')).toBe(true);
    expect(matchesLobbySearch(row, '   ')).toBe(true);
  });

  it('khớp MSSV không phân biệt hoa thường', () => {
    expect(matchesLobbySearch(row, 'sv2012')).toBe(true);
  });

  it('khớp họ tên substring', () => {
    expect(matchesLobbySearch(row, 'văn an')).toBe(true);
  });

  it('không khớp → false', () => {
    expect(matchesLobbySearch(row, 'Trần')).toBe(false);
  });
});

describe('buildLobbyRosterRows', () => {
  it('ghép roomStatus và attendanceStudent từ attendance + deadline', () => {
    const data = attendance({
      present: [
        student('SV01', 'An', {
          joinedLate: true,
          firstSeenAt: '2026-10-08T08:00:00Z',
        }),
      ],
      absent: [student('SV02', 'Bình', { connected: false, firstSeenAt: null })],
    });
    const submissionRows = [
      submissionRow('SV01'),
      submissionRow('SV02'),
      submissionRow('SV99'),
    ];
    const lobby = buildLobbyRosterRows(data, submissionRows, BEFORE_END);
    expect(lobby).toHaveLength(3);
    expect(lobby[0].roomStatus).toBe('present');
    expect(lobby[0].attendanceStudent?.joinedLate).toBe(true);
    expect(lobby[1].roomStatus).toBe('not_joined');
    expect(lobby[2].roomStatus).toBe('unknown');
    expect(lobby[2].attendanceStudent).toBeNull();
  });
});

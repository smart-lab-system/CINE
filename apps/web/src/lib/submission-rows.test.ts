import { describe, expect, it } from 'vitest';
import {
  buildSubmissionRows,
  countFullySubmitted,
  countRecollectTargets,
  countStudentsSubmittingAfter,
} from './submission-rows';
import type { Attendance } from './api/attendance';
import type { SubmissionStatusItem } from './api/exam-session';

/**
 * Extracted from the lobby page's own inline row-building (see its design
 * spec) so the new per-session submissions detail page can produce the
 * identical `SubmissionRowStudent[]` shape without a second implementation.
 * Tested here as pure functions, independent of either page's rendering.
 */

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
    discrepancy: null,
    ...overrides,
  };
}

function attendanceStudent(mssv: string, name: string) {
  return {
    mssv,
    name,
    connected: true,
    joinedLate: false,
    firstSeenAt: null,
    lastEventAt: null,
    afterHeadcount: null,
  };
}

function submission(overrides: Partial<SubmissionStatusItem> = {}): SubmissionStatusItem {
  return {
    studentMssv: 'SV20120001',
    studentNameInput: 'Nguyễn Văn A',
    requiredDeliverableId: 'deliverable-1',
    status: 'collected',
    submittedAt: '2026-08-29T04:00:00.000Z',
    fileSize: '2048',
    downloadUrl: 'https://storage.example/signed',
    ...overrides,
  };
}

describe('buildSubmissionRows', () => {
  it('gives every attended student a row, even with nothing submitted', () => {
    const rows = buildSubmissionRows(
      attendance({ present: [attendanceStudent('SV20120001', 'Nguyễn Văn A')] }),
      [],
    );

    expect(rows).toEqual([
      { studentMssv: 'SV20120001', fullName: 'Nguyễn Văn A', byDeliverable: {} },
    ]);
  });

  it('adds a row for a submission from someone with no attendance record', () => {
    const rows = buildSubmissionRows(attendance(), [submission()]);

    expect(rows).toEqual([
      {
        studentMssv: 'SV20120001',
        fullName: 'Nguyễn Văn A',
        byDeliverable: {
          'deliverable-1': {
            state: 'collected',
            submittedAt: '2026-08-29T04:00:00.000Z',
            downloadUrl: 'https://storage.example/signed',
            fileSize: '2048',
          },
        },
      },
    ]);
  });

  it('merges a submission into the same row as the matching attendance record', () => {
    const rows = buildSubmissionRows(
      attendance({ present: [attendanceStudent('SV20120001', 'Nguyễn Văn A')] }),
      [submission()],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].byDeliverable['deliverable-1'].state).toBe('collected');
  });

  it('ignores received/validated submissions — only collected/invalid are terminal', () => {
    const rows = buildSubmissionRows(attendance(), [submission({ status: 'received' })]);

    expect(rows[0].byDeliverable).toEqual({});
  });

  it('sorts rows by MSSV', () => {
    const rows = buildSubmissionRows(
      attendance({
        present: [
          attendanceStudent('SV20120002', 'B'),
          attendanceStudent('SV20120001', 'A'),
        ],
      }),
      [],
    );

    expect(rows.map((r) => r.studentMssv)).toEqual(['SV20120001', 'SV20120002']);
  });

  it('treats undefined attendance/submissions as empty', () => {
    expect(buildSubmissionRows(undefined, undefined)).toEqual([]);
  });
});

describe('countFullySubmitted', () => {
  it('counts a row only once every deliverable is collected', () => {
    const rows = buildSubmissionRows(attendance(), [
      submission({ requiredDeliverableId: 'd1' }),
      submission({ requiredDeliverableId: 'd2' }),
    ]);

    expect(
      countFullySubmitted(rows, [{ id: 'd1' }, { id: 'd2' }]),
    ).toBe(1);
  });

  it('does not count a row missing one deliverable', () => {
    const rows = buildSubmissionRows(attendance(), [
      submission({ requiredDeliverableId: 'd1' }),
    ]);

    expect(countFullySubmitted(rows, [{ id: 'd1' }, { id: 'd2' }])).toBe(0);
  });

  it('an invalid deliverable does not count as fully submitted', () => {
    const rows = buildSubmissionRows(attendance(), [
      submission({ requiredDeliverableId: 'd1', status: 'invalid' }),
    ]);

    expect(countFullySubmitted(rows, [{ id: 'd1' }])).toBe(0);
  });

  it('returns 0 when there are no required deliverables', () => {
    const rows = buildSubmissionRows(
      attendance({ present: [attendanceStudent('SV20120001', 'A')] }),
      [],
    );

    expect(countFullySubmitted(rows, [])).toBe(0);
  });
});

describe('countRecollectTargets', () => {
  const twoFiles = [{ id: 'd1' }, { id: 'd2' }];

  it('đếm em đã dự thi mà thiếu file', () => {
    const rows = buildSubmissionRows(
      attendance({ present: [attendanceStudent('SV20120001', 'A')] }),
      [submission({ requiredDeliverableId: 'd1' })],
    );

    expect(countRecollectTargets(rows, new Set(['SV20120001']), twoFiles)).toBe(1);
  });

  it('KHÔNG đếm em vắng thi, dù em đó cũng "thiếu" cả hai file', () => {
    // Em chưa từng kết nối thì không có máy nào để gửi lệnh tới. Đếm em
    // đó vào là hứa với giảng viên một việc hệ thống không làm được, rồi
    // báo lại "1 máy không phản hồi" cho một cái ghế trống.
    const rows = buildSubmissionRows(
      attendance({ absent: [attendanceStudent('SV20120002', 'B')] }),
      [],
    );

    expect(rows).toHaveLength(1);
    expect(countRecollectTargets(rows, new Set(), twoFiles)).toBe(0);
  });

  it('em nộp đủ rơi khỏi tập đích', () => {
    const rows = buildSubmissionRows(
      attendance({ present: [attendanceStudent('SV20120001', 'A')] }),
      [
        submission({ requiredDeliverableId: 'd1' }),
        submission({ requiredDeliverableId: 'd2' }),
      ],
    );

    expect(countRecollectTargets(rows, new Set(['SV20120001']), twoFiles)).toBe(0);
  });

  it('file invalid vẫn tính là chưa đủ', () => {
    const rows = buildSubmissionRows(
      attendance({ present: [attendanceStudent('SV20120001', 'A')] }),
      [
        submission({ requiredDeliverableId: 'd1' }),
        submission({ requiredDeliverableId: 'd2', status: 'invalid' }),
      ],
    );

    expect(countRecollectTargets(rows, new Set(['SV20120001']), twoFiles)).toBe(1);
  });

  it('chưa khai file bắt buộc thì không có ai để thu lại', () => {
    const rows = buildSubmissionRows(
      attendance({ present: [attendanceStudent('SV20120001', 'A')] }),
      [],
    );

    expect(countRecollectTargets(rows, new Set(['SV20120001']), [])).toBe(0);
  });
});

describe('countStudentsSubmittingAfter', () => {
  const CONFIRMED_AT = new Date('2026-08-29T05:00:00.000Z').getTime();

  it('đếm NGƯỜI, không đếm file', () => {
    // Một em nộp hai file sau khi xác nhận là 1, không phải 2 — đếm file
    // sẽ thổi con số lên theo số deliverable của phiên.
    const rows = buildSubmissionRows(attendance(), [
      submission({ requiredDeliverableId: 'd1', submittedAt: '2026-08-29T05:01:00.000Z' }),
      submission({ requiredDeliverableId: 'd2', submittedAt: '2026-08-29T05:02:00.000Z' }),
    ]);

    expect(countStudentsSubmittingAfter(rows, CONFIRMED_AT)).toBe(1);
  });

  it('bỏ qua bài nộp trước mốc', () => {
    const rows = buildSubmissionRows(attendance(), [
      submission({ requiredDeliverableId: 'd1', submittedAt: '2026-08-29T04:59:00.000Z' }),
    ]);

    expect(countStudentsSubmittingAfter(rows, CONFIRMED_AT)).toBe(0);
  });

  it('một em nộp trước và một em nộp sau thì chỉ đếm em nộp sau', () => {
    const rows = buildSubmissionRows(attendance(), [
      submission({
        studentMssv: 'SV20120001',
        requiredDeliverableId: 'd1',
        submittedAt: '2026-08-29T04:00:00.000Z',
      }),
      submission({
        studentMssv: 'SV20120002',
        requiredDeliverableId: 'd1',
        submittedAt: '2026-08-29T05:30:00.000Z',
      }),
    ]);

    expect(countStudentsSubmittingAfter(rows, CONFIRMED_AT)).toBe(1);
  });
});

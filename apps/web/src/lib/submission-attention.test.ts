import { describe, expect, it } from 'vitest';
import {
  SUBMISSION_GRACE_MS,
  compareSessions,
  getAttentionReasons,
  getSessionPhase,
  groupByCourseClass,
  hasRatio,
} from './submission-attention';
import type { SessionOverviewItem } from './api/submissions';

const NOW = new Date('2026-09-03T10:00:00Z').getTime();
const HOUR = 3_600_000;

function make(overrides: Partial<SessionOverviewItem> = {}): SessionOverviewItem {
  return {
    id: 'session-1',
    name: 'Giữa kỳ #2',
    code: 'GK2',
    courseId: 'course-1',
    courseName: 'Nhập môn CSDL',
    classId: 'class-1',
    className: 'CINE',
    roomName: 'A3-01',
    examType: 'GK',
    // Mặc định: đã kết thúc từ 2 tiếng trước, ngoài grace.
    startTime: new Date(NOW - 4 * HOUR).toISOString(),
    endTime: new Date(NOW - 2 * HOUR).toISOString(),
    status: 'completed',
    requiredDeliverableCount: 3,
    expectedCount: 40,
    rosterKnown: true,
    fullySubmittedCount: 40,
    partialCount: 0,
    attendedNoSubmissionCount: 0,
    neverAttendedCount: 0,
    satElsewhereCount: 0,
    invalidFileCount: 0,
    matchedStudents: null,
    semesterId: 'sem-1',
    semesterName: 'Học kỳ 1 2026-2027',
    rubricId: null,
    rubricVersion: null,
    archivedAt: null,
    attentionClosedAt: null,
    ...overrides,
  };
}

describe('getSessionPhase', () => {
  it('draft và cancelled không bị đồng hồ ghi đè', () => {
    expect(getSessionPhase(make({ status: 'draft' }), NOW)).toBe('draft');
    expect(getSessionPhase(make({ status: 'cancelled' }), NOW)).toBe('cancelled');
  });

  it('chưa tới giờ là upcoming', () => {
    const item = make({
      status: 'scheduled',
      startTime: new Date(NOW + HOUR).toISOString(),
      endTime: new Date(NOW + 2 * HOUR).toISOString(),
    });
    expect(getSessionPhase(item, NOW)).toBe('upcoming');
  });

  it('đang trong giờ là running', () => {
    const item = make({
      status: 'active',
      startTime: new Date(NOW - HOUR).toISOString(),
      endTime: new Date(NOW + HOUR).toISOString(),
    });
    expect(getSessionPhase(item, NOW)).toBe('running');
  });

  it('vừa hết giờ, còn trong grace là collecting', () => {
    const item = make({
      status: 'completed',
      startTime: new Date(NOW - 2 * HOUR).toISOString(),
      endTime: new Date(NOW - 60_000).toISOString(),
    });
    expect(getSessionPhase(item, NOW)).toBe('collecting');
  });

  it('chốt tay trước endTime vẫn là collecting, KHÔNG phải running', () => {
    // FinalizeSessionButton đặt status='completed' ngay lúc bấm, có thể
    // trước endTime cả tiếng — spec §4.3.
    const item = make({
      status: 'completed',
      startTime: new Date(NOW - HOUR).toISOString(),
      endTime: new Date(NOW + HOUR).toISOString(),
    });
    expect(getSessionPhase(item, NOW)).toBe('collecting');
  });

  it('biên grace: đúng endTime + 30 phút vẫn collecting, thêm 1ms là ended', () => {
    const inside = make({ endTime: new Date(NOW - SUBMISSION_GRACE_MS).toISOString() });
    expect(getSessionPhase(inside, NOW)).toBe('collecting');

    const outside = make({ endTime: new Date(NOW - SUBMISSION_GRACE_MS - 1).toISOString() });
    expect(getSessionPhase(outside, NOW)).toBe('ended');
  });
});

describe('getAttentionReasons', () => {
  it('phiên đủ bài không có lý do nào', () => {
    expect(getAttentionReasons(make(), NOW)).toEqual([]);
  });

  it('ba mức đúng thứ tự ưu tiên: vào phòng mất bài, thiếu file, vắng thi', () => {
    const item = make({
      attendedNoSubmissionCount: 2,
      partialCount: 3,
      neverAttendedCount: 5,
      fullySubmittedCount: 30,
    });
    const reasons = getAttentionReasons(item, NOW);

    expect(reasons.map((r) => r.kind)).toEqual([
      'attended-no-submission', 'partial', 'never-attended',
    ]);
    expect(reasons.map((r) => r.priority)).toEqual([1, 2, 3]);
    expect(reasons[0].label).toBe('2 sinh viên vào phòng nhưng không có bài');
    expect(reasons[1].label).toBe('3 sinh viên nộp thiếu file');
    expect(reasons[2].label).toBe('5 sinh viên vắng thi');
    expect(reasons.map((r) => r.tone)).toEqual(['danger', 'warning', 'caution']);
  });

  it('phiên đã lưu trữ không bao giờ có lý do, dù số liệu xấu', () => {
    const item = make({
      archivedAt: '2026-09-01T00:00:00.000Z',
      attendedNoSubmissionCount: 9,
      fullySubmittedCount: 0,
    });
    expect(getAttentionReasons(item, NOW)).toEqual([]);
  });

  it('phiên đã khép không bao giờ có lý do, dù số liệu xấu', () => {
    const item = make({
      attentionClosedAt: '2026-09-01T00:00:00.000Z',
      attendedNoSubmissionCount: 9,
      fullySubmittedCount: 0,
    });
    expect(getAttentionReasons(item, NOW)).toEqual([]);
  });

  it('trong grace: không lý do nào, dù thiếu bài — báo động giả', () => {
    const item = make({
      endTime: new Date(NOW - 60_000).toISOString(),
      neverAttendedCount: 5,
      fullySubmittedCount: 35,
    });
    expect(getAttentionReasons(item, NOW)).toEqual([]);
  });

  it('rosterKnown false: không lý do nào', () => {
    const item = make({ rosterKnown: false, expectedCount: 3 });
    expect(getAttentionReasons(item, NOW)).toEqual([]);
  });

  it('requiredDeliverableCount 0: không lý do nào', () => {
    const item = make({ requiredDeliverableCount: 0, fullySubmittedCount: 0 });
    expect(getAttentionReasons(item, NOW)).toEqual([]);
  });

  it('draft và cancelled: không bao giờ có lý do', () => {
    const shape = { neverAttendedCount: 40, fullySubmittedCount: 0 };
    expect(getAttentionReasons(make({ status: 'draft', ...shape }), NOW)).toEqual([]);
    expect(getAttentionReasons(make({ status: 'cancelled', ...shape }), NOW)).toEqual([]);
  });

  it('invalidFileCount KHÔNG sinh lý do — nó đang ngủ', () => {
    const item = make({ invalidFileCount: 7, fullySubmittedCount: 40 });
    expect(getAttentionReasons(item, NOW)).toEqual([]);
  });
});

describe('hasRatio', () => {
  it('false khi không biết roster hoặc chưa khai file bắt buộc', () => {
    expect(hasRatio(make())).toBe(true);
    expect(hasRatio(make({ rosterKnown: false }))).toBe(false);
    expect(hasRatio(make({ requiredDeliverableCount: 0 }))).toBe(false);
  });
});

describe('compareSessions', () => {
  it('lý do gấp hơn xếp trước; cùng mức thì phiên mới hơn trước', () => {
    // Mức 1 (nghi mất bài) phải xếp trước mức 3 (vắng thi). invalidFileCount
    // không còn dùng được để dựng thứ hạng — nó đã thôi sinh lý do.
    const lost = make({ id: 'a', attendedNoSubmissionCount: 1, fullySubmittedCount: 39 });
    const absent = make({ id: 'b', neverAttendedCount: 1, fullySubmittedCount: 39 });
    const clean = make({ id: 'c' });
    const cleanOlder = make({
      id: 'd',
      startTime: new Date(NOW - 10 * HOUR).toISOString(),
    });

    const sorted = [clean, absent, cleanOlder, lost]
      .sort((x, y) => compareSessions(x, y, NOW))
      .map((s) => s.id);

    expect(sorted).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('groupByCourseClass', () => {
  it('gom theo môn + lớp, và ĐẾM cả phiên cần chú ý trong nhóm', () => {
    const items = [
      make({
        id: 'a',
        courseName: 'CSDL',
        className: 'N01',
        attendedNoSubmissionCount: 1,
        fullySubmittedCount: 39,
      }),
      make({ id: 'b', courseName: 'CSDL', className: 'N01' }),
      // courseId/classId phải đổi theo courseName/className: nhóm khoá theo
      // ID (khớp implementation, và đúng ngữ nghĩa — 2 môn trùng tên hiển thị
      // không được gộp), brief gốc quên đổi hai field này nên 3 phiên vẫn
      // cùng khoá 'course-1::class-1' và test sai (chỉ ra 1 nhóm, không phải 2).
      make({
        id: 'c',
        courseName: 'CTDL',
        className: 'N05',
        courseId: 'course-2',
        classId: 'class-2',
      }),
    ];

    const groups = groupByCourseClass(items, NOW);

    expect(groups).toHaveLength(2);
    const csdl = groups.find((g) => g.courseName === 'CSDL')!;
    // Phiên cần chú ý VẪN nằm trong nhóm gốc — spec §4.4, cố ý lặp.
    expect(csdl.sessions.map((s) => s.id)).toEqual(['a', 'b']);
    expect(csdl.attentionCount).toBe(1);
    expect(groups.find((g) => g.courseName === 'CTDL')!.attentionCount).toBe(0);
  });

  it('phiên không gắn lớp vào nhóm riêng của môn đó', () => {
    const groups = groupByCourseClass(
      [make({ id: 'a', className: null, classId: null, rosterKnown: false })],
      NOW,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].className).toBeNull();
  });
});

/**
 * Trước đây sinh viên thi bù ở phiên khác bị đếm vào neverAttendedCount và
 * hiện ra là "vắng thi" — vừa sai bản chất vừa tốn công: giảng viên đi truy
 * một người đã thi rồi. Backend tách sẵn con số; ở đây nó phải trở thành một
 * lý do riêng, và phải là lý do NHẸ nhất.
 */
describe('thi bù ở phiên khác', () => {
  it('là một lý do riêng, tách khỏi vắng thi', () => {
    const reasons = getAttentionReasons(
      make({ satElsewhereCount: 2, fullySubmittedCount: 38 }),
      NOW,
    );
    expect(reasons.map((r) => r.kind)).toEqual(['sat-elsewhere']);
    expect(reasons[0].count).toBe(2);
  });

  it('xếp sau mọi lý do thật — nó là thông tin, không phải lỗi', () => {
    const reasons = getAttentionReasons(
      make({
        attendedNoSubmissionCount: 1,
        partialCount: 1,
        neverAttendedCount: 1,
        satElsewhereCount: 1,
        fullySubmittedCount: 36,
      }),
      NOW,
    );
    expect(reasons[reasons.length - 1].kind).toBe('sat-elsewhere');
  });

  it('tone trung tính, không dùng màu cảnh báo', () => {
    const [reason] = getAttentionReasons(
      make({ satElsewhereCount: 1, fullySubmittedCount: 39 }),
      NOW,
    );
    expect(reason.tone).toBe('neutral');
  });

  it('vẫn im lặng trong grace period, như mọi lý do khác', () => {
    // Còn trong grace thì file đang bay về — kết luận lúc này là báo động giả.
    const inGrace = make({
      satElsewhereCount: 3,
      fullySubmittedCount: 37,
      endTime: new Date(NOW - 60_000).toISOString(),
    });
    expect(getAttentionReasons(inGrace, NOW)).toEqual([]);
  });

  it('không đẩy phiên chỉ-thi-bù lên trước phiên nghi mất bài', () => {
    const onlyMakeup = make({ id: 'makeup', satElsewhereCount: 5, fullySubmittedCount: 35 });
    const lostWork = make({ id: 'lost', attendedNoSubmissionCount: 1, fullySubmittedCount: 39 });
    expect(compareSessions(onlyMakeup, lostWork, NOW)).toBeGreaterThan(0);
  });
});

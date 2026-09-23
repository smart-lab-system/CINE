import { describe, expect, it } from 'vitest';
import {
  SUBMISSION_GRACE_MS,
  compareSessions,
  getAttentionReasons,
  getSessionPhase,
  groupByClass,
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
    archiveIssueCount: 0,
    matchedStudents: null,
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

  it('đọc collecting thẳng từ status, không suy từ đồng hồ', () => {
    // `endTime` còn ở TƯƠNG LAI mà status đã là `collecting` — đó là
    // "Chốt bài ngay". Suy từ đồng hồ sẽ trả 'running', tức nói sai hẳn
    // tình trạng của một phiên đã hết bài làm.
    const item = make({
      status: 'collecting',
      startTime: new Date(NOW - HOUR).toISOString(),
      endTime: new Date(NOW + HOUR).toISOString(),
    });
    expect(getSessionPhase(item, NOW)).toBe('collecting');
  });

  it('collecting vẫn là collecting kể cả khi đã quá grace', () => {
    // Cột status là nguồn sự thật, không phải đồng hồ. Lượt quét dự
    // phòng là thứ đưa phiên ra khỏi `collecting`; tới lúc nó chạy thì
    // màn hình phải nói đúng cái đang có trong DB.
    const item = make({
      status: 'collecting',
      endTime: new Date(NOW - SUBMISSION_GRACE_MS - HOUR).toISOString(),
    });
    expect(getSessionPhase(item, NOW)).toBe('collecting');
  });

  it('completed là Đã kết thúc, kể cả còn trong grace', () => {
    // ĐỔI CÓ CHỦ ĐÍCH ngày 2026-09-11. Trước đây `completed` + trong
    // grace suy ra 'collecting', vì `completed` là trạng thái hậu-thi
    // DUY NHẤT nên nó phải gánh cả hai nghĩa. Giờ `collecting` là trạng
    // thái thật, nên `completed` chỉ còn một nghĩa: đã có người chốt.
    const item = make({
      status: 'completed',
      startTime: new Date(NOW - 2 * HOUR).toISOString(),
      endTime: new Date(NOW - 60_000).toISOString(),
    });
    expect(getSessionPhase(item, NOW)).toBe('ended');
  });

  it('active mà đồng hồ đã qua endTime vẫn hiện collecting trong lúc chờ lượt quét', () => {
    // Lượt quét chạy mỗi 30 giây, nên có một quãng ngắn phiên còn
    // `active` dù đã hết giờ. Để nó hiện 'running' trong quãng đó là nói
    // sai; nhánh suy-từ-đồng-hồ tồn tại đúng cho ca này.
    const item = make({
      status: 'active',
      startTime: new Date(NOW - 2 * HOUR).toISOString(),
      endTime: new Date(NOW - 10_000).toISOString(),
    });
    expect(getSessionPhase(item, NOW)).toBe('collecting');
  });

  it('biên grace của nhánh suy-từ-đồng-hồ: đúng +30 phút vẫn collecting, thêm 1ms là ended', () => {
    const inside = make({
      status: 'active',
      endTime: new Date(NOW - SUBMISSION_GRACE_MS).toISOString(),
    });
    expect(getSessionPhase(inside, NOW)).toBe('collecting');

    const outside = make({
      status: 'active',
      endTime: new Date(NOW - SUBMISSION_GRACE_MS - 1).toISOString(),
    });
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

  it('đang thu bài: không lý do nào, dù thiếu bài — báo động giả', () => {
    // Nguyên tắc không đổi: còn đang thu bài thì kết luận là báo động
    // giả. Cái đổi là trạng thái biểu đạt nó — trước 2026-09-11 phải suy
    // từ `completed` + grace period, giờ `collecting` nói thẳng.
    const item = make({
      status: 'collecting',
      endTime: new Date(NOW - 60_000).toISOString(),
      neverAttendedCount: 5,
      fullySubmittedCount: 35,
    });
    expect(getAttentionReasons(item, NOW)).toEqual([]);
  });

  it('active mà đã qua endTime cũng im lặng — lượt quét chưa kịp tick', () => {
    const item = make({
      status: 'active',
      endTime: new Date(NOW - 10_000).toISOString(),
      neverAttendedCount: 5,
      fullySubmittedCount: 35,
    });
    expect(getAttentionReasons(item, NOW)).toEqual([]);
  });

  it('giảng viên đã xác nhận kết thúc: kết luận ĐƯỢC phép, kể cả còn trong grace', () => {
    // ĐỔI CÓ CHỦ ĐÍCH ngày 2026-09-11. Trước đây `completed` trong grace
    // vẫn im lặng, vì `completed` khi đó cũng có nghĩa "vừa hết giờ".
    //
    // Giờ tới được `completed` trong grace chỉ có một đường: một người
    // đã bấm "Xác nhận kết thúc" — lượt quét dự phòng chỉ chạy SAU grace
    // nên không tạo ra được trạng thái này. Người đó vừa nhìn khắp
    // phòng, và đó chính là lúc kết luận trở nên đáng tin (spec §8.1).
    //
    // Đánh đổi đi kèm: một em đang upload file lớn có thể bị kể tên vài
    // giây trước khi bài về. Spec §7.3 trả lời ca đó bằng dòng "có N
    // sinh viên nộp bài sau khi bạn xác nhận kết thúc", chứ không bằng
    // cách im lặng thêm 30 phút nữa.
    const item = make({
      status: 'completed',
      endTime: new Date(NOW - 60_000).toISOString(),
      neverAttendedCount: 5,
      fullySubmittedCount: 35,
    });
    expect(getAttentionReasons(item, NOW).map((r) => r.kind)).toEqual(['never-attended']);
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

  it('invalidFileCount KHÔNG sinh lý do — NGHỈ HƯU (spec §8.2), không phải việc còn dở', () => {
    const item = make({ invalidFileCount: 7, fullySubmittedCount: 40 });
    expect(getAttentionReasons(item, NOW)).toEqual([]);
  });

  it('archiveIssueCount SINH lý do — kết luận về nội dung file nén đi qua đây, không qua invalidFileCount', () => {
    const item = make({ archiveIssueCount: 3, fullySubmittedCount: 40 });
    expect(getAttentionReasons(item, NOW)).toEqual([
      {
        kind: 'archive-issue',
        count: 3,
        label: '3 bài nén thiếu nội dung bên trong',
        tone: 'warning',
        priority: 2,
      },
    ]);
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

describe('groupByClass', () => {
  it('gom theo LỚP, và ĐẾM cả phiên cần chú ý trong nhóm', () => {
    const items = [
      make({
        id: 'a',
        className: 'N01',
        attendedNoSubmissionCount: 1,
        fullySubmittedCount: 39,
      }),
      make({ id: 'b', className: 'N01' }),
      // Khoá là `classId`, KHÔNG phải tên lớp: hai lớp trùng tên hiển thị
      // vẫn phải là hai nhóm, nếu không thì hai lớp khác nhau bị trộn bài.
      make({ id: 'c', className: 'N05', classId: 'class-2' }),
    ];

    const groups = groupByClass(items, NOW);

    expect(groups).toHaveLength(2);
    const n01 = groups.find((g) => g.className === 'N01')!;
    // Phiên cần chú ý VẪN nằm trong nhóm gốc — spec §4.4, cố ý lặp.
    expect(n01.sessions.map((s) => s.id)).toEqual(['a', 'b']);
    expect(n01.attentionCount).toBe(1);
    expect(groups.find((g) => g.className === 'N05')!.attentionCount).toBe(0);
  });

  it('hai lớp KHÁC tên nhưng cùng môn vẫn là hai nhóm', () => {
    // Tầng "môn" đã bỏ khỏi khoá gộp. Test này khoá lại điều đó: nếu ai đó
    // đưa `courseName` trở lại khoá thì hai lớp cùng môn sẽ dính làm một.
    const groups = groupByClass(
      [
        make({ id: 'a', className: 'N01', classId: 'class-1' }),
        make({ id: 'b', className: 'N02', classId: 'class-2' }),
      ],
      NOW,
    );
    expect(groups).toHaveLength(2);
  });

  it('phiên không gắn lớp vào nhóm riêng', () => {
    const groups = groupByClass(
      [make({ id: 'a', className: null, classId: 'k-none', rosterKnown: false })],
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

  it('vẫn im lặng khi phiên đang thu bài, như mọi lý do khác', () => {
    // Còn đang thu bài thì file đang bay về — kết luận lúc này là báo
    // động giả.
    const collecting = make({
      status: 'collecting',
      satElsewhereCount: 3,
      fullySubmittedCount: 37,
      endTime: new Date(NOW - 60_000).toISOString(),
    });
    expect(getAttentionReasons(collecting, NOW)).toEqual([]);
  });

  it('không đẩy phiên chỉ-thi-bù lên trước phiên nghi mất bài', () => {
    const onlyMakeup = make({ id: 'makeup', satElsewhereCount: 5, fullySubmittedCount: 35 });
    const lostWork = make({ id: 'lost', attendedNoSubmissionCount: 1, fullySubmittedCount: 39 });
    expect(compareSessions(onlyMakeup, lostWork, NOW)).toBeGreaterThan(0);
  });
});

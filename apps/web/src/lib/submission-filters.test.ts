import { describe, expect, it } from 'vitest';
import {
  EMPTY_FILTERS, applyFilters, buildFacets, detectRoomFailure,
} from './submission-filters';
import type { SessionOverviewItem } from './api/submissions';

const NOW = new Date('2026-09-05T10:00:00Z').getTime();
const HOUR = 3_600_000;

function make(o: Partial<SessionOverviewItem> = {}): SessionOverviewItem {
  return {
    id: 's1', name: 'Phiên', code: 'P1',
    courseName: 'CSDL', classId: 'k1', className: 'N01',
    roomName: 'A3-01', examType: 'GK',
    startTime: new Date(NOW - 4 * HOUR).toISOString(),
    endTime: new Date(NOW - 2 * HOUR).toISOString(),
    status: 'completed',
    semesterName: 'Học kỳ 1 2026-2027',
    requiredDeliverableCount: 2, expectedCount: 10, rosterKnown: true,
    fullySubmittedCount: 10, partialCount: 0,
    attendedNoSubmissionCount: 0, neverAttendedCount: 0, satElsewhereCount: 0,
    invalidFileCount: 0, matchedStudents: null,
    rubricId: null,
    rubricVersion: null,
    archivedAt: null, attentionClosedAt: null,
    ...o,
  };
}

describe('applyFilters', () => {
  const base = [
    make({ id: 'a', roomName: 'A3-01', examType: 'GK', neverAttendedCount: 2, fullySubmittedCount: 8 }),
    make({ id: 'b', roomName: 'A3-02', examType: 'CK', attendedNoSubmissionCount: 1, fullySubmittedCount: 9 }),
    make({ id: 'c', roomName: 'A3-01', examType: 'GK' }),
    make({ id: 'd', roomName: 'A3-01', examType: 'TK', archivedAt: '2026-09-01T00:00:00.000Z' }),
    make({ id: 'e', roomName: 'A3-02', examType: 'TK', attentionClosedAt: '2026-09-01T00:00:00.000Z' }),
  ];

  it('mặc định: ẩn archived, HIỆN closed', () => {
    const ids = applyFilters(base, EMPTY_FILTERS, NOW).map((i) => i.id);
    expect(ids).not.toContain('d');
    expect(ids).toContain('e');
  });

  it('showArchived bật thì archived hiện lại', () => {
    const ids = applyFilters(base, { ...EMPTY_FILTERS, showArchived: true }, NOW).map((i) => i.id);
    expect(ids).toContain('d');
  });

  it('archived thắng closed: phiên vừa archived vừa closed vẫn bị ẩn', () => {
    const both = make({
      id: 'f', archivedAt: '2026-09-01T00:00:00.000Z',
      attentionClosedAt: '2026-09-01T00:00:00.000Z',
    });
    const ids = applyFilters([both], { ...EMPTY_FILTERS, showClosed: true }, NOW).map((i) => i.id);
    expect(ids).toEqual([]);
  });

  it('trong một nhóm là OR: hai phòng cùng lúc', () => {
    const ids = applyFilters(base, { ...EMPTY_FILTERS, rooms: ['A3-01', 'A3-02'] }, NOW)
      .map((i) => i.id);
    expect(ids.sort()).toEqual(['a', 'b', 'c', 'e']);
  });

  it('giữa các nhóm là AND: phòng A3-01 VÀ loại GK', () => {
    const ids = applyFilters(base, { ...EMPTY_FILTERS, rooms: ['A3-01'], examTypes: ['GK'] }, NOW)
      .map((i) => i.id);
    expect(ids.sort()).toEqual(['a', 'c']);
  });

  it('lọc theo mức độ dùng lý do thật, không dùng con số thô', () => {
    const ids = applyFilters(base, { ...EMPTY_FILTERS, kinds: ['attended-no-submission'] }, NOW)
      .map((i) => i.id);
    expect(ids).toEqual(['b']);
  });

  it('lọc "đã đủ" lấy phiên ended không lý do nào', () => {
    const ids = applyFilters(base, { ...EMPTY_FILTERS, complete: true }, NOW).map((i) => i.id);
    expect(ids).toContain('c');
    expect(ids).not.toContain('a');
  });
});

describe('buildFacets', () => {
  const base = [
    make({ id: 'a', roomName: 'A3-01', examType: 'GK', neverAttendedCount: 2, fullySubmittedCount: 8 }),
    make({ id: 'b', roomName: 'A3-02', examType: 'CK', partialCount: 1, fullySubmittedCount: 9 }),
  ];

  it('số đếm phản ánh các bộ lọc KHÁC đang bật', () => {
    const facets = buildFacets(base, { ...EMPTY_FILTERS, rooms: ['A3-01'] }, NOW);
    const partial = facets.kinds.find((k) => k.value === 'partial');
    expect(partial?.count).toBe(0);
    const never = facets.kinds.find((k) => k.value === 'never-attended');
    expect(never?.count).toBe(1);
  });

  it('số đếm của chính nhóm phòng KHÔNG bị chính nó thu hẹp', () => {
    // Nếu không, bật A3-01 sẽ làm A3-02 về 0 và không bao giờ chọn thêm được.
    const facets = buildFacets(base, { ...EMPTY_FILTERS, rooms: ['A3-01'] }, NOW);
    expect(facets.rooms.find((r) => r.value === 'A3-02')?.count).toBe(1);
  });

  it('nhóm chỉ có 1 giá trị trả về mảng rỗng để UI không render', () => {
    const one = [make({ id: 'x', roomName: 'A3-01' }), make({ id: 'y', roomName: 'A3-01' })];
    expect(buildFacets(one, EMPTY_FILTERS, NOW).rooms).toEqual([]);
  });
});

describe('lọc theo LỚP', () => {
  // Fixture riêng: mọi item trong `base` đều dùng chung `classId: 'k1'`,
  // nên nó không tách được gì để thử.
  const byClass = [
    make({ id: 'a', classId: 'k1', className: 'N01' }),
    make({ id: 'b', classId: 'k2', className: 'N02' }),
    make({ id: 'c', classId: 'k2', className: 'N02' }),
  ];

  it('chọn một lớp thì phiên của lớp khác rơi ra', () => {
    const ids = applyFilters(byClass, { ...EMPTY_FILTERS, classIds: ['k2'] }, NOW)
      .map((i) => i.id);
    expect(ids.sort()).toEqual(['b', 'c']);
  });

  it('trong một nhóm là OR: hai lớp cùng lúc', () => {
    const ids = applyFilters(byClass, { ...EMPTY_FILTERS, classIds: ['k1', 'k2'] }, NOW)
      .map((i) => i.id);
    expect(ids.sort()).toEqual(['a', 'b', 'c']);
  });

  it('lọc theo ID chứ không theo TÊN: hai lớp TRÙNG TÊN vẫn tách nhau', () => {
    // Đây là lý do nhóm này khoá theo `classId`. Nếu ai đó đổi sang khoá
    // theo `className` cho "dễ đọc", hai lớp khác nhau sẽ bị trộn bài.
    const sameName = [
      make({ id: 'x', classId: 'k1', className: 'N01' }),
      make({ id: 'y', classId: 'k9', className: 'N01' }),
    ];
    const ids = applyFilters(sameName, { ...EMPTY_FILTERS, classIds: ['k1'] }, NOW)
      .map((i) => i.id);
    expect(ids).toEqual(['x']);
  });

  it('giữa các nhóm là AND: lớp k2 VÀ phòng A3-02', () => {
    const mixed = [
      make({ id: 'a', classId: 'k2', roomName: 'A3-01' }),
      make({ id: 'b', classId: 'k2', roomName: 'A3-02' }),
      make({ id: 'c', classId: 'k1', roomName: 'A3-02' }),
    ];
    const ids = applyFilters(
      mixed,
      { ...EMPTY_FILTERS, classIds: ['k2'], rooms: ['A3-02'] },
      NOW,
    ).map((i) => i.id);
    expect(ids).toEqual(['b']);
  });

  it('số đếm của chính nhóm lớp KHÔNG bị chính nó thu hẹp', () => {
    // Nếu không, bật N01 sẽ làm N02 về 0 và không bao giờ chọn thêm được.
    const facets = buildFacets(byClass, { ...EMPTY_FILTERS, classIds: ['k1'] }, NOW);
    expect(facets.classes.find((k) => k.value === 'k2')?.count).toBe(2);
  });

  it('nhãn là TÊN lớp, khoá là id', () => {
    const facets = buildFacets(byClass, EMPTY_FILTERS, NOW);
    expect(facets.classes.find((k) => k.value === 'k1')?.label).toBe('N01');
  });

  it('chỉ một lớp thì trả mảng rỗng để UI không render', () => {
    const one = [make({ id: 'x', classId: 'k1' }), make({ id: 'y', classId: 'k1' })];
    expect(buildFacets(one, EMPTY_FILTERS, NOW).classes).toEqual([]);
  });
});

describe('detectRoomFailure', () => {
  // Mẫu số là LỚP, không còn là môn. Bản cũ dựng hai `courseName` khác nhau
  // để làm cảnh báo nổ — một trạng thái dữ liệu không còn tồn tại được từ
  // khi hệ thống chốt phục vụ một môn, nên test cũ xanh trong khi hàm thật
  // luôn trả `null` và banner không bao giờ hiện.
  const red = (id: string, room: string, classId: string) =>
    make({ id, roomName: room, classId, attendedNoSubmissionCount: 2, fullySubmittedCount: 8 });

  it('2 phiên đỏ cùng phòng, khác LỚP → cảnh báo', () => {
    const r = detectRoomFailure([red('a', 'A3-01', 'k1'), red('b', 'A3-01', 'k2')], NOW);
    expect(r).toEqual({ room: 'A3-01', sessionCount: 2, classCount: 2 });
  });

  it('chỉ 1 phiên đỏ → KHÔNG cảnh báo', () => {
    expect(detectRoomFailure([red('a', 'A3-01', 'k1')], NOW)).toBeNull();
  });

  it('2 phiên đỏ cùng phòng nhưng CÙNG lớp → KHÔNG cảnh báo', () => {
    // Một lớp thi nhiều ca ở phòng cố định của nó: thứ chung là cái lớp,
    // không phải cái phòng.
    expect(detectRoomFailure([red('a', 'A3-01', 'k1'), red('b', 'A3-01', 'k1')], NOW)).toBeNull();
  });

  it('phiên đỏ ở hai phòng khác nhau → KHÔNG cảnh báo', () => {
    expect(detectRoomFailure([red('a', 'A3-01', 'k1'), red('b', 'B1-05', 'k2')], NOW)).toBeNull();
  });
});

describe('lọc theo "thi bù ở phiên khác"', () => {
  it('là một facet chọn được, không bị gộp vào vắng thi', () => {
    const items = [
      make({ id: 'a', satElsewhereCount: 2, fullySubmittedCount: 8 }),
      make({ id: 'b', neverAttendedCount: 2, fullySubmittedCount: 8 }),
    ];
    const facets = buildFacets(items, EMPTY_FILTERS, NOW);
    expect(facets.kinds.find((k) => k.value === 'sat-elsewhere')?.count).toBe(1);

    const ids = applyFilters(items, { ...EMPTY_FILTERS, kinds: ['sat-elsewhere'] }, NOW)
      .map((i) => i.id);
    expect(ids).toEqual(['a']);
  });
});

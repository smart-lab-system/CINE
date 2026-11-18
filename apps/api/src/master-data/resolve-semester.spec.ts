import {
  matchesResolvedSemester,
  resolveSemester,
  toVnCalendarDate,
  type SemesterRange,
} from './resolve-semester';

const HK1: SemesterRange = {
  id: 'hk1',
  startDate: '2026-08-15',
  endDate: '2026-12-31',
  status: 'active',
};
const HK2: SemesterRange = {
  id: 'hk2',
  startDate: '2027-01-01',
  endDate: '2027-05-31',
  status: 'planned',
};

describe('toVnCalendarDate', () => {
  it('cắt ngày theo Asia/Ho_Chi_Minh', () => {
    // 2026-08-14 17:00 UTC = 2026-08-15 00:00 VN
    expect(toVnCalendarDate('2026-08-14T17:00:00.000Z')).toBe('2026-08-15');
  });
});

describe('resolveSemester', () => {
  it('ưu tiên createdAt trong khoảng', () => {
    expect(
      resolveSemester(
        '2026-09-01T03:00:00.000Z',
        '2027-02-01T03:00:00.000Z',
        [HK1, HK2],
      )?.id,
    ).toBe('hk1');
  });

  it('dùng updatedAt khi createdAt ngoài mọi kỳ', () => {
    expect(
      resolveSemester(
        '2026-07-01T03:00:00.000Z',
        '2027-02-10T03:00:00.000Z',
        [HK1, HK2],
      )?.id,
    ).toBe('hk2');
  });

  it('ngoài mọi kỳ → gần nhất theo createdAt', () => {
    // 2026-07-01 gần HK1 (start 08-15) hơn HK2
    expect(
      resolveSemester(
        '2026-07-01T03:00:00.000Z',
        '2026-07-01T03:00:00.000Z',
        [HK1, HK2],
      )?.id,
    ).toBe('hk1');
  });

  it('sau HK2 → HK2', () => {
    expect(
      resolveSemester(
        '2027-08-01T03:00:00.000Z',
        '2027-08-01T03:00:00.000Z',
        [HK1, HK2],
      )?.id,
    ).toBe('hk2');
  });

  it('rỗng → null', () => {
    expect(resolveSemester(new Date(), new Date(), [])).toBeNull();
  });

  it('matchesResolvedSemester', () => {
    expect(
      matchesResolvedSemester(
        '2026-09-01T03:00:00.000Z',
        '2026-09-01T03:00:00.000Z',
        'hk1',
        [HK1, HK2],
      ),
    ).toBe(true);
    expect(
      matchesResolvedSemester(
        '2026-09-01T03:00:00.000Z',
        '2026-09-01T03:00:00.000Z',
        'hk2',
        [HK1, HK2],
      ),
    ).toBe(false);
  });
});

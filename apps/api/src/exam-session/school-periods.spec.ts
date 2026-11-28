import {
  examScheduleCoherenceError,
  formatPeriodClock,
  getSchoolPeriod,
  isValidSchoolPeriod,
  SCHOOL_PERIODS,
} from './school-periods';

describe('school-periods', () => {
  it('có đúng 16 tiết', () => {
    expect(SCHOOL_PERIODS).toHaveLength(16);
    expect(SCHOOL_PERIODS[0].period).toBe(1);
    expect(SCHOOL_PERIODS[15].period).toBe(16);
  });

  it('mỗi tiết dài 50 phút', () => {
    for (const row of SCHOOL_PERIODS) {
      expect(row.endMinutes - row.startMinutes).toBe(50);
    }
  });

  it('tiết 1 bắt đầu 6h30, tiết 16 kết thúc 21h30', () => {
    expect(getSchoolPeriod(1)?.startMinutes).toBe(6 * 60 + 30);
    expect(getSchoolPeriod(16)?.endMinutes).toBe(21 * 60 + 30);
  });

  it('isValidSchoolPeriod chỉ nhận 1-16 nguyên', () => {
    expect(isValidSchoolPeriod(1)).toBe(true);
    expect(isValidSchoolPeriod(16)).toBe(true);
    expect(isValidSchoolPeriod(0)).toBe(false);
    expect(isValidSchoolPeriod(17)).toBe(false);
    expect(isValidSchoolPeriod(1.5)).toBe(false);
  });

  it('formatPeriodClock', () => {
    expect(formatPeriodClock(6 * 60 + 30)).toBe('6h30');
    expect(formatPeriodClock(9 * 60)).toBe('9h00');
  });

  it('examScheduleCoherenceError chấp nhận cửa sổ khớp duration + tiết phủ', () => {
    const start = new Date('2027-01-15T01:00:00.000Z');
    const end = new Date(start.getTime() + 90 * 60_000);
    expect(
      examScheduleCoherenceError(start, end, 1, 2, 90),
    ).toBeNull();
  });

  it('examScheduleCoherenceError từ chối duration lệch cửa sổ', () => {
    const start = new Date('2027-01-15T01:00:00.000Z');
    const end = new Date(start.getTime() + 60 * 60_000);
    expect(examScheduleCoherenceError(start, end, 1, 2, 90)).toMatch(
      /không khớp/,
    );
  });

  it('examScheduleCoherenceError từ chối tiết kết thúc hẹp hơn duration', () => {
    const start = new Date('2027-01-15T01:00:00.000Z');
    const end = new Date(start.getTime() + 90 * 60_000);
    expect(examScheduleCoherenceError(start, end, 1, 1, 90)).toMatch(
      /kết thúc sớm/,
    );
  });
});

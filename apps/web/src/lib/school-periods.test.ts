import { describe, expect, it } from 'vitest';
import {
  inferDurationMinutes,
  inferPeriodsFromLocal,
  periodSelectLabel,
  scheduleFromPeriodsAndDuration,
  scheduleFromStartAndDuration,
  SCHOOL_PERIODS,
} from './school-periods';

describe('school-periods', () => {
  it('map tiết 1 + 90 phút → 6h30 - 8h00, tiết kết thúc tối thiểu 2', () => {
    const mapped = scheduleFromStartAndDuration('2027-01-15', 1, 90);
    expect(mapped).toEqual({
      startLocal: '2027-01-15T06:30',
      endLocal: '2027-01-15T08:00',
      endPeriod: 2,
    });
  });

  it('tiết 1-3 + 90 phút hợp lệ (khung phủ giờ thi)', () => {
    const mapped = scheduleFromPeriodsAndDuration('2027-01-15', 1, 3, 90);
    expect(mapped).toEqual({
      startLocal: '2027-01-15T06:30',
      endLocal: '2027-01-15T08:00',
    });
  });

  it('từ chối tiết kết thúc hẹp hơn duration', () => {
    // 90 phút cần tới tiết 2; chỉ chọn tiết 1 → null
    expect(scheduleFromPeriodsAndDuration('2027-01-15', 1, 1, 90)).toBeNull();
  });

  it('map tiết 1 + 45 phút → 6h30 - 7h15', () => {
    const mapped = scheduleFromStartAndDuration('2027-01-15', 1, 45);
    expect(mapped?.startLocal).toBe('2027-01-15T06:30');
    expect(mapped?.endLocal).toBe('2027-01-15T07:15');
    expect(mapped?.endPeriod).toBe(1);
  });

  it('từ chối duration kéo quá 21h30', () => {
    expect(scheduleFromStartAndDuration('2027-01-15', 16, 90)).toBeNull();
  });

  it('inferDurationMinutes khớp 45/60/75/90', () => {
    expect(inferDurationMinutes('2027-01-15T06:30', '2027-01-15T08:00')).toBe(90);
    expect(inferDurationMinutes('2027-01-15T06:30', '2027-01-15T07:00')).toBeNull();
  });

  it('inferPeriodsFromLocal khớp bảng tiết', () => {
    expect(inferPeriodsFromLocal('2027-01-15T06:30', '2027-01-15T09:00')).toEqual({
      examDate: '2027-01-15',
      startPeriod: 1,
      endPeriod: 3,
    });
  });

  it('periodSelectLabel có khoảng giờ', () => {
    expect(periodSelectLabel(1)).toContain('Tiết 1');
    expect(periodSelectLabel(1)).toContain('6h30');
  });

  it('16 tiết mỗi cái 50 phút', () => {
    expect(SCHOOL_PERIODS).toHaveLength(16);
    for (const row of SCHOOL_PERIODS) {
      expect(row.endMinutes - row.startMinutes).toBe(50);
    }
  });
});

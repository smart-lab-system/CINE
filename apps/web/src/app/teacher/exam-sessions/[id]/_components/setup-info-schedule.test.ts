import { describe, expect, it } from 'vitest';
import {
  infoDraftFromSession,
  infoDraftToLocalRange,
  scheduleFromStartTimeAndDuration,
} from './setup-info-schedule';

describe('scheduleFromStartTimeAndDuration', () => {
  it('tính endLocal từ giờ tường + thời lượng', () => {
    expect(scheduleFromStartTimeAndDuration('2027-01-15', '07:05', 90)).toEqual({
      startLocal: '2027-01-15T07:05',
      endLocal: '2027-01-15T08:35',
    });
  });

  it('từ chối giờ hoặc ngày không hợp lệ', () => {
    expect(scheduleFromStartTimeAndDuration('2027-1-15', '07:05', 90)).toBeNull();
    expect(scheduleFromStartTimeAndDuration('2027-01-15', '7:05', 90)).toBeNull();
    expect(scheduleFromStartTimeAndDuration('2027-01-15', '07:05', 0)).toBeNull();
  });
});

describe('infoDraftToLocalRange', () => {
  it('ưu tiên giờ tường và bỏ qua tiết bắt đầu', () => {
    const range = infoDraftToLocalRange({
      examType: 'TK',
      roomId: 'room-1',
      examDate: '2027-01-15',
      startTimeOfDay: '07:05',
      startPeriod: 0,
      endPeriod: 0,
      durationMinutes: 60,
    });
    expect(range).toEqual({
      startLocal: '2027-01-15T07:05',
      endLocal: '2027-01-15T08:05',
    });
  });
});

describe('infoDraftFromSession', () => {
  it('điền giờ tường khi startTime lệch khỏi đầu tiết', () => {
    const draft = infoDraftFromSession({
      examType: 'TK',
      roomId: 'room-1',
      startTime: '2027-01-15T07:05:00',
      endTime: '2027-01-15T08:35:00',
      startPeriod: 1,
      endPeriod: 3,
      durationMinutes: 90,
    });
    expect(draft.startTimeOfDay).toBe('07:05');
    expect(draft.startPeriod).toBe(1);
  });

  it('không điền giờ tường khi khớp đầu tiết', () => {
    const draft = infoDraftFromSession({
      examType: 'TK',
      roomId: 'room-1',
      startTime: '2027-01-15T06:30:00',
      endTime: '2027-01-15T08:00:00',
      startPeriod: 1,
      endPeriod: 3,
      durationMinutes: 90,
    });
    expect(draft.startTimeOfDay).toBe('');
  });
});

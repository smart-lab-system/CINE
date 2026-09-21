import { describe, expect, it } from 'vitest';
import {
  findGapViolations,
  shiftOf,
  startOfWeek,
  weekDays,
  weekRange,
} from './exam-calendar';

/** Giờ ĐỊA PHƯƠNG — `shiftOf` đọc `getHours()`, nên fixture phải dựng theo giờ máy. */
function localIso(y: number, m: number, d: number, h: number, min = 0): string {
  return new Date(y, m - 1, d, h, min, 0, 0).toISOString();
}

describe('startOfWeek', () => {
  // 2026-09-21 là thứ Hai; 22..27 là Ba..Chủ nhật.
  it.each([
    ['thứ Hai', 21],
    ['thứ Ba', 22],
    ['thứ Tư', 23],
    ['thứ Năm', 24],
    ['thứ Sáu', 25],
    ['thứ Bảy', 26],
  ])('từ %s vẫn ra thứ Hai 21/09', (_label, day) => {
    const monday = startOfWeek(new Date(2026, 8, day, 15, 30));
    expect(monday.getDate()).toBe(21);
    expect(monday.getDay()).toBe(1);
    expect(monday.getHours()).toBe(0);
  });

  /**
   * Ca lệch-một-ngày kinh điển: `getDay()` trả 0 cho Chủ nhật, nên phép lùi
   * ngây thơ `d - getDay()` sẽ nhảy sang thứ Hai của tuần SAU. Chỉ lộ ra vào
   * đúng Chủ nhật, tức một ngày trong bảy.
   */
  it('Chủ nhật 27/09 thuộc về tuần bắt đầu 21/09, KHÔNG phải 28/09', () => {
    const monday = startOfWeek(new Date(2026, 8, 27, 23, 59));
    expect(monday.getDate()).toBe(21);
  });
});

describe('weekDays', () => {
  it('trả đúng 7 ngày liên tiếp từ thứ Hai', () => {
    const days = weekDays(startOfWeek(new Date(2026, 8, 23)));
    expect(days).toHaveLength(7);
    expect(days.map((d) => d.getDate())).toEqual([21, 22, 23, 24, 25, 26, 27]);
  });
});

describe('weekRange', () => {
  it('nửa mở: `to` là thứ Hai kế, nên phiên 00:00 thứ Hai thuộc tuần MỚI', () => {
    const monday = startOfWeek(new Date(2026, 8, 23));
    const { from, to } = weekRange(monday);
    expect(new Date(to).getTime() - new Date(from).getTime()).toBe(7 * 24 * 60 * 60 * 1000);
    expect(new Date(to).getDate()).toBe(28);
  });
});

describe('shiftOf', () => {
  it.each([
    [0, 'morning'],
    [7, 'morning'],
    [11, 'morning'],
    [12, 'afternoon'],
    [17, 'afternoon'],
    [18, 'evening'],
    [23, 'evening'],
  ])('%i giờ -> %s', (hour, expected) => {
    expect(shiftOf(localIso(2026, 9, 21, hour))).toBe(expected);
  });

  it('phiên vắt qua trưa nằm ở ca BẮT ĐẦU, không phải cả hai', () => {
    // 11:00–13:00 là ca Sáng. Hiện ở hai ô sẽ làm giảng viên đếm nhầm số ca.
    expect(shiftOf(localIso(2026, 9, 21, 11))).toBe('morning');
  });
});

describe('findGapViolations', () => {
  const base = (id: string, startH: number, startM: number, endH: number, endM: number) => ({
    id,
    startTime: localIso(2026, 9, 21, startH, startM),
    endTime: localIso(2026, 9, 21, endH, endM),
    status: 'scheduled',
  });

  it('khe đúng 30 phút KHÔNG bị báo — cùng biên với ràng buộc DB', () => {
    const found = findGapViolations([base('a', 8, 0, 10, 0), base('b', 10, 30, 12, 0)]);
    expect(found.size).toBe(0);
  });

  it('khe 15 phút bị báo, kèm đúng số phút', () => {
    const found = findGapViolations([base('a', 8, 0, 10, 0), base('b', 10, 15, 12, 0)]);
    expect(found.get('b')).toBe(15);
  });

  it('chồng giờ kẹp về 0, không trả số âm', () => {
    const found = findGapViolations([base('a', 8, 0, 10, 0), base('b', 9, 0, 11, 0)]);
    expect(found.get('b')).toBe(0);
  });

  it('không phụ thuộc thứ tự đầu vào', () => {
    const found = findGapViolations([base('b', 10, 15, 12, 0), base('a', 8, 0, 10, 0)]);
    expect(found.get('b')).toBe(15);
    expect(found.has('a')).toBe(false);
  });

  it.each(['cancelled', 'completed', 'collecting'])(
    'phiên %s đã nhả chỗ nên không kéo theo cảnh báo',
    (status) => {
      const found = findGapViolations([
        { ...base('a', 8, 0, 10, 0), status },
        base('b', 10, 15, 12, 0),
      ]);
      expect(found.size).toBe(0);
    },
  );
});

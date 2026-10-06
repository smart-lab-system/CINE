import { describe, expect, it } from 'vitest';
import {
  AUDIT_GROUP_PREFIXES,
  EMPTY_AUDIT_FILTERS,
  dayRangeProblem,
  dayRangeToIso,
  hasActiveFilters,
  toSearchParams,
} from './audit-filters';

describe('AUDIT_GROUP_PREFIXES', () => {
  it('nhóm "dữ liệu nền" phủ đủ bốn loại đối tượng admin quản lý', () => {
    expect(AUDIT_GROUP_PREFIXES.master).toEqual([
      'semester.',
      'room.',
      'class.',
      'administrative_class.',
    ]);
  });

  it('mọi tiền tố kết thúc bằng dấu chấm (nếu không API coi là khớp chính xác)', () => {
    for (const prefixes of Object.values(AUDIT_GROUP_PREFIXES)) {
      for (const prefix of prefixes) expect(prefix.endsWith('.')).toBe(true);
    }
  });
});

describe('dayRangeToIso', () => {
  it('chặn dưới là 00:00 giờ địa phương của ngày bắt đầu', () => {
    const { from } = dayRangeToIso('2026-10-01', '');
    expect(new Date(from!).getTime()).toBe(new Date(2026, 9, 1).getTime());
  });

  it('chặn trên là 00:00 của NGÀY SAU ngày kết thúc, để ngày kết thúc được tính trọn', () => {
    const { to } = dayRangeToIso('', '2026-10-03');
    expect(new Date(to!).getTime()).toBe(new Date(2026, 9, 4).getTime());
  });

  it('qua ranh giới tháng và năm', () => {
    expect(new Date(dayRangeToIso('', '2026-12-31').to!).getTime()).toBe(new Date(2027, 0, 1).getTime());
    expect(new Date(dayRangeToIso('', '2026-02-28').to!).getTime()).toBe(new Date(2026, 2, 1).getTime());
  });

  it('ô trống hoặc sai định dạng thì bỏ đầu đó, không ném', () => {
    expect(dayRangeToIso('', '')).toEqual({});
    expect(dayRangeToIso('hôm qua', '2026-13-45')).toEqual({});
  });
});

describe('toSearchParams', () => {
  it('bộ lọc rỗng chỉ có phân trang', () => {
    expect(toSearchParams(EMPTY_AUDIT_FILTERS, 1, 50)).toEqual({ page: 1, pageSize: 50 });
  });

  it('nhóm được dịch thành danh sách tiền tố, "all" thì không có action', () => {
    expect(toSearchParams({ ...EMPTY_AUDIT_FILTERS, group: 'session' }, 2, 50)).toEqual({
      action: ['exam_session.'],
      page: 2,
      pageSize: 50,
    });
    expect(toSearchParams({ ...EMPTY_AUDIT_FILTERS, group: 'all' }, 1, 50).action).toBeUndefined();
  });

  it('người thực hiện và khoảng ngày đi vào tham số', () => {
    const params = toSearchParams(
      { group: 'all', actorId: 'abc', fromDay: '2026-10-01', toDay: '2026-10-03' },
      1,
      20,
    );
    expect(params.actorId).toBe('abc');
    expect(params.from).toBeDefined();
    expect(params.to).toBeDefined();
  });
});

describe('dayRangeProblem (review B+G1 I3)', () => {
  it('Đến ngày trước Từ ngày: nêu lỗi bằng NHÃN trên màn hình, không bằng tên trường API', () => {
    // `to` gửi đi là 00:00 của ngày SAU ngày kết thúc, nên 05/10 → 03/10 và 05/10 → 04/10 đều làm `to <= from` ở server (400).
    expect(dayRangeProblem('2026-10-05', '2026-10-03')).toBe('«Đến ngày» phải từ «Từ ngày» trở đi.');
    expect(dayRangeProblem('2026-10-05', '2026-10-04')).toBe('«Đến ngày» phải từ «Từ ngày» trở đi.');
  });

  it('cùng một ngày ở hai đầu là hợp lệ (chọn trọn ngày đó)', () => {
    expect(dayRangeProblem('2026-10-05', '2026-10-05')).toBeNull();
    // và đúng là server nhận được: `to` > `from`.
    const { from, to } = dayRangeToIso('2026-10-05', '2026-10-05');
    expect(new Date(to!) > new Date(from!)).toBe(true);
  });

  it('thứ tự đúng, hoặc thiếu một đầu, hoặc sai định dạng thì không có lỗi', () => {
    expect(dayRangeProblem('2026-10-01', '2026-10-31')).toBeNull();
    expect(dayRangeProblem('2026-10-05', '')).toBeNull();
    expect(dayRangeProblem('', '2026-10-03')).toBeNull();
    expect(dayRangeProblem('', '')).toBeNull();
    expect(dayRangeProblem('2026-13-45', '2026-10-03')).toBeNull();
  });

  it('qua ranh giới tháng và năm', () => {
    expect(dayRangeProblem('2027-01-02', '2026-12-31')).not.toBeNull();
    expect(dayRangeProblem('2026-12-31', '2027-01-01')).toBeNull();
  });
});

describe('hasActiveFilters', () => {
  it('đúng khi có bất kỳ bộ lọc nào khác mặc định', () => {
    expect(hasActiveFilters(EMPTY_AUDIT_FILTERS)).toBe(false);
    expect(hasActiveFilters({ ...EMPTY_AUDIT_FILTERS, group: 'master' })).toBe(true);
    expect(hasActiveFilters({ ...EMPTY_AUDIT_FILTERS, actorId: 'x' })).toBe(true);
    expect(hasActiveFilters({ ...EMPTY_AUDIT_FILTERS, fromDay: '2026-10-01' })).toBe(true);
    expect(hasActiveFilters({ ...EMPTY_AUDIT_FILTERS, toDay: '2026-10-01' })).toBe(true);
  });
});

import {
  parseCellDate,
  parseCellInt,
  parseSemesterCell,
  parseTermCell,
  shown,
} from './import-cells';

describe('parseCellInt', () => {
  it.each([
    ['40', 40],
    [' 40 ', 40],
    ['40.0', 40], // ô số định dạng 2 chữ số thập phân
    ['007', 7],
  ])('đọc %j thành %d', (text, expected) => {
    expect(parseCellInt(text)).toBe(expected);
  });

  it.each(['', 'abc', '40.5', '-3', '1e3', '4 0', '1234567890'])('từ chối %j', (text) => {
    expect(parseCellInt(text)).toBeNull();
  });
});

describe('parseCellDate', () => {
  it('nhận yyyy-mm-dd', () => {
    expect(parseCellDate('2026-09-01')).toBe('2026-09-01');
    expect(parseCellDate(' 2026-09-01 ')).toBe('2026-09-01');
  });

  it('nhận dd/mm/yyyy (ngày-tháng-năm), kể cả không đệm số 0, và trả yyyy-mm-dd', () => {
    expect(parseCellDate('01/09/2026')).toBe('2026-09-01');
    expect(parseCellDate('1/9/2026')).toBe('2026-09-01');
    // Không đoán tháng-ngày-năm: 09/01 là 9 tháng 1.
    expect(parseCellDate('09/01/2026')).toBe('2026-01-09');
  });

  it('từ chối ngày không có thật', () => {
    expect(parseCellDate('2026-02-30')).toBeNull();
    expect(parseCellDate('31/02/2026')).toBeNull();
    expect(parseCellDate('2026-13-01')).toBeNull();
  });

  it('từ chối mọi dạng còn lại, kể cả chuỗi `Date.toString()` của exceljs', () => {
    expect(parseCellDate('')).toBeNull();
    expect(parseCellDate('2026/09/01')).toBeNull();
    expect(parseCellDate('1-9-2026')).toBeNull();
    expect(parseCellDate('46266')).toBeNull(); // số sê-ri Excel
    // Thứ mà `cell.text` của exceljs trả cho ô ngày chưa qua `readWorkbook` đã sửa (plan E2). Phải bị từ chối chứ không
    // bị đọc nhầm: bản xem trước sẽ nói rõ "không hiểu được" thay vì ghi một ngày lệch múi giờ.
    expect(parseCellDate('Tue Sep 01 2026 07:00:00 GMT+0700 (Indochina Time)')).toBeNull();
  });
});

describe('parseTermCell', () => {
  it.each([
    ['1', 1],
    ['2', 2],
    ['3', 3],
    ['HK2', 2],
    ['hk 3', 3],
  ])('đọc %j', (text, expected) => {
    expect(parseTermCell(text)).toBe(expected);
  });

  it.each(['', '0', '4', 'abc', '1.5'])('từ chối %j', (text) => {
    expect(parseTermCell(text)).toBeNull();
  });
});

describe('parseSemesterCell', () => {
  it.each([
    ['HK1 2026-2027', 2026, 1],
    ['hk2 2026-2027', 2026, 2],
    ['HK 3 2026-2027', 2026, 3],
    ['Học kỳ 1 2026-2027', 2026, 1],
    ['1 2026-2027', 2026, 1],
    ['HK1 2026–2027', 2026, 1], // dấu gạch dài
    ['HK1 2026 - 2027', 2026, 1],
  ])('đọc %j', (text, year, term) => {
    expect(parseSemesterCell(text)).toEqual({ academicYearStart: year, term });
  });

  it('chấp nhận chữ có dấu ở dạng tổ hợp (NFD) như Excel/Mac hay gửi', () => {
    const decomposed = 'Học kỳ 2 2026-2027'.normalize('NFD');
    expect(parseSemesterCell(decomposed)).toEqual({ academicYearStart: 2026, term: 2 });
  });

  it.each(['', 'HK4 2026-2027', 'HK1 2026-2028', 'HK1 2026', '2026-2027', 'HK1'])('từ chối %j', (text) => {
    expect(parseSemesterCell(text)).toBeNull();
  });
});

describe('shown', () => {
  it('hiện "(trống)" cho ô trống và đặt giá trị trong ngoặc kép', () => {
    expect(shown('')).toBe('(trống)');
    expect(shown('   ')).toBe('(trống)');
    expect(shown(' abc ')).toBe('"abc"');
  });
});

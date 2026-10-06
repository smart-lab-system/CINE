import { describe, expect, it } from 'vitest';
import {
  ADMINISTRATIVE_CLASS_KIND,
  CLASS_KIND,
  IMPORT_KINDS,
  ROOM_KIND,
  SEMESTER_KIND,
  columnLabel,
  detectBestSheet,
  detectMapping,
  extractImportRows,
  normalizeHeader,
} from './columns';

describe('normalizeHeader', () => {
  it.each([
    ['Tên phòng', 'ten phong'],
    ['SỨC CHỨA', 'suc chua'],
    ['Đại sảnh', 'dai sanh'],
    ['  Mã lớp  danh-nghĩa ', 'ma lop danh nghia'],
    ['Email (giảng viên)', 'email giang vien'],
    ['', ''],
  ])('%j -> %j', (input, expected) => {
    expect(normalizeHeader(input)).toBe(expected);
  });
});

describe('columnLabel', () => {
  it('đặt tên cột như Excel', () => {
    expect([0, 1, 25, 26, 27, 701, 702].map(columnLabel)).toEqual(['A', 'B', 'Z', 'AA', 'AB', 'ZZ', 'AAA']);
  });
});

describe('IMPORT_KINDS', () => {
  it('trần dòng khớp spec §6.3 và khớp server (E1)', () => {
    expect(SEMESTER_KIND.maxRows).toBe(20);
    expect(ROOM_KIND.maxRows).toBe(500);
    expect(ADMINISTRATIVE_CLASS_KIND.maxRows).toBe(500);
    expect(CLASS_KIND.maxRows).toBe(200);
  });

  it('khoá cột khớp tên trường của DTO server', () => {
    expect(SEMESTER_KIND.columns.map((c) => c.key)).toEqual(['academicYear', 'term', 'startDate', 'endDate']);
    expect(ROOM_KIND.columns.map((c) => c.key)).toEqual(['name', 'capacity']);
    expect(ADMINISTRATIVE_CLASS_KIND.columns.map((c) => c.key)).toEqual(['code']);
    expect(CLASS_KIND.columns.map((c) => c.key)).toEqual(['semester', 'administrativeClassCode', 'groupName', 'teacherEmail']);
  });

  it('chỉ sức chứa và nhóm là không bắt buộc', () => {
    const optional = Object.values(IMPORT_KINDS).flatMap((k) => k.columns.filter((c) => !c.required).map((c) => c.key));
    expect(optional.sort()).toEqual(['capacity', 'groupName']);
  });
});

describe('detectMapping', () => {
  it('nhận diện theo tên chính thức ở dòng đầu', () => {
    const result = detectMapping([['Tên phòng', 'Sức chứa'], ['H3.03', '40']], ROOM_KIND);
    expect(result).toEqual({ detected: true, mapping: { headerRows: 1, columns: { name: 0, capacity: 1 } } });
  });

  it('không phụ thuộc thứ tự cột, dấu hay hoa-thường', () => {
    const result = detectMapping([['SUC CHUA', 'ten phong'], ['40', 'H3.03']], ROOM_KIND);
    expect(result.mapping.columns).toEqual({ name: 1, capacity: 0 });
    expect(result.detected).toBe(true);
  });

  it('tìm dòng tiêu đề sau một dòng tiêu đề bìa và một dòng trống (Review Focus 2)', () => {
    const rows = [
      ['DANH SÁCH PHÒNG THI HỌC KỲ 1', ''],
      ['', ''],
      ['STT', 'Phòng', 'Số chỗ'],
      ['1', 'H3.03', '40'],
    ];
    const result = detectMapping(rows, ROOM_KIND);
    expect(result.detected).toBe(true);
    expect(result.mapping).toEqual({ headerRows: 3, columns: { name: 1, capacity: 2 } });
  });

  it('bỏ qua cột lạ chen giữa', () => {
    const result = detectMapping([['STT', 'Tên phòng', 'Ghi chú', 'Sức chứa'], ['1', 'H3.03', '', '40']], ROOM_KIND);
    expect(result.mapping.columns).toEqual({ name: 1, capacity: 3 });
  });

  it('cột không bắt buộc vắng mặt thì là null mà vẫn nhận diện được', () => {
    const result = detectMapping([['Tên phòng'], ['H3.03']], ROOM_KIND);
    expect(result).toEqual({ detected: true, mapping: { headerRows: 1, columns: { name: 0, capacity: null } } });
  });

  it('thiếu cột BẮT BUỘC thì không nhận diện: ghép theo thứ tự, một dòng tiêu đề (Review Focus 2)', () => {
    const result = detectMapping([['Cái này', 'Cái kia'], ['H3.03', '40']], ROOM_KIND);
    expect(result).toEqual({ detected: false, mapping: { headerRows: 1, columns: { name: 0, capacity: 1 } } });
  });

  it('dòng tiêu đề nằm quá xa (sau 10 dòng) thì không tìm', () => {
    const filler = Array.from({ length: 11 }, () => ['x', 'y']);
    const result = detectMapping([...filler, ['Tên phòng', 'Sức chứa']], ROOM_KIND);
    expect(result.detected).toBe(false);
  });

  it('học kỳ: bốn cột bắt buộc, "Học kỳ" là cột kỳ', () => {
    const result = detectMapping([['Năm học', 'Học kỳ', 'Ngày bắt đầu', 'Ngày kết thúc']], SEMESTER_KIND);
    expect(result.mapping.columns).toEqual({ academicYear: 0, term: 1, startDate: 2, endDate: 3 });
    expect(result.detected).toBe(true);
  });

  it('lớp: nhận cả tên chính thức lẫn bí danh ngắn', () => {
    const official = detectMapping([['Học kỳ', 'Mã lớp danh nghĩa', 'Nhóm', 'Email giảng viên']], CLASS_KIND);
    expect(official.mapping.columns).toEqual({ semester: 0, administrativeClassCode: 1, groupName: 2, teacherEmail: 3 });
    const short = detectMapping([['HK', 'Lớp', 'Group', 'Email']], CLASS_KIND);
    expect(short.detected).toBe(true);
    expect(short.mapping.columns).toEqual({ semester: 0, administrativeClassCode: 1, groupName: 2, teacherEmail: 3 });
  });

  it('một cột của file không bao giờ gán cho hai trường', () => {
    // Cả hai tên đều khớp bí danh của `semester` ("hoc ky" và "ky"); chỉ MỘT cột được nhận, cột còn lại bị bỏ.
    const result = detectMapping([['Học kỳ', 'Kỳ', 'Mã lớp', 'Email']], CLASS_KIND);
    const assigned = Object.values(result.mapping.columns).filter((v): v is number => v !== null);
    expect(new Set(assigned).size).toBe(assigned.length);
  });

  it('danh mục lớp danh nghĩa: một cột "Mã lớp"', () => {
    const result = detectMapping([['Mã lớp'], ['DHKTPM18A']], ADMINISTRATIVE_CLASS_KIND);
    expect(result).toEqual({ detected: true, mapping: { headerRows: 1, columns: { code: 0 } } });
  });
});

describe('detectBestSheet', () => {
  it('chọn sheet đầu tiên nhận diện được, bỏ qua sheet bìa', () => {
    const sheets = [
      { name: 'Bia', rows: [['Giới thiệu']] },
      { name: 'DS', rows: [['Tên phòng'], ['H3.03']] },
    ];
    expect(detectBestSheet(sheets, ROOM_KIND)).toBe(1);
  });

  it('không sheet nào nhận diện được thì lấy sheet đầu', () => {
    expect(detectBestSheet([{ name: 'A', rows: [['x']] }, { name: 'B', rows: [['y']] }], ROOM_KIND)).toBe(0);
  });
});

describe('extractImportRows', () => {
  const MAPPING = { headerRows: 1, columns: { name: 0, capacity: 1 } };

  it('đọc cột đã ghép, cắt khoảng trắng, mang số dòng như Excel hiện ra', () => {
    const result = extractImportRows([['Tên', 'Sức'], ['H3.03', ' 40 '], ['H3.04', '']], MAPPING, ROOM_KIND);
    expect(result.problems).toEqual([]);
    expect(result.rows).toEqual([
      { line: 2, name: 'H3.03', capacity: '40' },
      { line: 3, name: 'H3.04', capacity: '' },
    ]);
  });

  it('dòng trống ở giữa bị bỏ qua nhưng số dòng của các dòng sau KHÔNG xê dịch (Review Focus 3)', () => {
    const result = extractImportRows([['h'], ['A'], [''], ['B'], ['', '']], { headerRows: 1, columns: { name: 0, capacity: null } }, ROOM_KIND);
    expect(result.rows.map((r) => [r.line, r.name])).toEqual([[2, 'A'], [4, 'B']]);
  });

  it('dòng chỉ có dữ liệu ở cột KHÔNG được ghép coi như trống', () => {
    const result = extractImportRows([['h'], ['', 'ghi chú'], ['A']], { headerRows: 1, columns: { name: 0, capacity: null } }, ROOM_KIND);
    expect(result.rows.map((r) => r.name)).toEqual(['A']);
  });

  it('cột không bắt buộc chưa ghép cho chuỗi rỗng', () => {
    const result = extractImportRows([['h'], ['A']], { headerRows: 1, columns: { name: 0, capacity: null } }, ROOM_KIND);
    expect(result.rows[0]).toEqual({ line: 2, name: 'A', capacity: '' });
  });

  it('cột BẮT BUỘC chưa ghép là một vấn đề nêu tên cột', () => {
    const result = extractImportRows([['h'], ['A']], { headerRows: 1, columns: { name: null, capacity: 1 } }, ROOM_KIND);
    expect(result.problems).toEqual(['Chưa chọn cột "Tên phòng".']);
  });

  it('không có dòng dữ liệu nào sau tiêu đề là một vấn đề', () => {
    const result = extractImportRows([['Tên phòng', 'Sức chứa']], MAPPING, ROOM_KIND);
    expect(result.problems).toEqual(['Không có dòng dữ liệu nào sau phần tiêu đề.']);
  });

  it('vượt trần dòng là một vấn đề nêu cả số dòng lẫn trần (Review Focus 6)', () => {
    const header = [['Năm học', 'Kỳ', 'Ngày bắt đầu', 'Ngày kết thúc']];
    const data = Array.from({ length: 21 }, () => ['2026', '1', '2026-09-01', '2027-01-31']);
    const mapping = { headerRows: 1, columns: { academicYear: 0, term: 1, startDate: 2, endDate: 3 } };
    const result = extractImportRows([...header, ...data], mapping, SEMESTER_KIND);
    expect(result.problems).toEqual(['File có 21 dòng dữ liệu, tối đa 20 dòng mỗi lần nhập.']);
  });

  it('đúng bằng trần thì không có vấn đề', () => {
    const header = [['Năm học', 'Kỳ', 'Ngày bắt đầu', 'Ngày kết thúc']];
    const data = Array.from({ length: 20 }, () => ['2026', '1', '2026-09-01', '2027-01-31']);
    const mapping = { headerRows: 1, columns: { academicYear: 0, term: 1, startDate: 2, endDate: 3 } };
    expect(extractImportRows([...header, ...data], mapping, SEMESTER_KIND).problems).toEqual([]);
  });

  it('số dòng tiêu đề lớn hơn một: dòng đầu tiên của dữ liệu mang đúng số dòng', () => {
    const result = extractImportRows([['bìa'], ['', ''], ['Tên phòng', 'Sức chứa'], ['H3.03', '40']], { headerRows: 3, columns: { name: 0, capacity: 1 } }, ROOM_KIND);
    expect(result.rows[0].line).toBe(4);
  });
});

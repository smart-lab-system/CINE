import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CLASS_COLUMN_MAPPING,
  extractClasses,
  trimTrailingBlankRows,
} from './class-import-file';

const HEADER = ['Mã môn', 'Tên môn', 'Tên lớp', 'Email giảng viên'];

function sheet(...rows: string[][]) {
  return [HEADER, ...rows];
}

describe('extractClasses', () => {
  it('reads the four mapped columns', () => {
    const result = extractClasses(
      sheet(['CS101', 'Nhập môn lập trình', 'Nhóm 01', 'gv1@truong.edu.vn']),
      DEFAULT_CLASS_COLUMN_MAPPING,
    );

    expect(result.errors).toEqual([]);
    expect(result.rows).toEqual([
      {
        courseCode: 'CS101',
        courseName: 'Nhập môn lập trình',
        className: 'Nhóm 01',
        teacherEmail: 'gv1@truong.edu.vn',
      },
    ]);
  });

  /**
   * Điểm khác biệt cố ý so với `roster-file.ts`, nơi một dòng lỗi loại bỏ
   * TẤT CẢ. Ở đây một môn gõ sai email không được phép chặn các môn còn
   * lại — xem doc comment đầu `class-import-file.ts`.
   */
  it('keeps the good rows and reports the bad one alongside them', () => {
    const result = extractClasses(
      sheet(
        ['CS101', 'Nhập môn lập trình', 'Nhóm 01', 'gv1@truong.edu.vn'],
        ['CS102', 'Cấu trúc dữ liệu', 'Nhóm 01', 'khong-phai-email'],
        ['CS103', 'Giải tích', 'Nhóm 01', 'gv3@truong.edu.vn'],
      ),
      DEFAULT_CLASS_COLUMN_MAPPING,
    );

    expect(result.rows.map((r) => r.courseCode)).toEqual(['CS101', 'CS103']);
    expect(result.errors).toEqual([
      { row: 3, reason: expect.stringContaining('khong-phai-email') },
    ]);
  });

  it('numbers errors the way the spreadsheet does, counting the header', () => {
    const result = extractClasses(
      sheet(['CS101', 'Nhập môn', 'Nhóm 01', 'gv@truong.edu.vn'], ['', '', '', '']),
      DEFAULT_CLASS_COLUMN_MAPPING,
    );

    // Dòng trống cuối cùng bị cắt, nên không có lỗi nào ở đây.
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(1);
  });

  it('reports a blank row that sits INSIDE the data', () => {
    const result = extractClasses(
      sheet(
        ['CS101', 'Nhập môn', 'Nhóm 01', 'gv@truong.edu.vn'],
        ['', '', '', ''],
        ['CS102', 'Cấu trúc', 'Nhóm 01', 'gv@truong.edu.vn'],
      ),
      DEFAULT_CLASS_COLUMN_MAPPING,
    );

    // Dòng trống giữa dữ liệu thường là dấu hiệu chọn sai cột hoặc sai số
    // dòng tiêu đề — im lặng bỏ qua sẽ giấu mất điều đó.
    expect(result.errors).toEqual([
      { row: 3, reason: expect.stringContaining('Dòng trống') },
    ]);
    expect(result.rows).toHaveLength(2);
  });

  it('rejects a duplicate (course, class) pair instead of letting one overwrite the other', () => {
    const result = extractClasses(
      sheet(
        ['CS101', 'Nhập môn', 'Nhóm 01', 'a@truong.edu.vn'],
        ['cs101', 'Nhập môn', 'nhóm 01', 'b@truong.edu.vn'],
      ),
      DEFAULT_CLASS_COLUMN_MAPPING,
    );

    // Với server hai dòng này là CÙNG một lớp: dòng sau sẽ ghi đè dòng
    // trước, và người dùng không biết giảng viên nào đã thắng.
    expect(result.rows).toHaveLength(1);
    expect(result.errors).toEqual([
      { row: 3, reason: expect.stringContaining('đã xuất hiện ở dòng 2') },
    ]);
  });

  it('allows the same class name under two different courses', () => {
    const result = extractClasses(
      sheet(
        ['CS101', 'Nhập môn', 'Nhóm 01', 'a@truong.edu.vn'],
        ['CS102', 'Cấu trúc', 'Nhóm 01', 'b@truong.edu.vn'],
      ),
      DEFAULT_CLASS_COLUMN_MAPPING,
    );

    // "Nhóm 01" là tên phổ biến nhất có thể — trùng giữa hai môn là bình
    // thường, không phải lỗi.
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(2);
  });

  it('names each missing field rather than saying "invalid row"', () => {
    const result = extractClasses(
      sheet(
        ['', 'Tên môn', 'Nhóm 01', 'gv@truong.edu.vn'],
        ['CS102', '', 'Nhóm 01', 'gv@truong.edu.vn'],
        ['CS103', 'Tên môn', '', 'gv@truong.edu.vn'],
      ),
      DEFAULT_CLASS_COLUMN_MAPPING,
    );

    expect(result.errors.map((e) => e.reason)).toEqual([
      'Thiếu mã môn',
      'Thiếu tên môn',
      'Thiếu tên lớp',
    ]);
  });

  it('applies the same 2-32 length bound the DTO does', () => {
    const result = extractClasses(
      sheet(['X', 'Tên môn', 'Nhóm 01', 'gv@truong.edu.vn']),
      DEFAULT_CLASS_COLUMN_MAPPING,
    );

    // Lệch với `@Length(2, 32)` của DTO nghĩa là preview báo file ổn rồi
    // import trả 400 — đúng thứ lớp này tồn tại để tránh.
    expect(result.errors).toEqual([{ row: 2, reason: expect.stringContaining('2-32') }]);
  });

  it('says so when the sheet has nothing but a header', () => {
    const result = extractClasses(sheet(), DEFAULT_CLASS_COLUMN_MAPPING);

    expect(result.rows).toEqual([]);
    expect(result.errors).toEqual([
      { row: 0, reason: 'Không có dòng dữ liệu nào sau phần tiêu đề' },
    ]);
  });

  it('honours a different header-row count', () => {
    const result = extractClasses(
      [
        ['Danh sách lớp học kỳ 1'],
        HEADER,
        ['CS101', 'Nhập môn', 'Nhóm 01', 'gv@truong.edu.vn'],
      ],
      { ...DEFAULT_CLASS_COLUMN_MAPPING, headerRows: 2 },
    );

    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(1);
  });

  it('trims surrounding whitespace out of every cell', () => {
    const result = extractClasses(
      sheet(['  CS101 ', ' Nhập môn ', ' Nhóm 01 ', ' gv@truong.edu.vn ']),
      DEFAULT_CLASS_COLUMN_MAPPING,
    );

    expect(result.rows[0]).toEqual({
      courseCode: 'CS101',
      courseName: 'Nhập môn',
      className: 'Nhóm 01',
      teacherEmail: 'gv@truong.edu.vn',
    });
  });
});

describe('trimTrailingBlankRows', () => {
  it('drops only the trailing blanks', () => {
    expect(trimTrailingBlankRows([['a'], [''], ['b'], [''], ['']])).toEqual([
      ['a'],
      [''],
      ['b'],
    ]);
  });
});

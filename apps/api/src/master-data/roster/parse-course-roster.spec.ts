import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as XLSX from 'xlsx';
import { parseCourseRoster, RosterParseError } from './parse-course-roster';

const SAMPLE_XLS = join(
  __dirname,
  '../../../../../docs/422001525826 - Anh van 4 (DHKT19BTT).xls',
);

describe('parseCourseRoster', () => {
  it('reads MSSV and full name from the university exam-list template', () => {
    const parsed = parseCourseRoster(readFileSync(SAMPLE_XLS));

    expect(parsed.sectionCodeFromFile).toBe('422001525826');
    expect(parsed.students).toHaveLength(44);
    expect(parsed.students[0]).toEqual({
      studentCode: '22691861',
      fullName: 'Nguyễn Gia Bảo',
    });
    expect(parsed.students[43]).toEqual({
      studentCode: '23655781',
      fullName: 'Nguyễn Thị Kim Yến',
    });
    expect(
      parsed.students.every((row) => /^\d{8}$/.test(row.studentCode)),
    ).toBe(true);
  });

  it('parses the same layout from an xlsx workbook', () => {
    const parsed = parseCourseRoster(
      rosterWorkbook([
        ['', 'Môn thi', 'Anh văn 4', '', '', '', '', 'Lớp học phần: 42200999'],
        ['STT', 'Mã số', 'Họ đệm', 'Tên', 'Lớp học'],
        [1, '22691861', 'Nguyễn Gia', 'Bảo', 'DHKTPM18CTT'],
        [2, 23664311, 'Nguyễn Trọng', 'Hoài', 'DHKT19BTT'],
        ['', 'Tổng cộng: 2'],
      ]),
    );

    expect(parsed.sectionCodeFromFile).toBe('42200999');
    expect(parsed.students).toEqual([
      { studentCode: '22691861', fullName: 'Nguyễn Gia Bảo' },
      { studentCode: '23664311', fullName: 'Nguyễn Trọng Hoài' },
    ]);
  });

  it('rejects a duplicate student code', () => {
    expect(() =>
      parseCourseRoster(
        rosterWorkbook([
          ['STT', 'Mã số', 'Họ đệm', 'Tên'],
          [1, '22691861', 'Nguyễn Gia', 'Bảo'],
          [2, '22691861', 'Văn Ngọc', 'Danh'],
        ]),
      ),
    ).toThrow(RosterParseError);
  });

  it('rejects a workbook without the expected header', () => {
    expect(() =>
      parseCourseRoster(rosterWorkbook([['Hello'], ['World']])),
    ).toThrow(/STT/);
  });

  it('rejects a workbook with no student rows', () => {
    expect(() =>
      parseCourseRoster(
        rosterWorkbook([
          ['STT', 'Mã số', 'Họ đệm', 'Tên'],
          ['', 'Tổng cộng: 0'],
        ]),
      ),
    ).toThrow(/does not contain any students/);
  });
});

function rosterWorkbook(rows: unknown[][]): Buffer {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

import { describe, expect, it } from 'vitest';
import { diffRoster, extractRoster, trimTrailingBlankRows } from './roster-file';

/**
 * The rules the roster importer exists to enforce, tested where they live:
 * in pure functions over already-parsed cells, so they can be checked
 * exhaustively without a real .xlsx or a browser.
 *
 * Both rules are about being wrong loudly. A file that imports 38 of 40 rows
 * produces a headcount that looks healthy and isn't; a re-import that
 * silently deletes a student locks them out of an exam, and that surfaces on
 * exam day when nothing can be done.
 */

const MAPPING = { headerRows: 1, mssvColumn: 0, nameColumn: 1 };

describe('extractRoster', () => {
  it('reads the mapped columns and skips the header rows', () => {
    const result = extractRoster(
      [
        ['MSSV', 'Họ và tên', 'Ghi chú'],
        ['SV001', 'Nguyễn Văn A', 'x'],
        ['SV002', 'Trần Thị B', ''],
      ],
      MAPPING,
    );

    expect(result.errors).toEqual([]);
    expect(result.students).toEqual([
      { mssv: 'SV001', name: 'Nguyễn Văn A' },
      { mssv: 'SV002', name: 'Trần Thị B' },
    ]);
  });

  it('takes the columns it is told to, never the ones that look right', () => {
    // The name column comes FIRST here and the header says "MSSV" over it.
    // Guessing from a header is what CLAUDE.md Security rule 9 forbids for
    // GradeExport, and a roster is the same problem: get it wrong and every
    // student is admitted under someone else's identity.
    const result = extractRoster(
      [
        ['MSSV', 'Họ và tên'],
        ['Nguyễn Văn A', 'SV001'],
      ],
      { headerRows: 1, mssvColumn: 1, nameColumn: 0 },
    );

    expect(result.errors).toEqual([]);
    expect(result.students).toEqual([{ mssv: 'SV001', name: 'Nguyễn Văn A' }]);
  });

  it('reports a malformed MSSV by the row number the user sees', () => {
    const result = extractRoster(
      [
        ['MSSV', 'Họ và tên'],
        ['SV001', 'Nguyễn Văn A'],
        ['SV 002', 'Trần Thị B'],
      ],
      MAPPING,
    );

    // Row 3 in the spreadsheet, not index 2 in an array — the user is going
    // to go and look at it.
    expect(result.errors).toEqual([
      { row: 3, reason: 'MSSV "SV 002" không hợp lệ (chỉ gồm 4-20 chữ cái hoặc chữ số)' },
    ]);
    expect(result.students).toEqual([]);
  });

  it('returns no students at all when any row is bad', () => {
    const rows: string[][] = [['MSSV', 'Họ và tên']];
    for (let i = 0; i < 30; i++) {
      rows.push([`SV${String(i).padStart(3, '0')}`, `Sinh viên ${i}`]);
    }
    rows.push(['!!!', 'Hỏng']);

    const result = extractRoster(rows, MAPPING);

    // 30 good rows are not a partial success. A roster imported at 30/31
    // gives a headcount that looks right and is not.
    expect(result.errors).toHaveLength(1);
    expect(result.students).toEqual([]);
  });

  it('catches an MSSV listed twice, naming both rows', () => {
    const result = extractRoster(
      [
        ['MSSV', 'Họ và tên'],
        ['SV001', 'Nguyễn Văn A'],
        ['SV002', 'Trần Thị B'],
        ['sv001', 'Nguyễn Văn A (lặp)'],
      ],
      MAPPING,
    );

    // Different case, same student: student_mssv is citext, so these two
    // rows would collide in the database. The file has to be fixed, not the
    // second row quietly dropped.
    expect(result.errors).toEqual([
      { row: 4, reason: 'MSSV "sv001" đã xuất hiện ở dòng 2' },
    ]);
  });

  it('reports a row with an MSSV but no name', () => {
    const result = extractRoster(
      [
        ['MSSV', 'Họ và tên'],
        ['SV001', '   '],
      ],
      MAPPING,
    );

    expect(result.errors).toEqual([{ row: 2, reason: 'Thiếu họ tên' }]);
  });

  it('reports a blank row sitting between data rows', () => {
    const result = extractRoster(
      [
        ['MSSV', 'Họ và tên'],
        ['SV001', 'Nguyễn Văn A'],
        ['', ''],
        ['SV002', 'Trần Thị B'],
      ],
      MAPPING,
    );

    // A gap inside the data almost always means the column mapping or the
    // header count is wrong, and rows are being read from the wrong place.
    expect(result.errors).toEqual([
      { row: 3, reason: 'Dòng trống nằm giữa danh sách — kiểm tra lại cột đã chọn' },
    ]);
  });

  it('reports every bad row, not just the first', () => {
    const result = extractRoster(
      [
        ['MSSV', 'Họ và tên'],
        ['SV 001', 'Nguyễn Văn A'],
        ['SV002', ''],
      ],
      MAPPING,
    );

    // Fixing one row, re-uploading, and finding the next one is a bad way to
    // spend the morning of an exam.
    expect(result.errors.map((e) => e.row)).toEqual([2, 3]);
  });

  it('trims whitespace around both fields', () => {
    const result = extractRoster(
      [
        ['MSSV', 'Họ và tên'],
        ['  SV001  ', '  Nguyễn Văn A  '],
      ],
      MAPPING,
    );

    expect(result.students).toEqual([{ mssv: 'SV001', name: 'Nguyễn Văn A' }]);
  });

  it('says so when the file has no data rows at all', () => {
    const result = extractRoster([['MSSV', 'Họ và tên']], MAPPING);

    expect(result.students).toEqual([]);
    expect(result.errors).toEqual([
      { row: 0, reason: 'Không có dòng dữ liệu nào sau phần tiêu đề' },
    ]);
  });
});

describe('trimTrailingBlankRows', () => {
  it('drops blank rows at the end without touching the ones inside', () => {
    const rows = [['a'], [''], ['b'], [''], ['  ']];

    // Trailing blanks are a spreadsheet artifact — a stray format on an
    // untouched row is enough to produce them, and failing a real file over
    // them would be theatre. A blank row INSIDE the data is a different
    // thing, and extractRoster still reports it.
    expect(trimTrailingBlankRows(rows)).toEqual([['a'], [''], ['b']]);
  });

  it('returns nothing for a sheet that is entirely blank', () => {
    expect(trimTrailingBlankRows([[''], ['', '  ']])).toEqual([]);
  });
});

describe('diffRoster', () => {
  const current = [
    { mssv: 'SV001', name: 'Nguyễn Văn A' },
    { mssv: 'SV002', name: 'Trần Thị B' },
    { mssv: 'SV003', name: 'Lê Văn C' },
  ];

  it('splits a re-import into added, renamed, unchanged and missing', () => {
    const diff = diffRoster(current, [
      { mssv: 'SV001', name: 'Nguyễn Văn A' },
      { mssv: 'SV002', name: 'Trần Thị B (đổi tên)' },
      { mssv: 'SV004', name: 'Phạm Thị D' },
    ]);

    expect(diff.added).toEqual([{ mssv: 'SV004', name: 'Phạm Thị D' }]);
    expect(diff.renamed).toEqual([
      { mssv: 'SV002', from: 'Trần Thị B', to: 'Trần Thị B (đổi tên)' },
    ]);
    expect(diff.unchanged).toBe(1);
    // Reported, never removed on its own: SV003 losing their enrollment
    // means losing the exam.
    expect(diff.missing).toEqual([{ mssv: 'SV003', name: 'Lê Văn C' }]);
  });

  it('reports no change at all for the same file twice', () => {
    const diff = diffRoster(current, current);

    expect(diff).toMatchObject({ added: [], renamed: [], missing: [], unchanged: 3 });
  });

  it('matches MSSV case-insensitively, the way the database does', () => {
    const diff = diffRoster(current, [{ mssv: 'sv001', name: 'Nguyễn Văn A' }]);

    // student_mssv is citext. Treating these as two people here would show
    // the user an add and a removal for one unchanged student.
    expect(diff.added).toEqual([]);
    expect(diff.unchanged).toBe(1);
  });
});

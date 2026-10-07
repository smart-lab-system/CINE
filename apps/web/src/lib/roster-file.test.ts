import { describe, expect, it } from 'vitest';
import {
  diffRoster,
  extractRoster,
  suggestColumnMapping,
  trimTrailingBlankRows,
} from './roster-file';

/**
 * Import chỉ lấy dòng có MSSV đúng 8 số; tiêu đề / dòng trống bỏ qua.
 * Lỗi (thiếu tên, trùng) chỉ trên các dòng đã nhận là sinh viên.
 */

const MAPPING = { headerRows: 0, mssvColumn: 0, nameColumns: [1] };

describe('extractRoster', () => {
  it('chỉ lấy dòng MSSV 8 số, bỏ qua tiêu đề', () => {
    const result = extractRoster(
      [
        ['MSSV', 'Họ và tên', 'Ghi chú'],
        ['22691861', 'Nguyễn Văn A', 'x'],
        ['22691791', 'Trần Thị B', ''],
      ],
      MAPPING,
    );

    expect(result.errors).toEqual([]);
    expect(result.skipped).toBe(1);
    expect(result.students).toEqual([
      { mssv: '22691861', name: 'Nguyễn Văn A' },
      { mssv: '22691791', name: 'Trần Thị B' },
    ]);
  });

  it('takes the columns it is told to, never the ones that look right', () => {
    const result = extractRoster(
      [
        ['Họ và tên', 'MSSV'],
        ['Nguyễn Văn A', '22691861'],
      ],
      { headerRows: 0, mssvColumn: 1, nameColumns: [0] },
    );

    expect(result.errors).toEqual([]);
    expect(result.students).toEqual([{ mssv: '22691861', name: 'Nguyễn Văn A' }]);
  });

  it('ghép Họ đệm + Tên', () => {
    const result = extractRoster(
      [
        ['STT', 'Mã số', 'Họ đệm', 'Tên'],
        ['1', '22691861', 'Nguyễn Gia', 'Bảo'],
        ['2', '22691791', 'Văn Ngọc', 'Danh'],
      ],
      { headerRows: 0, mssvColumn: 1, nameColumns: [2, 3] },
    );

    expect(result.errors).toEqual([]);
    expect(result.students).toEqual([
      { mssv: '22691861', name: 'Nguyễn Gia Bảo' },
      { mssv: '22691791', name: 'Văn Ngọc Danh' },
    ]);
  });

  it('bỏ qua dòng không phải MSSV 8 số (không báo lỗi)', () => {
    const result = extractRoster(
      [
        ['DANH SÁCH'],
        ['Mã số', 'Họ'],
        ['22691861', 'Nguyễn A'],
        ['SV001', 'Bỏ qua'],
        ['', ''],
        ['22691791', 'Trần B'],
      ],
      MAPPING,
    );

    expect(result.errors).toEqual([]);
    expect(result.students).toEqual([
      { mssv: '22691861', name: 'Nguyễn A' },
      { mssv: '22691791', name: 'Trần B' },
    ]);
    expect(result.skipped).toBe(4);
  });

  it('báo khi chưa chọn cột họ tên', () => {
    const result = extractRoster(
      [['22691861', 'Nguyễn']],
      { headerRows: 0, mssvColumn: 0, nameColumns: [] },
    );

    expect(result.errors).toEqual([{ row: 0, reason: 'Chưa chọn cột họ tên' }]);
  });

  it('chỉ cho tối đa 2 cột họ tên', () => {
    const result = extractRoster(
      [['22691861', 'a', 'b', 'c']],
      { headerRows: 0, mssvColumn: 0, nameColumns: [1, 2, 3] },
    );

    expect(result.errors).toEqual([{ row: 0, reason: 'Chỉ chọn tối đa 2 cột họ tên' }]);
  });

  it('trùng MSSV 8 số → lỗi', () => {
    const result = extractRoster(
      [
        ['22691861', 'Nguyễn A'],
        ['22691861', 'Nguyễn A (lặp)'],
      ],
      MAPPING,
    );

    expect(result.errors).toEqual([
      { row: 2, reason: 'MSSV "22691861" đã xuất hiện ở dòng 1' },
    ]);
    expect(result.students).toEqual([]);
  });

  it('MSSV 8 số nhưng thiếu tên → lỗi', () => {
    const result = extractRoster(
      [['22691861', '   ']],
      MAPPING,
    );

    expect(result.errors).toEqual([{ row: 1, reason: 'Thiếu họ tên' }]);
  });

  it('không có dòng MSSV 8 số nào → báo rõ', () => {
    const result = extractRoster(
      [
        ['MSSV', 'Họ'],
        ['SV001', 'A'],
      ],
      MAPPING,
    );

    expect(result.students).toEqual([]);
    expect(result.errors[0]?.reason).toMatch(/Không tìm thấy dòng nào có MSSV đúng 8/);
  });

  it('chuẩn hoá MSSV dạng 22691861.0 từ Excel', () => {
    const result = extractRoster(
      [['22691861.0', 'Nguyễn A']],
      MAPPING,
    );

    expect(result.students).toEqual([{ mssv: '22691861', name: 'Nguyễn A' }]);
  });
});

describe('suggestColumnMapping', () => {
  it('gợi ý cột Mã số / Họ đệm / Tên từ file danh sách thi', () => {
    const rows = [
      ['DANH SÁCH SINH VIÊN'],
      ['STT', 'Mã số', 'Họ đệm', 'Tên', 'Lớp học'],
      ['1', '22691861', 'Nguyễn Gia', 'Bảo', 'DHKTPM18CTT'],
      ['2', '22691791', 'Văn Ngọc', 'Danh', 'DHCNTT18ATT'],
    ];

    expect(suggestColumnMapping(rows)).toEqual({
      headerRows: 0,
      mssvColumn: 1,
      nameColumns: [2, 3],
    });
  });
});

describe('trimTrailingBlankRows', () => {
  it('drops blank rows at the end without touching the ones inside', () => {
    const rows = [['a'], [''], ['b'], [''], ['  ']];
    expect(trimTrailingBlankRows(rows)).toEqual([['a'], [''], ['b']]);
  });

  it('returns nothing for a sheet that is entirely blank', () => {
    expect(trimTrailingBlankRows([[''], ['', '  ']])).toEqual([]);
  });
});

describe('diffRoster', () => {
  const current = [
    { mssv: '22691861', name: 'Nguyễn Văn A' },
    { mssv: '22691791', name: 'Trần Thị B' },
    { mssv: '23664311', name: 'Lê Văn C' },
  ];

  it('splits a re-import into added, renamed, unchanged and missing', () => {
    const diff = diffRoster(current, [
      { mssv: '22691861', name: 'Nguyễn Văn A' },
      { mssv: '22691791', name: 'Trần Thị B (đổi tên)' },
      { mssv: '21089761', name: 'Phạm Thị D' },
    ]);

    expect(diff.added).toEqual([{ mssv: '21089761', name: 'Phạm Thị D' }]);
    expect(diff.renamed).toEqual([
      { mssv: '22691791', from: 'Trần Thị B', to: 'Trần Thị B (đổi tên)' },
    ]);
    expect(diff.unchanged).toBe(1);
    expect(diff.missing).toEqual([{ mssv: '23664311', name: 'Lê Văn C' }]);
  });
});

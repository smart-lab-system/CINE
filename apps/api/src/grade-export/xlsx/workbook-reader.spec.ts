import { buildXlsx, type FixtureSheet } from '../testing/xlsx-fixture';
import {
  MacroWorkbookError,
  NotWorkbookError,
  SheetNotFoundError,
  SheetTooLargeError,
  UnsupportedWorkbookError,
  cellAt,
  isMergedNonMaster,
  openWorkbook,
  readSheet,
} from './workbook-reader';
import { readZipEntries, writeZip } from './zip-io';

const open = async (sheets: FixtureSheet[], opts?: Parameters<typeof buildXlsx>[1]) =>
  openWorkbook(await readZipEntries(await buildXlsx(sheets, opts)));

const GRADEBOOK: FixtureSheet = {
  name: 'Bảng điểm',
  rows: [
    ['BẢNG ĐIỂM LỚP N01'],
    ['STT', 'MSSV', 'Họ tên', 'Giữa kỳ', 'Cuối kỳ', 'Tổng'],
    [1, '20120001', 'Nguyễn Văn An', 7, null, { formula: 'D3*0.3+E3*0.7', value: 2.1 }],
    [2, 20120002, 'A & B <C>', 8.5, { v: 9, s: 1 }, { formula: 'IF(E4>5,"Đạt","Trượt")', value: 'Đạt' }],
    [3, '  ', 'Trống', null, null, null],
  ],
  merges: ['A1:F1'],
  columnStyle: { 5: 1 },
};

describe('openWorkbook', () => {
  it('lists the sheets in workbook order and flags hidden ones', async () => {
    const wb = await open([{ name: 'Một', rows: [['a']] }, { name: 'Hai', rows: [['b']], hidden: true }]);
    expect(wb.sheets.map((s) => [s.name, s.hidden, s.path])).toEqual([
      ['Một', false, 'xl/worksheets/sheet1.xml'],
      ['Hai', true, 'xl/worksheets/sheet2.xml'],
    ]);
  });

  it('refuses a macro workbook by name', async () => {
    await expect(open([{ name: 'S', rows: [] }], { workbookContentType: 'application/vnd.ms-excel.sheet.macroEnabled.main+xml' })).rejects.toBeInstanceOf(MacroWorkbookError);
  });

  it('refuses a zip that is not a workbook', async () => {
    const entries = await readZipEntries(await writeZip([{ name: 'a.txt', data: Buffer.from('x'), date: new Date(), isDirectory: false }]));
    expect(() => openWorkbook(entries)).toThrow(NotWorkbookError);
  });

  it('refuses a workbook whose main part is not a workbook (a template, for instance)', async () => {
    await expect(open([{ name: 'S', rows: [] }], { workbookContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.template.main+xml' })).rejects.toBeInstanceOf(NotWorkbookError);
  });
});

describe('readSheet', () => {
  it('reads shared strings, numbers, inline strings and formula results with the right kind', async () => {
    const wb = await open([GRADEBOOK]);
    const sheet = readSheet(wb, 'Bảng điểm');
    expect(cellAt(sheet, 2, 2)).toMatchObject({ text: 'MSSV', kind: 'text', hasFormula: false });
    expect(cellAt(sheet, 2, 3)).toMatchObject({ text: '20120001', kind: 'text' });
    expect(cellAt(sheet, 2, 4)).toMatchObject({ text: '20120002', kind: 'number' });
    expect(cellAt(sheet, 4, 4)).toMatchObject({ text: '8.5', kind: 'number' });
    expect(cellAt(sheet, 6, 3)).toMatchObject({ text: '2.1', kind: 'number', hasFormula: true });
    expect(cellAt(sheet, 6, 4)).toMatchObject({ text: 'Đạt', kind: 'text', hasFormula: true });
    const inline = readSheet(await open([{ ...GRADEBOOK, inline: true }]), 'Bảng điểm');
    expect(cellAt(inline, 3, 3)).toMatchObject({ text: 'Nguyễn Văn An', kind: 'text' });
  });

  it('decodes entities and reads rich text without the phonetic runs', async () => {
    const wb = await open([{ name: 'S', rows: [['A & B <C> "x"', { rich: 'Xin chào' }]] }]);
    const sheet = readSheet(wb, 'S');
    expect(cellAt(sheet, 1, 1).text).toBe('A & B <C> "x"');
    expect(cellAt(sheet, 2, 1).text).toBe('Xin chào');
  });

  it('a style-only cell, a whitespace-only string and a missing cell are all "empty"', async () => {
    const sheet = readSheet(await open([GRADEBOOK]), 'Bảng điểm');
    expect(cellAt(sheet, 5, 3)).toMatchObject({ text: '', kind: 'empty' }); // <c r="E3" s="1"/>
    expect(cellAt(sheet, 2, 5)).toMatchObject({ kind: 'empty' }); // '  '
    expect(cellAt(sheet, 30, 99)).toMatchObject({ text: '', kind: 'empty', hasFormula: false }); // no such cell
  });

  it('reports merges, and only the top-left cell of a merge is the master', async () => {
    const sheet = readSheet(await open([GRADEBOOK]), 'Bảng điểm');
    expect(sheet.merges).toEqual([{ col1: 1, row1: 1, col2: 6, row2: 1 }]);
    expect(isMergedNonMaster(sheet, 1, 1)).toBe(false);
    expect(isMergedNonMaster(sheet, 3, 1)).toBe(true);
    expect(isMergedNonMaster(sheet, 3, 2)).toBe(false);
  });

  it('rowCount and columnCount count only cells with a value or a formula', async () => {
    const sheet = readSheet(await open([GRADEBOOK]), 'Bảng điểm');
    expect(sheet.rowCount).toBe(5);
    expect(sheet.columnCount).toBe(6);
    const styledOnly = readSheet(await open([{ name: 'S', rows: [['a'], [], [null, null, null]], columnStyle: { 3: 1 } }]), 'S');
    expect(styledOnly.rowCount).toBe(1);
    expect(styledOnly.columnCount).toBe(1);
  });

  it('detects a protected sheet', async () => {
    expect(readSheet(await open([{ name: 'S', rows: [['a']], protect: true }]), 'S').protected).toBe(true);
    expect(readSheet(await open([{ name: 'S', rows: [['a']] }]), 'S').protected).toBe(false);
  });

  it('a row with no <row> element and a self-closed row are both fine', async () => {
    const sheet = readSheet(await open([{ name: 'S', rows: [['a'], null, [], ['d']] }]), 'S');
    expect(cellAt(sheet, 1, 4).text).toBe('d');
    expect(sheet.rowCount).toBe(4);
  });

  it('throws for an unknown sheet', async () => {
    const wb = await open([{ name: 'S', rows: [] }]);
    expect(() => readSheet(wb, 'Nope')).toThrow(SheetNotFoundError);
  });

  it('refuses a prefixed-namespace sheet instead of misreading it', async () => {
    const wb = await open([{ name: 'S', rows: [] }], { prefixed: true });
    expect(() => readSheet(wb, 'S')).toThrow(UnsupportedWorkbookError);
  });

  it('refuses a cell that has no address', async () => {
    const wb = await open([{ name: 'S', rows: [['a']], omitCellRefs: true }]);
    expect(() => readSheet(wb, 'S')).toThrow(UnsupportedWorkbookError);
  });

  it('refuses a VALUED cell past column BH', async () => {
    const wb = await open([{ name: 'S', rows: [Array.from({ length: 61 }, (_, i) => (i === 60 ? 'x' : null))] }]);
    expect(() => readSheet(wb, 'S')).toThrow(SheetTooLargeError);
  });

  it('refuses a VALUED cell past row 5000, but ignores a self-closed row there', async () => {
    const tall = (row: string[]): (string[] | null)[] => {
      const rows: (string[] | null)[] = Array.from({ length: 5001 }, () => null);
      rows[5000] = row;
      return rows;
    };
    const valued = await open([{ name: 'S', rows: tall(['x']) }]);
    expect(() => readSheet(valued, 'S')).toThrow(SheetTooLargeError);
    const empty = await open([{ name: 'S', rows: [['a'], ...tall([]).slice(1)] }]);
    expect(readSheet(empty, 'S').rowCount).toBe(1);
  });
});

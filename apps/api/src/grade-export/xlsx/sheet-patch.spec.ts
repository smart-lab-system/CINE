import { buildXlsx, type FixtureSheet } from '../testing/xlsx-fixture';
import { PatchError, forceRecalcOnLoad, hundredthsToXml, patchSheet, patchWorkbook, type CellEdit } from './sheet-patch';
import { readZipEntries, writeZip } from './zip-io';

const SHEET: FixtureSheet = {
  name: 'Bảng điểm',
  rows: [
    ['BẢNG ĐIỂM LỚP N01'],
    ['STT', 'MSSV', 'Họ tên', 'Giữa kỳ', 'Cuối kỳ', 'Tổng'],
    [1, '20120001', 'Nguyễn Văn An', 7, null, { formula: 'D3*0.3+E3*0.7', value: 2.1 }],
    [2, '20120002', 'Trần Thị Bình', 8, { v: 'cũ', s: 2 }, { formula: 'D4*0.3+E4*0.7', value: 2.4 }],
    [3, '20120003', 'Lê Văn Cường', 6],
    null,
    [],
    [6, '20120006', 'Vũ Thị Hà', 9],
  ],
  columnStyle: { 5: 1 },
};

async function sheetXml(sheet: FixtureSheet = SHEET): Promise<string> {
  const entries = await readZipEntries(await buildXlsx([sheet]));
  return entries.find((e) => e.name === 'xl/worksheets/sheet1.xml')!.data.toString('utf8');
}
const refsOf = (xml: string, row: number): string[] => {
  const m = new RegExp(`<row\\b[^>]*\\br="${row}"[^>]*?(?:/>|>([\\s\\S]*?)</row>)`).exec(xml);
  return m?.[1] ? [...m[1].matchAll(/<c\b[^>]*\br="([A-Z]+\d+)"/g)].map((x) => x[1]!) : [];
};
/** Cắt các ô đã sửa ra khỏi XML để so phần CÒN LẠI. */
const without = (xml: string, refs: string[]) =>
  refs.reduce((acc, ref) => acc.replace(new RegExp(`<c\\b[^>]*\\br="${ref}"[^>]*?(?:/>|>[\\s\\S]*?</c>)`), ''), xml);
const num = (ref: string, hundredths: number): CellEdit => ({ ref, kind: 'number', hundredths });

describe('hundredthsToXml — a score is written from an integer, never a float', () => {
  it.each([[0, '0'], [5, '0.05'], [10, '0.1'], [99, '0.99'], [100, '1'], [725, '7.25'], [750, '7.5'], [999, '9.99'], [1000, '10']])('%i → %s', (h, xml) => {
    expect(hundredthsToXml(h as number)).toBe(xml);
  });
  it('refuses what is not a non-negative integer', () => {
    expect(() => hundredthsToXml(-1)).toThrow(PatchError);
    expect(() => hundredthsToXml(1.5)).toThrow(PatchError);
    expect(() => hundredthsToXml(Number.NaN)).toThrow(PatchError);
  });
});

describe('patchSheet', () => {
  it('writes a number into an existing styled-empty cell: keeps `s`, no `t`, and changes nothing else', async () => {
    const xml = await sheetXml();
    const out = patchSheet(xml, [num('E3', 750)]);
    expect(out).toContain('<c r="E3" s="1"><v>7.5</v></c>');
    expect(without(out, ['E3'])).toBe(without(xml, ['E3']));
  });

  it('overwriting a text cell drops its `t` and keeps its style', async () => {
    const xml = await sheetXml();
    const out = patchSheet(xml, [num('E4', 825)]);
    expect(out).toContain('<c r="E4" s="2"><v>8.25</v></c>');
    expect(out).not.toMatch(/<c r="E4"[^>]*t="s"/);
  });

  it('inserts a missing cell in COLUMN order — after the last, and between two', async () => {
    const xml = await sheetXml();
    const out = patchSheet(xml, [num('G3', 100), num('E5', 250)]);
    expect(refsOf(out, 3)).toEqual(['A3', 'B3', 'C3', 'D3', 'E3', 'F3', 'G3']);
    expect(refsOf(out, 5)).toEqual(['A5', 'B5', 'C5', 'D5', 'E5']);
    const sparse = await sheetXml({ name: 'S', rows: [['a', null, 'c']] });
    expect(refsOf(patchSheet(sparse, [num('B1', 100)]), 1)).toEqual(['A1', 'B1', 'C1']);
  });

  it('expands a self-closed row', async () => {
    const out = patchSheet(await sheetXml(), [num('E7', 100)]);
    expect(out).toContain('<row r="7"><c r="E7"><v>1</v></c></row>');
  });

  it('creates a missing row in ROW order — between two existing rows and after the last', async () => {
    const xml = await sheetXml();
    const out = patchSheet(xml, [num('E6', 100), num('E12', 200)]);
    const order = [...out.matchAll(/<row\b[^>]*\br="(\d+)"/g)].map((m) => Number(m[1]));
    expect(order).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 12]);
    expect(out).toContain('<row r="6"><c r="E6"><v>1</v></c></row>');
    expect(out).toContain('<row r="12"><c r="E12"><v>2</v></c></row>');
  });

  it('creates a missing row when the sheet has no rows at all (self-closed <sheetData/>)', async () => {
    const empty = (await sheetXml({ name: 'S', rows: [] })).replace('<sheetData></sheetData>', '<sheetData/>');
    expect(patchSheet(empty, [num('A1', 100)])).toContain('<sheetData><row r="1"><c r="A1"><v>1</v></c></row></sheetData>');
  });

  it('drops `spans` from a row it changes and from no other row', async () => {
    const xml = await sheetXml({ ...SHEET, spans: true });
    const out = patchSheet(xml, [num('E3', 100)]);
    expect(/<row r="3"[^>]*spans=/.test(out)).toBe(false);
    expect(/<row r="4"[^>]*spans=/.test(out)).toBe(true);
  });

  it('writes text as an inline string with markup escaped, and never as a formula', async () => {
    const out = patchSheet(await sheetXml(), [
      { ref: 'G3', kind: 'text', text: 'Vắng — không có bài nộp' },
      { ref: 'G4', kind: 'text', text: '=SUM(A1) & <b> "x"' },
    ]);
    expect(out).toContain('<c r="G3" t="inlineStr"><is><t xml:space="preserve">Vắng — không có bài nộp</t></is></c>');
    expect(out).toContain('<t xml:space="preserve">=SUM(A1) &amp; &lt;b&gt; &quot;x&quot;</t>');
    expect(out).not.toMatch(/<c r="G4"[^>]*><f>/);
  });

  it('`clear` empties an existing cell but keeps its style; on a missing cell it does nothing at all', async () => {
    const xml = await sheetXml();
    const out = patchSheet(xml, [{ ref: 'E4', kind: 'clear' }, { ref: 'Z50', kind: 'clear' }]);
    expect(out).toContain('<c r="E4" s="2"/>');
    expect(out).not.toContain('r="50"');
  });

  it('refuses to write into a cell that has a formula — even a `clear`', async () => {
    const xml = await sheetXml();
    expect(() => patchSheet(xml, [num('F3', 100)])).toThrow(/công thức/);
    expect(() => patchSheet(xml, [{ ref: 'F4', kind: 'clear' }])).toThrow(/công thức/);
  });

  it('grows <dimension> only when a written cell falls outside it', async () => {
    const xml = await sheetXml();
    expect(xml).toContain('<dimension ref="A1:F8"/>');
    expect(patchSheet(xml, [num('H3', 100)])).toContain('<dimension ref="A1:H8"/>');
    expect(patchSheet(xml, [num('E20', 100)])).toContain('<dimension ref="A1:F20"/>');
    expect(patchSheet(xml, [num('E3', 100)])).toContain('<dimension ref="A1:F8"/>');
    expect(patchSheet(xml, [{ ref: 'Z99', kind: 'clear' }])).toContain('<dimension ref="A1:F8"/>');
  });

  it('with no edits it returns the XML untouched', async () => {
    const xml = await sheetXml();
    expect(patchSheet(xml, [])).toBe(xml);
  });

  it('refuses the same cell twice, a bad address, a row without `r`, rows out of order, and stray content', async () => {
    const xml = await sheetXml();
    expect(() => patchSheet(xml, [num('E3', 1), num('E3', 2)])).toThrow(PatchError);
    expect(() => patchSheet(xml, [num('e3', 1)])).toThrow(PatchError);
    expect(() => patchSheet(xml.replace('<row r="3">', '<row>'), [num('E3', 1)])).toThrow(PatchError);
    expect(() => patchSheet(xml.replace('<row r="4">', '<row r="2">'), [num('E3', 1)])).toThrow(PatchError);
    expect(() => patchSheet(xml.replace('<row r="4">', '<junk/><row r="4">'), [num('E3', 1)])).toThrow(PatchError);
    expect(() => patchSheet(xml.replace('<worksheet ', '<x:worksheet ').replace('</worksheet>', '</x:worksheet>'), [num('E3', 1)])).toThrow(PatchError);
  });
});

describe('forceRecalcOnLoad (spec D25)', () => {
  it('adds the attribute to an existing <calcPr>', () => {
    expect(forceRecalcOnLoad('<workbook><sheets/><calcPr calcId="191029"/></workbook>')).toBe('<workbook><sheets/><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>');
  });
  it('turns a false value into 1', () => {
    expect(forceRecalcOnLoad('<workbook><calcPr fullCalcOnLoad="0" calcId="1"/></workbook>')).toContain('fullCalcOnLoad="1"');
  });
  it('handles a non-self-closed <calcPr></calcPr> without adding a second one', () => {
    const out = forceRecalcOnLoad('<workbook><calcPr calcId="1"></calcPr></workbook>');
    expect(out.match(/<calcPr/g)).toHaveLength(1);
    expect(out).toContain('fullCalcOnLoad="1"');
  });
  it('creates <calcPr> in schema order: after definedNames, before oleSize / extLst / the end', () => {
    expect(forceRecalcOnLoad('<workbook><sheets/><definedNames/></workbook>')).toBe('<workbook><sheets/><definedNames/><calcPr fullCalcOnLoad="1"/></workbook>');
    expect(forceRecalcOnLoad('<workbook><sheets/><oleSize ref="A1"/></workbook>')).toBe('<workbook><sheets/><calcPr fullCalcOnLoad="1"/><oleSize ref="A1"/></workbook>');
    expect(forceRecalcOnLoad('<workbook><sheets/><extLst/></workbook>')).toBe('<workbook><sheets/><calcPr fullCalcOnLoad="1"/><extLst/></workbook>');
  });
  it('refuses a prefixed workbook', () => {
    expect(() => forceRecalcOnLoad('<x:workbook></x:workbook>')).toThrow(PatchError);
  });
});

describe('patchWorkbook — everything else in the package is unchanged (Review Focus 1)', () => {
  it('every entry except the sheet and workbook.xml is byte-identical; workbook.xml differs only by fullCalcOnLoad; the sheet only in the edited cells', async () => {
    const original = await readZipEntries(await buildXlsx([SHEET]));
    const patched = await readZipEntries(await writeZip(patchWorkbook(original, 'xl/worksheets/sheet1.xml', [num('E3', 750), { ref: 'G3', kind: 'text', text: 'Vắng — không có bài nộp' }])));

    expect(patched.map((e) => e.name)).toEqual(original.map((e) => e.name));
    for (const before of original) {
      const after = patched.find((e) => e.name === before.name)!;
      if (before.name === 'xl/worksheets/sheet1.xml' || before.name === 'xl/workbook.xml') continue;
      expect({ name: before.name, same: after.data.equals(before.data) }).toEqual({ name: before.name, same: true });
      expect(after.date).toEqual(before.date);
    }
    const wbBefore = original.find((e) => e.name === 'xl/workbook.xml')!.data.toString();
    const wbAfter = patched.find((e) => e.name === 'xl/workbook.xml')!.data.toString();
    expect(wbAfter.replace(' fullCalcOnLoad="1"', '')).toBe(wbBefore);
    const shBefore = original.find((e) => e.name === 'xl/worksheets/sheet1.xml')!.data.toString();
    const shAfter = patched.find((e) => e.name === 'xl/worksheets/sheet1.xml')!.data.toString();
    expect(without(shAfter, ['E3', 'G3'])).toBe(without(shBefore, ['E3', 'G3']).replace('<dimension ref="A1:F8"/>', '<dimension ref="A1:G8"/>'));
  });

  it('a workbook with no <calcPr> gets one; with no edits nothing at all changes', async () => {
    const original = await readZipEntries(await buildXlsx([SHEET], { noCalcPr: true }));
    const patched = patchWorkbook(original, 'xl/worksheets/sheet1.xml', [num('E3', 100)]);
    const wb = patched.find((e) => e.name === 'xl/workbook.xml')!.data.toString();
    expect(wb.replace('<calcPr fullCalcOnLoad="1"/>', '')).toBe(original.find((e) => e.name === 'xl/workbook.xml')!.data.toString());
    expect(patchWorkbook(original, 'xl/worksheets/sheet1.xml', [])).toBe(original);
  });

  it('refuses a sheet part that is not in the package', async () => {
    const original = await readZipEntries(await buildXlsx([SHEET]));
    expect(() => patchWorkbook(original, 'xl/worksheets/sheet9.xml', [num('E3', 100)])).toThrow(PatchError);
  });
});

import { GRID_ROWS } from './grade-export.types';
import { buildGrid } from './inspect-grid';
import type { CellRead, SheetRead } from './xlsx/workbook-reader';

function sheet(rows: (string | number | null)[][], over: Partial<SheetRead> = {}): SheetRead {
  const cells = new Map<string, CellRead>();
  let columnCount = 0;
  rows.forEach((cells_, r) =>
    cells_.forEach((v, c) => {
      if (v === null) return;
      const ref = `${String.fromCharCode(65 + c)}${r + 1}`;
      cells.set(ref, { ref, text: String(v), kind: typeof v === 'number' ? 'number' : 'text', hasFormula: false });
      columnCount = Math.max(columnCount, c + 1);
    }),
  );
  return { name: 'S', path: 'p', protected: false, rowCount: rows.length, columnCount, cells, merges: [], ...over };
}

describe('buildGrid', () => {
  it('lists a column letter for every used column and one entry per row from `fromRow`', () => {
    const grid = buildGrid(sheet([['STT', 'MSSV', 'Điểm'], [1, '20120001', null]]), 1);
    expect(grid.columns).toEqual(['A', 'B', 'C']);
    expect(grid.rows.map((r) => r.row)).toEqual([1, 2]);
    expect(grid.rows[1]!.cells.map((c) => [c.text, c.kind])).toEqual([['1', 'number'], ['20120001', 'text'], ['', 'empty']]);
    expect(grid).toMatchObject({ name: 'S', rowCount: 2, columnCount: 3, protected: false, fromRow: 1, hasMore: false });
  });

  it('shows at most GRID_ROWS rows and says there are more; paging continues from `fromRow`', () => {
    const rows = Array.from({ length: 100 }, (_, i) => [i + 1]);
    const first = buildGrid(sheet(rows), 1);
    expect(first.rows).toHaveLength(GRID_ROWS);
    expect(first.hasMore).toBe(true);
    const third = buildGrid(sheet(rows), 81);
    expect(third.rows[0]!.row).toBe(81);
    expect(third.rows).toHaveLength(20);
    expect(third.hasMore).toBe(false);
  });

  it('a start row past the end gives no rows, not an error', () => {
    expect(buildGrid(sheet([['a']]), 50).rows).toEqual([]);
  });

  it('truncates a very long cell text and never leaks "other" as a fourth kind', () => {
    const s = sheet([['x'.repeat(500)]]);
    s.cells.set('B1', { ref: 'B1', text: 'TRUE', kind: 'other', hasFormula: false });
    s.columnCount = 2;
    const grid = buildGrid(s, 1);
    expect(grid.rows[0]!.cells[0]!.text).toHaveLength(200);
    expect(grid.rows[0]!.cells[1]!.kind).toBe('text');
  });

  it('carries the formula flag and an empty sheet still has one column', () => {
    const s = sheet([['=A1']]);
    s.cells.set('A1', { ref: 'A1', text: '3', kind: 'number', hasFormula: true });
    expect(buildGrid(s, 1).rows[0]!.cells[0]!.formula).toBe(true);
    expect(buildGrid(sheet([]), 1)).toMatchObject({ columns: ['A'], rows: [], rowCount: 0 });
  });
});

import { GRID_ROWS, MAX_COLUMNS } from './grade-export.types';
import { cellAt, type SheetRead } from './xlsx/workbook-reader';
import { indexToCol } from './xlsx/xml-text';

export interface GridCell {
  text: string;
  kind: 'empty' | 'text' | 'number';
  formula: boolean;
}
export interface InspectGrid {
  name: string;
  rowCount: number;
  columnCount: number;
  protected: boolean;
  fromRow: number;
  columns: string[];
  rows: { row: number; cells: GridCell[] }[];
  hasMore: boolean;
}

const MAX_CELL_TEXT = 200;

/** Lưới xem trước để giảng viên chọn cột — `GRID_ROWS` dòng từ `fromRow`, mỗi ô cắt còn 200 ký tự. */
export function buildGrid(sheet: SheetRead, fromRow: number): InspectGrid {
  const width = Math.min(Math.max(sheet.columnCount, 1), MAX_COLUMNS);
  const columns = Array.from({ length: width }, (_, i) => indexToCol(i + 1));
  const last = Math.min(fromRow + GRID_ROWS - 1, sheet.rowCount);
  const rows: InspectGrid['rows'] = [];
  for (let row = fromRow; row <= last; row++) {
    rows.push({
      row,
      cells: columns.map((_, i) => {
        const cell = cellAt(sheet, i + 1, row);
        return { text: cell.text.slice(0, MAX_CELL_TEXT), kind: cell.kind === 'other' ? 'text' : cell.kind, formula: cell.hasFormula };
      }),
    });
  }
  return {
    name: sheet.name,
    rowCount: sheet.rowCount,
    columnCount: sheet.columnCount,
    protected: sheet.protected,
    fromRow,
    columns,
    rows,
    hasMore: last < sheet.rowCount,
  };
}

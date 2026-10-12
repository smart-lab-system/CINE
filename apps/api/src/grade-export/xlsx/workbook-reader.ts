import { posix } from 'node:path';
import { MAX_CELLS, MAX_COLUMNS, MAX_SHEET_ROW } from '../grade-export.types';
import { decodeXml, indexToCol, parseRef, readAttr, readPrefixedAttr } from './xml-text';
import type { ZipEntry } from './zip-io';

/**
 * Bộ đọc SpreadsheetML tối thiểu — chỉ đủ cho việc ghi điểm vào sổ điểm (spec §4.2). Chỉ đọc bản KHÔNG TIỀN TỐ
 * namespace: bộ vá ghi phải phát ra phần tử cùng tiền tố, và mọi file thật của giảng viên (Excel, LibreOffice,
 * Google Sheets) không tiền tố. File lạ bị từ chối có tên, không bị đọc sai (D22).
 */
export class NotWorkbookError extends Error {}
export class MacroWorkbookError extends Error {}
export class UnsupportedWorkbookError extends Error {}
export class SheetNotFoundError extends Error {}
export class SheetTooLargeError extends Error {}

const MAIN_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml';

export interface SheetInfo {
  name: string;
  hidden: boolean;
  path: string;
}
export interface Workbook {
  entries: Map<string, ZipEntry>;
  sheets: SheetInfo[];
  sharedStrings: string[];
}
export interface CellRead {
  ref: string;
  text: string;
  kind: 'empty' | 'text' | 'number' | 'other';
  hasFormula: boolean;
}
export interface MergeRange {
  col1: number;
  row1: number;
  col2: number;
  row2: number;
}
export interface SheetRead {
  name: string;
  path: string;
  protected: boolean;
  /** Dòng cuối có ô mang giá trị hoặc công thức. */
  rowCount: number;
  /** Cột cuối có ô mang giá trị hoặc công thức. */
  columnCount: number;
  cells: Map<string, CellRead>;
  merges: MergeRange[];
}

function part(entries: Map<string, ZipEntry>, name: string): string | null {
  const entry = entries.get(name);
  return entry ? entry.data.toString('utf8').replace(/^﻿/, '') : null;
}

const resolveTarget = (target: string) => posix.normalize(target.startsWith('/') ? target.slice(1) : `xl/${target}`);

export function openWorkbook(list: ZipEntry[]): Workbook {
  const entries = new Map(list.map((entry) => [entry.name, entry]));
  const contentTypes = part(entries, '[Content_Types].xml');
  const workbookXml = part(entries, 'xl/workbook.xml');
  if (contentTypes === null || workbookXml === null) throw new NotWorkbookError('thiếu [Content_Types].xml hoặc xl/workbook.xml');

  const override = /<Override\b[^>]*?\bPartName="\/xl\/workbook\.xml"[^>]*?\/?>/.exec(contentTypes);
  const contentType = override ? readAttr(override[0], 'ContentType') : null;
  if (contentType === null) throw new NotWorkbookError('không khai loại nội dung của xl/workbook.xml');
  if (contentType.includes('macroEnabled')) throw new MacroWorkbookError(contentType);
  if (contentType !== MAIN_CONTENT_TYPE) throw new NotWorkbookError(`loại nội dung ${contentType}`);
  if (!/<workbook[\s>]/.test(workbookXml)) throw new UnsupportedWorkbookError('workbook.xml có tiền tố namespace');

  const relsXml = part(entries, 'xl/_rels/workbook.xml.rels');
  if (relsXml === null) throw new NotWorkbookError('thiếu xl/_rels/workbook.xml.rels');
  const targets = new Map<string, string>();
  for (const match of relsXml.matchAll(/<Relationship\b([^>]*?)\/?>/g)) {
    const id = readAttr(match[1] ?? '', 'Id');
    const target = readAttr(match[1] ?? '', 'Target');
    if (id && target) targets.set(id, resolveTarget(target));
  }

  const sheets: SheetInfo[] = [];
  for (const match of workbookXml.matchAll(/<sheet\b([^>]*?)\/?>/g)) {
    const attrs = match[1] ?? '';
    const name = readAttr(attrs, 'name');
    const rid = readPrefixedAttr(attrs, 'id');
    if (name === null || rid === null) throw new UnsupportedWorkbookError('trang tính thiếu tên hoặc r:id');
    const path = targets.get(rid);
    if (!path) throw new UnsupportedWorkbookError(`trang tính "${name}" trỏ tới quan hệ ${rid} không có`);
    const state = readAttr(attrs, 'state');
    sheets.push({ name, hidden: state === 'hidden' || state === 'veryHidden', path });
  }
  return { entries, sheets, sharedStrings: parseSharedStrings(part(entries, 'xl/sharedStrings.xml')) };
}

/** Ghép mọi `<t>` của một chuỗi — bỏ chú thích ngữ âm (`rPh`) vì nó không phải chữ hiển thị. */
export function textOfRuns(inner: string): string {
  const cleaned = inner.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').replace(/<phoneticPr\b[^>]*\/>/g, '');
  let text = '';
  for (const match of cleaned.matchAll(/<t\b[^>]*?(?:\/>|>([\s\S]*?)<\/t>)/g)) text += decodeXml(match[1] ?? '');
  return text;
}

function parseSharedStrings(xml: string | null): string[] {
  if (xml === null) return [];
  const out: string[] = [];
  for (const match of xml.matchAll(/<si\b[^>]*?(?:\/>|>([\s\S]*?)<\/si>)/g)) out.push(textOfRuns(match[1] ?? ''));
  return out;
}

function readCell(ref: string, attrs: string, inner: string, sst: string[]): CellRead {
  const t = readAttr(attrs, 't');
  const hasFormula = /<f[\s>/]/.test(inner);
  const vMatch = /<v\b[^>]*?(?:\/>|>([\s\S]*?)<\/v>)/.exec(inner);
  const v = vMatch ? decodeXml(vMatch[1] ?? '') : '';
  const make = (text: string, kind: CellRead['kind']): CellRead => ({
    ref,
    text,
    kind: text.trim() === '' ? 'empty' : kind,
    hasFormula,
  });
  switch (t) {
    case 's':
      return make(sst[Number(v)] ?? '', 'text');
    case 'inlineStr': {
      const is = /<is\b[^>]*>([\s\S]*?)<\/is>/.exec(inner);
      return make(is ? textOfRuns(is[1] ?? '') : '', 'text');
    }
    case 'str':
      return make(v, 'text');
    case 'b':
      return { ref, text: v === '1' ? 'TRUE' : 'FALSE', kind: 'other', hasFormula };
    case 'e':
    case 'd':
      return make(v, 'other');
    default:
      return make(v.trim(), 'number');
  }
}

export function readSheet(wb: Workbook, name: string): SheetRead {
  const info = wb.sheets.find((sheet) => sheet.name === name);
  if (!info) throw new SheetNotFoundError(name);
  const xml = part(wb.entries, info.path);
  if (xml === null) throw new UnsupportedWorkbookError(`thiếu ${info.path}`);
  if (!/<worksheet[\s>]/.test(xml)) throw new UnsupportedWorkbookError('trang tính có tiền tố namespace');

  const cells = new Map<string, CellRead>();
  let rowCount = 0;
  let columnCount = 0;
  let seen = 0;
  const sheetData = /<sheetData\b[^>]*?(?:\/>|>([\s\S]*?)<\/sheetData>)/.exec(xml);
  for (const rowMatch of (sheetData?.[1] ?? '').matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const rAttr = readAttr(rowMatch[1] ?? '', 'r');
    const rowNumber = rAttr === null ? NaN : Number(rAttr);
    if (!Number.isInteger(rowNumber) || rowNumber < 1) throw new UnsupportedWorkbookError('dòng không có địa chỉ (r)');
    for (const cellMatch of (rowMatch[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      if (++seen > MAX_CELLS) throw new SheetTooLargeError(`quá ${MAX_CELLS} ô`);
      const attrs = cellMatch[1] ?? '';
      const ref = readAttr(attrs, 'r');
      if (ref === null) throw new UnsupportedWorkbookError('ô không có địa chỉ (r)');
      const pos = parseRef(ref);
      if (!pos) throw new UnsupportedWorkbookError(`địa chỉ ô "${ref}" không hợp lệ`);
      const cell = readCell(ref, attrs, cellMatch[2] ?? '', wb.sharedStrings);
      const valued = cell.kind !== 'empty' || cell.hasFormula;
      const outside = pos.col > MAX_COLUMNS || pos.row > MAX_SHEET_ROW;
      if (outside && valued) throw new SheetTooLargeError(`ô ${ref} nằm ngoài cột ${indexToCol(MAX_COLUMNS)} / dòng ${MAX_SHEET_ROW}`);
      if (outside) continue;
      cells.set(ref, cell);
      if (valued) {
        rowCount = Math.max(rowCount, pos.row);
        columnCount = Math.max(columnCount, pos.col);
      }
    }
  }

  const merges: MergeRange[] = [];
  for (const match of xml.matchAll(/<mergeCell\b([^>]*?)\/?>/g)) {
    const ref = readAttr(match[1] ?? '', 'ref');
    if (!ref) continue;
    const [a, b] = ref.split(':');
    const p1 = parseRef(a ?? '');
    const p2 = parseRef(b ?? a ?? '');
    if (p1 && p2) {
      merges.push({ col1: Math.min(p1.col, p2.col), row1: Math.min(p1.row, p2.row), col2: Math.max(p1.col, p2.col), row2: Math.max(p1.row, p2.row) });
    }
  }

  return {
    name,
    path: info.path,
    protected: /<sheetProtection\b[^>]*?\bsheet=(?:"(?:1|true)"|'(?:1|true)')/.test(xml),
    rowCount,
    columnCount,
    cells,
    merges,
  };
}

export function cellAt(sheet: SheetRead, col: number, row: number): CellRead {
  const ref = `${indexToCol(col)}${row}`;
  return sheet.cells.get(ref) ?? { ref, text: '', kind: 'empty', hasFormula: false };
}

/** Ô nằm trong một vùng gộp nhưng KHÔNG phải ô trên-trái: ghi vào đó không hiện ra và làm hỏng vùng gộp. */
export function isMergedNonMaster(sheet: SheetRead, col: number, row: number): boolean {
  return sheet.merges.some(
    (m) => col >= m.col1 && col <= m.col2 && row >= m.row1 && row <= m.row2 && !(col === m.col1 && row === m.row1),
  );
}

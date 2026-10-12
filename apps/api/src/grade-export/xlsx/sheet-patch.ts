import { encodeXml, indexToCol, parseRef, readAttr } from './xml-text';
import type { ZipEntry } from './zip-io';

/**
 * Vá ĐÚNG các ô được yêu cầu trong XML của một trang tính — không dựng lại workbook (spec D1). Mọi dòng không
 * đụng tới được phát lại NGUYÊN VĂN; ô có sẵn giữ mọi thuộc tính trừ `t`; ô/dòng thiếu được chèn ĐÚNG THỨ TỰ.
 * Ô có công thức bị từ chối: ghi đè nó phá dữ liệu của giảng viên và làm `calcChain` lệch.
 */
export class PatchError extends Error {}

export type CellEdit =
  | { ref: string; kind: 'number'; hundredths: number }
  | { ref: string; kind: 'text'; text: string }
  | { ref: string; kind: 'clear' };

/** `725` → `7.25`, `750` → `7.5`, `1000` → `10`. Từ SỐ NGUYÊN, không qua số thực (parent §13.2). */
export function hundredthsToXml(hundredths: number): string {
  if (!Number.isInteger(hundredths) || hundredths < 0) throw new PatchError(`điểm ${hundredths} không hợp lệ`);
  const whole = Math.floor(hundredths / 100);
  const frac = hundredths % 100;
  if (frac === 0) return String(whole);
  return frac % 10 === 0 ? `${whole}.${frac / 10}` : `${whole}.${String(frac).padStart(2, '0')}`;
}

const ROW_RE = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g;
const CELL_RE = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
const HAS_FORMULA = /<f[\s>/]/;

const keepAttrs = (attrs: string) => attrs.replace(/\s+(?:r|t)=(?:"[^"]*"|'[^']*')/g, '');

function cellXml(ref: string, kept: string, edit: CellEdit): string {
  const head = `<c r="${ref}"${kept}`;
  switch (edit.kind) {
    case 'number':
      return `${head}><v>${hundredthsToXml(edit.hundredths)}</v></c>`;
    case 'text':
      return `${head} t="inlineStr"><is><t xml:space="preserve">${encodeXml(edit.text)}</t></is></c>`;
    case 'clear':
      return `${head}/>`;
  }
}

function groupByColumn(row: number, edits: CellEdit[]): Map<number, CellEdit> {
  const byCol = new Map<number, CellEdit>();
  for (const edit of edits) {
    const pos = parseRef(edit.ref)!;
    if (pos.row !== row) throw new PatchError(`ô ${edit.ref} không thuộc dòng ${row}`);
    if (byCol.has(pos.col)) throw new PatchError(`ô ${edit.ref} được sửa hai lần`);
    byCol.set(pos.col, edit);
  }
  return byCol;
}

function newRow(row: number, edits: CellEdit[]): string {
  const cells = [...groupByColumn(row, edits)]
    .filter(([, edit]) => edit.kind !== 'clear') // xoá một ô chưa có là không làm gì — không tạo dòng chỉ để xoá
    .sort((a, b) => a[0] - b[0])
    .map(([, edit]) => cellXml(edit.ref, '', edit));
  return cells.length === 0 ? '' : `<row r="${row}">${cells.join('')}</row>`;
}

function patchRow(rowXml: string, row: number, edits: CellEdit[]): string {
  const m = /^<row\b([^>]*?)(\/>|>([\s\S]*)<\/row>)$/.exec(rowXml);
  if (!m) throw new PatchError(`không đọc được dòng ${row}`);
  const attrs = (m[1] ?? '').replace(/\s+spans=(?:"[^"]*"|'[^']*')/, ''); // `spans` chỉ là gợi ý tối ưu; bỏ để không sai
  const content = m[3] ?? '';

  const cells: { col: number; xml: string; attrs: string; formula: boolean }[] = [];
  let cursor = 0;
  for (const c of content.matchAll(CELL_RE)) {
    if (content.slice(cursor, c.index ?? 0).trim() !== '') throw new PatchError(`nội dung lạ giữa các ô ở dòng ${row}`);
    const ref = readAttr(c[1] ?? '', 'r');
    const pos = ref ? parseRef(ref) : null;
    if (!pos || pos.row !== row) throw new PatchError(`ô không có địa chỉ hợp lệ trong dòng ${row}`);
    const prev = cells[cells.length - 1];
    if (prev && pos.col <= prev.col) throw new PatchError(`các ô của dòng ${row} không theo thứ tự cột`);
    cells.push({ col: pos.col, xml: c[0], attrs: c[1] ?? '', formula: HAS_FORMULA.test(c[2] ?? '') });
    cursor = (c.index ?? 0) + c[0].length;
  }
  if (content.slice(cursor).trim() !== '') throw new PatchError(`nội dung lạ sau ô cuối của dòng ${row}`);

  const byCol = groupByColumn(row, edits);
  const out: { col: number; xml: string }[] = [];
  const used = new Set<number>();
  let changed = false;
  for (const cell of cells) {
    const edit = byCol.get(cell.col);
    if (!edit) {
      out.push({ col: cell.col, xml: cell.xml });
      continue;
    }
    if (cell.formula) throw new PatchError(`ô ${edit.ref} có công thức — không ghi được`);
    used.add(cell.col);
    changed = true;
    out.push({ col: cell.col, xml: cellXml(edit.ref, keepAttrs(cell.attrs), edit) });
  }
  for (const [col, edit] of byCol) {
    if (used.has(col) || edit.kind === 'clear') continue;
    changed = true;
    out.push({ col, xml: cellXml(edit.ref, '', edit) });
  }
  if (!changed) return rowXml;
  out.sort((a, b) => a.col - b.col);
  return `<row${attrs}>${out.map((c) => c.xml).join('')}</row>`;
}

function extendDimension(xml: string, written: { col: number; row: number }[]): string {
  if (written.length === 0) return xml;
  const m = /<dimension\b([^>]*?)\/>/.exec(xml);
  if (!m) return xml;
  const ref = readAttr(m[1] ?? '', 'ref');
  if (!ref) return xml;
  const [a, b] = ref.split(':');
  const p1 = parseRef(a ?? '');
  const p2 = parseRef(b ?? a ?? '');
  if (!p1 || !p2) return xml;
  let { col: col1, row: row1 } = p1;
  let { col: col2, row: row2 } = p2;
  for (const p of written) {
    col1 = Math.min(col1, p.col);
    row1 = Math.min(row1, p.row);
    col2 = Math.max(col2, p.col);
    row2 = Math.max(row2, p.row);
  }
  if (col1 === p1.col && row1 === p1.row && col2 === p2.col && row2 === p2.row) return xml;
  return xml.replace(m[0], () => `<dimension ref="${indexToCol(col1)}${row1}:${indexToCol(col2)}${row2}"/>`);
}

export function patchSheet(xml: string, edits: CellEdit[]): string {
  if (edits.length === 0) return xml;
  if (!/<worksheet[\s>]/.test(xml)) throw new PatchError('trang tính có tiền tố namespace');

  const byRow = new Map<number, CellEdit[]>();
  const written: { col: number; row: number }[] = [];
  for (const edit of edits) {
    const pos = parseRef(edit.ref);
    if (!pos) throw new PatchError(`địa chỉ ô "${edit.ref}" không hợp lệ`);
    if (edit.kind !== 'clear') written.push(pos);
    byRow.set(pos.row, [...(byRow.get(pos.row) ?? []), edit]);
  }

  const open = /<sheetData\b[^>]*?(\/>|>)/.exec(xml);
  if (!open) throw new PatchError('trang tính không có <sheetData>');
  const openEnd = open.index + open[0].length;
  let inner = '';
  let closeEnd = openEnd;
  if (open[1] === '>') {
    const closeAt = xml.indexOf('</sheetData>', openEnd);
    if (closeAt < 0) throw new PatchError('<sheetData> không đóng');
    inner = xml.slice(openEnd, closeAt);
    closeEnd = closeAt + '</sheetData>'.length;
  }

  const chunks: { row: number; text: string }[] = [];
  let cursor = 0;
  for (const m of inner.matchAll(ROW_RE)) {
    if (inner.slice(cursor, m.index ?? 0).trim() !== '') throw new PatchError('có nội dung lạ giữa các dòng');
    const rAttr = readAttr(m[1] ?? '', 'r');
    const row = rAttr === null ? NaN : Number(rAttr);
    if (!Number.isInteger(row) || row < 1) throw new PatchError('dòng không có địa chỉ (r)');
    const prev = chunks[chunks.length - 1];
    if (prev && row <= prev.row) throw new PatchError('các dòng không theo thứ tự tăng dần');
    chunks.push({ row, text: m[0] });
    cursor = (m.index ?? 0) + m[0].length;
  }
  if (inner.slice(cursor).trim() !== '') throw new PatchError('có nội dung lạ sau dòng cuối');

  const pending = [...byRow.keys()].sort((a, b) => a - b);
  let p = 0;
  const out: string[] = [];
  const flushNewRowsBefore = (limit: number) => {
    while (p < pending.length && pending[p]! < limit) {
      out.push(newRow(pending[p]!, byRow.get(pending[p]!)!));
      p++;
    }
  };
  for (const chunk of chunks) {
    flushNewRowsBefore(chunk.row);
    if (p < pending.length && pending[p] === chunk.row) {
      out.push(patchRow(chunk.text, chunk.row, byRow.get(chunk.row)!));
      p++;
    } else {
      out.push(chunk.text);
    }
  }
  flushNewRowsBefore(Number.POSITIVE_INFINITY);

  const openTag = open[1] === '>' ? xml.slice(open.index, openEnd) : '<sheetData>';
  const result = xml.slice(0, open.index) + openTag + out.join('') + '</sheetData>' + xml.slice(closeEnd);
  return extendDimension(result, written);
}

/**
 * D25 — công thức phụ thuộc ô ta ghi (cột *Tổng kết*) giữ giá trị đệm CŨ nếu ta chỉ vá ô điểm. `fullCalcOnLoad`
 * bảo Excel tính lại khi mở. Đây là thay đổi DUY NHẤT ngoài trang tính đích.
 */
export function forceRecalcOnLoad(workbookXml: string): string {
  if (!/<workbook[\s>]/.test(workbookXml)) throw new PatchError('workbook.xml có tiền tố namespace');
  const calc = /<calcPr\b([^>]*?)(?:\/>|>\s*<\/calcPr>)/.exec(workbookXml);
  if (calc) {
    const attrs = calc[1] ?? '';
    const next = /\sfullCalcOnLoad=(?:"[^"]*"|'[^']*')/.test(attrs)
      ? attrs.replace(/(\sfullCalcOnLoad=)(?:"[^"]*"|'[^']*')/, '$1"1"')
      : `${attrs} fullCalcOnLoad="1"`;
    return workbookXml.replace(calc[0], () => `<calcPr${next}/>`);
  }
  // Thứ tự phần tử của CT_Workbook: … definedNames, calcPr, oleSize, customWorkbookViews, pivotCaches, … extLst.
  const after = ['<oleSize', '<customWorkbookViews', '<pivotCaches', '<smartTagPr', '<smartTagTypes', '<webPublishing', '<fileRecoveryPr', '<webPublishObjects', '<extLst', '</workbook>'];
  let at = -1;
  for (const marker of after) {
    const i = workbookXml.indexOf(marker);
    if (i >= 0 && (at < 0 || i < at)) at = i;
  }
  if (at < 0) throw new PatchError('workbook.xml không có </workbook>');
  return workbookXml.slice(0, at) + '<calcPr fullCalcOnLoad="1"/>' + workbookXml.slice(at);
}

/** Thay trang tính đích và (khi có ô sửa) `xl/workbook.xml`; mọi entry khác được trả về NGUYÊN đối tượng. */
export function patchWorkbook(entries: ZipEntry[], sheetPath: string, edits: CellEdit[]): ZipEntry[] {
  if (!entries.some((entry) => entry.name === sheetPath)) throw new PatchError(`không có ${sheetPath}`);
  if (edits.length === 0) return entries;
  return entries.map((entry) => {
    if (entry.name === sheetPath) return { ...entry, data: Buffer.from(patchSheet(entry.data.toString('utf8'), edits), 'utf8') };
    if (entry.name === 'xl/workbook.xml') return { ...entry, data: Buffer.from(forceRecalcOnLoad(entry.data.toString('utf8')), 'utf8') };
    return entry;
  });
}

import JSZip from 'jszip';
import { encodeXml, indexToCol } from '../xlsx/xml-text';

/**
 * Dựng một `.xlsx` TỐI THIỂU nhưng đủ hình dạng thật (sharedStrings, styles, theme, calcChain, một ảnh, docProps) để
 * test "mọi phần khác giữ nguyên" có cái để giữ. Chỉ dùng trong test — cùng chỗ với `eval/testing/mini-de.ts`.
 */
export const FIXTURE_DATE = new Date(Date.UTC(2026, 8, 1, 10, 20, 30));

export type FixtureCell =
  | string
  | number
  | null
  | undefined
  | { formula: string; value?: string | number }
  /** Chuỗi chia sẻ dạng rich text (hai đoạn <r>). */
  | { rich: string }
  /** Ô có style tường minh. */
  | { v: string | number; s: number };

export interface FixtureSheet {
  name: string;
  /** Chỉ số 0 = dòng 1. `null` = KHÔNG có phần tử <row> cho dòng đó; `[]` = dòng tự đóng `<row r="n"/>`. */
  rows: (FixtureCell[] | null)[];
  hidden?: boolean;
  /** Ví dụ ['A1:F1']. */
  merges?: string[];
  protect?: boolean;
  /** Ghi chuỗi bằng inlineStr thay vì sharedStrings. */
  inline?: boolean;
  /** Style áp cho MỌI ô của cột (1-based), kể cả ô rỗng: { 5: 1 } → cột E dùng cellXfs[1]. */
  columnStyle?: Record<number, number>;
  /** Bỏ thuộc tính `r` của ô — để thử từ chối. */
  omitCellRefs?: boolean;
  /** Thêm thuộc tính spans vào mọi dòng. */
  spans?: boolean;
}

export interface FixtureOptions {
  extraEntries?: { name: string; data: Buffer | string }[];
  workbookContentType?: string;
  /** Trang tính dùng tiền tố `x:` — để thử từ chối. */
  prefixed?: boolean;
  noCalcPr?: boolean;
}

const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const MAIN_CT = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml';
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

export async function buildXlsx(sheets: FixtureSheet[], opts: FixtureOptions = {}): Promise<Buffer> {
  const shared: string[] = [];
  const sharedIndex = (xml: string): number => {
    shared.push(xml);
    return shared.length - 1;
  };
  const plain = (text: string) => `<si><t xml:space="preserve">${encodeXml(text)}</t></si>`;
  const rich = (text: string) =>
    `<si><r><t xml:space="preserve">${encodeXml(text.slice(0, 1))}</t></r><r><rPr><b/></rPr><t xml:space="preserve">${encodeXml(text.slice(1))}</t></r><rPh sb="0" eb="1"><t>ph</t></rPh></si>`;

  const sheetXml = sheets.map((sheet) => {
    if (opts.prefixed) {
      return `${XML}<x:worksheet xmlns:x="${NS}"><x:sheetData><x:row r="1"><x:c r="A1"><x:v>1</x:v></x:c></x:row></x:sheetData></x:worksheet>`;
    }
    const maxCol = Math.max(1, ...sheet.rows.map((r) => r?.length ?? 0));
    const rows = sheet.rows
      .map((cells, rowIndex) => {
        if (cells === null) return '';
        const r = rowIndex + 1;
        const spans = sheet.spans ? ` spans="1:${maxCol}"` : '';
        if (cells.length === 0) return `<row r="${r}"${spans}/>`;
        const body = cells
          .map((cell, colIndex) => {
            const col = colIndex + 1;
            const ref = `${indexToCol(col)}${r}`;
            const rAttr = sheet.omitCellRefs ? '' : ` r="${ref}"`;
            const colStyle = sheet.columnStyle?.[col];
            const styleOf = (explicit?: number) => {
              const s = explicit ?? colStyle;
              return s === undefined ? '' : ` s="${s}"`;
            };
            if (cell === null || cell === undefined) return colStyle === undefined ? '' : `<c${rAttr}${styleOf()}/>`;
            if (typeof cell === 'number') return `<c${rAttr}${styleOf()}><v>${cell}</v></c>`;
            if (typeof cell === 'string') {
              return sheet.inline
                ? `<c${rAttr}${styleOf()} t="inlineStr"><is><t xml:space="preserve">${encodeXml(cell)}</t></is></c>`
                : `<c${rAttr}${styleOf()} t="s"><v>${sharedIndex(plain(cell))}</v></c>`;
            }
            if ('formula' in cell) {
              const value = cell.value;
              if (typeof value === 'string') return `<c${rAttr}${styleOf()} t="str"><f>${encodeXml(cell.formula)}</f><v>${encodeXml(value)}</v></c>`;
              return `<c${rAttr}${styleOf()}><f>${encodeXml(cell.formula)}</f>${value === undefined ? '' : `<v>${value}</v>`}</c>`;
            }
            if ('rich' in cell) return `<c${rAttr}${styleOf()} t="s"><v>${sharedIndex(rich(cell.rich))}</v></c>`;
            return typeof cell.v === 'number'
              ? `<c${rAttr}${styleOf(cell.s)}><v>${cell.v}</v></c>`
              : `<c${rAttr}${styleOf(cell.s)} t="s"><v>${sharedIndex(plain(cell.v))}</v></c>`;
          })
          .join('');
        return `<row r="${r}"${spans}>${body}</row>`;
      })
      .join('');
    const merges = sheet.merges?.length
      ? `<mergeCells count="${sheet.merges.length}">${sheet.merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>`
      : '';
    const protect = sheet.protect ? '<sheetProtection sheet="1" objects="1" scenarios="1"/>' : '';
    return (
      `${XML}<worksheet xmlns="${NS}" xmlns:r="${REL}"><dimension ref="A1:${indexToCol(maxCol)}${sheet.rows.length}"/>` +
      `<sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="15"/>` +
      `<cols><col min="1" max="1" width="14" customWidth="1"/></cols><sheetData>${rows}</sheetData>${protect}${merges}` +
      `<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/></worksheet>`
    );
  });

  const n = sheets.length;
  const workbook =
    `${XML}<workbook xmlns="${NS}" xmlns:r="${REL}"><bookViews><workbookView/></bookViews><sheets>` +
    sheets.map((s, i) => `<sheet name="${encodeXml(s.name)}" sheetId="${i + 1}"${s.hidden ? ' state="hidden"' : ''} r:id="rId${i + 1}"/>`).join('') +
    `</sheets>${opts.noCalcPr ? '' : '<calcPr calcId="191029"/>'}</workbook>`;
  const rels =
    `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
    `<Relationship Id="rId${n + 1}" Type="${REL}/styles" Target="styles.xml"/>` +
    `<Relationship Id="rId${n + 2}" Type="${REL}/sharedStrings" Target="sharedStrings.xml"/>` +
    `<Relationship Id="rId${n + 3}" Type="${REL}/theme" Target="theme/theme1.xml"/></Relationships>`;
  const contentTypes =
    `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="${opts.workbookContentType ?? MAIN_CT}"/>` +
    sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    `<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>`;
  const styles =
    `${XML}<styleSheet xmlns="${NS}"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>` +
    `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
    `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
    `<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
    `<xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>`;
  const sst = `${XML}<sst xmlns="${NS}" count="${shared.length}" uniqueCount="${shared.length}">${shared.join('')}</sst>`;

  const files: [string, string | Buffer][] = [
    ['[Content_Types].xml', contentTypes],
    ['_rels/.rels', `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['docProps/core.xml', `${XML}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"/>`],
    ['xl/workbook.xml', workbook],
    ['xl/_rels/workbook.xml.rels', rels],
    ['xl/styles.xml', styles],
    ['xl/sharedStrings.xml', sst],
    ...sheetXml.map((xml, i): [string, string] => [`xl/worksheets/sheet${i + 1}.xml`, xml]),
    ['xl/theme/theme1.xml', `${XML}<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office"/>`],
    ['xl/calcChain.xml', `${XML}<calcChain xmlns="${NS}"><c r="F3" i="1"/></calcChain>`],
    ['xl/media/logo.png', Buffer.from(Array.from({ length: 256 }, (_, i) => i))],
    ...(opts.extraEntries ?? []).map((e): [string, string | Buffer] => [e.name, e.data]),
  ];

  const zip = new JSZip();
  for (const [name, data] of files) zip.file(name, data, { date: FIXTURE_DATE, createFolders: false });
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

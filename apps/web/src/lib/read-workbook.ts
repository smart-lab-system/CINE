/**
 * Pulls the cells out of an .xlsx or .xls, in the browser.
 *
 * Separated from `roster-file.ts` on purpose: everything there is pure and
 * exhaustively tested, and this is the one part that needs a real file and a
 * real library. Keeping the boundary means the rules that decide whether a
 * roster is acceptable never depend on a mock of a spreadsheet.
 *
 * `.xlsx` → `exceljs` (preferred; npm `xlsx` has a CVE history for this path).
 * `.xls` (BIFF/OLE) → SheetJS community `xlsx`, chỉ cho định dạng cũ ExcelJS
 * không đọc được.
 *
 * Không dùng `cell.text` của ExcelJS: getter đó gọi `.toString()` trên value
 * null / result công thức null → "Cannot read properties of null (reading
 * 'toString')". Đọc `cell.value` thủ công cho an toàn.
 */

export interface SheetData {
  name: string;
  /** Cell text, row-major, 0-based, padded to a rectangle. */
  rows: string[][];
}

/** Well past any real class list; a guard against a pathological file. */
const MAX_ROWS = 2_000;
const MAX_COLUMNS = 40;
const MAX_BYTES = 5 * 1024 * 1024;

export class WorkbookTooLargeError extends Error {}

export async function readWorkbook(file: File): Promise<SheetData[]> {
  if (file.size > MAX_BYTES) {
    throw new WorkbookTooLargeError(
      `File ${(file.size / 1024 / 1024).toFixed(1)}MB vượt quá giới hạn 5MB. ` +
        'Danh sách lớp thường chỉ vài chục KB — hãy kiểm tra lại file.',
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    if (isLegacyXls(file, bytes)) {
      return readXls(bytes);
    }
    return await readXlsx(bytes);
  } catch (error) {
    if (error instanceof WorkbookTooLargeError) throw error;
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Không đọc được file Excel (${detail}). Kiểm tra định dạng .xls/.xlsx hoặc lưu lại bằng Excel rồi thử lại.`,
    );
  }
}

/** OLE Compound Document magic — định dạng .xls cổ. */
function isOleCompound(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0xd0 &&
    bytes[1] === 0xcf &&
    bytes[2] === 0x11 &&
    bytes[3] === 0xe0
  );
}

function isLegacyXls(file: File, bytes: Uint8Array): boolean {
  const name = file.name.toLowerCase();
  if (name.endsWith('.xlsx') || name.endsWith('.xlsm')) return false;
  if (name.endsWith('.xls')) return true;
  return isOleCompound(bytes);
}

async function readXlsx(bytes: Uint8Array): Promise<SheetData[]> {
  const { Workbook } = await import('exceljs');
  const workbook = new Workbook();
  // Uint8Array thay vì ArrayBuffer thô — tránh lỗi realm/instanceof với JSZip.
  const xlsx = workbook.xlsx as unknown as { load(data: Uint8Array): Promise<unknown> };
  await xlsx.load(bytes);

  return workbook.worksheets.map((sheet) => {
    const rowCount = Math.min(
      Math.max(sheet.actualRowCount || 0, sheet.rowCount || 0),
      MAX_ROWS,
    );
    const columnCount = Math.min(
      Math.max(sheet.actualColumnCount || 0, sheet.columnCount || 0),
      MAX_COLUMNS,
    );
    const rows: string[][] = [];

    for (let r = 1; r <= rowCount; r++) {
      const row = sheet.getRow(r);
      const values: string[] = [];
      for (let c = 1; c <= columnCount; c++) {
        values.push(safeCellText(row.getCell(c)?.value));
      }
      rows.push(values);
    }

    return { name: sheet.name || 'Sheet', rows };
  });
}

async function readXls(bytes: Uint8Array): Promise<SheetData[]> {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(bytes, {
    type: 'array',
    cellDates: true,
    // Tránh format path dễ nổ với ô lạ; lấy giá trị thô rồi tự String().
    cellText: false,
  });

  return workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    if (!sheet) {
      return { name, rows: [] as string[][] };
    }

    const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: '',
      raw: true,
      blankrows: true,
    });

    const rowCount = Math.min(raw.length, MAX_ROWS);
    let columnCount = 0;
    for (let r = 0; r < rowCount; r++) {
      const row = raw[r];
      if (Array.isArray(row)) {
        columnCount = Math.max(columnCount, row.length);
      }
    }
    columnCount = Math.min(columnCount, MAX_COLUMNS);

    const rows: string[][] = [];
    for (let r = 0; r < rowCount; r++) {
      const source = Array.isArray(raw[r]) ? raw[r]! : [];
      const values: string[] = [];
      for (let c = 0; c < columnCount; c++) {
        values.push(safeCellText(source[c]));
      }
      rows.push(values);
    }

    return { name, rows };
  });
}

/**
 * Đọc giá trị ô mà không đi qua getter `cell.text` của ExcelJS (dễ crash
 * khi value/result là null).
 */
function safeCellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;

    // Rich text: { richText: [{ text: '...' }, ...] }
    if (Array.isArray(record.richText)) {
      return (record.richText as Array<{ text?: unknown }>)
        .map((part) => (part?.text == null ? '' : String(part.text)))
        .join('')
        .trim();
    }

    // Formula: { formula, result } — result có thể null.
    if ('formula' in record || 'sharedFormula' in record) {
      return safeCellText(record.result);
    }

    // Hyperlink / shared string wrapper: { text: '...' }
    if ('text' in record && record.text != null && typeof record.text !== 'object') {
      return String(record.text).trim();
    }

    // Error cell
    if ('error' in record && record.error != null) {
      return '';
    }
  }

  try {
    return String(value).trim();
  } catch {
    return '';
  }
}

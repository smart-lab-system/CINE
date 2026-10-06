/**
 * Pulls the cells out of an .xlsx, in the browser.
 *
 * Separated from `roster-file.ts` on purpose: everything there is pure and
 * exhaustively tested, and this is the one part that needs a real file and a
 * real library. Keeping the boundary means the rules that decide whether a
 * roster is acceptable never depend on a mock of a spreadsheet.
 *
 * `exceljs` rather than the npm `xlsx` package: the versions published there
 * are old and have a CVE history, and this parses files a user picked.
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

  // Imported lazily: the library is large and only this one screen needs it,
  // so it stays out of every other page's bundle.
  const { Workbook } = await import('exceljs');
  const workbook = new Workbook();
  // Wrapped in a Uint8Array rather than passed as a raw ArrayBuffer: the
  // unwrapped buffer is identified by `instanceof` deeper in the zip reader,
  // which fails whenever it crosses a realm boundary — the case the fixture
  // test hits, and the same shape of bug an iframe or a worker would produce.
  //
  // exceljs ships ONE set of typings for TWO runtime builds, and they
  // describe the Node one, where `load` takes a Buffer. What actually runs
  // here is the browser build — its package.json `browser` field points at
  // dist/exceljs.min.js, which hands the argument straight to JSZip and
  // accepts any Uint8Array. There is no Buffer in a browser to satisfy the
  // declared type with, so the browser signature is stated instead.
  const bytes = new Uint8Array(await file.arrayBuffer());
  const xlsx = workbook.xlsx as unknown as { load(data: Uint8Array): Promise<unknown> };
  await xlsx.load(bytes);

  return workbook.worksheets.map((sheet) => {
    const rowCount = Math.min(sheet.rowCount, MAX_ROWS);
    const columnCount = Math.min(sheet.columnCount, MAX_COLUMNS);
    const rows: string[][] = [];

    // Indexed rather than iterated with eachRow: a sheet with gaps skips
    // rows there, and a skipped row silently shifts every row number the
    // user is about to be shown.
    for (let r = 1; r <= rowCount; r++) {
      const row = sheet.getRow(r);
      const values: string[] = [];
      for (let c = 1; c <= columnCount; c++) {
        values.push(cellText(row.getCell(c)));
      }
      rows.push(values);
    }

    return { name: sheet.name, rows };
  });
}

/**
 * `.text` is the displayed value, which is what the user matched their
 * column choice against — a student id stored as a number reads back as the
 * digits they see, and a formula reads back as its result rather than its
 * source.
 *
 * Ngoại lệ DUY NHẤT: ô ngày. exceljs trả giá trị `Date`, và `.text` của nó là `Date.toString()` theo múi giờ máy
 * ("Tue Sep 01 2026 07:00:00 GMT+0700 (Indochina Time)") — không ai gõ chuỗi đó và không parser nào nhận nó. Ngày được đọc
 * từ GIÁ TRỊ bằng getter UTC: exceljs dựng `Date` ở nửa đêm UTC từ số sê-ri của Excel, nên getter địa phương sẽ cho ngày
 * hôm trước ở mọi múi giờ phía tây Greenwich. Kết quả là `yyyy-mm-dd`, một trong hai dạng không mơ hồ mà server nhận.
 */
function cellText(cell: { text?: string; value?: unknown }): string {
  const date = dateOf(cell.value);
  if (date) {
    return isoDate(date);
  }
  const text = cell.text;
  if (typeof text === 'string') {
    return text.trim();
  }
  const value = cell.value;
  return value === null || value === undefined ? '' : String(value).trim();
}

/** Giá trị là `Date`, hoặc là ô công thức mà kết quả là `Date`. */
function dateOf(value: unknown): Date | null {
  const candidate =
    value instanceof Date
      ? value
      : typeof value === 'object' && value !== null && 'result' in value
        ? (value as { result: unknown }).result
        : null;
  return candidate instanceof Date && !Number.isNaN(candidate.getTime()) ? candidate : null;
}

function isoDate(date: Date): string {
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${String(date.getUTCFullYear()).padStart(4, '0')}-${month}-${day}`;
}

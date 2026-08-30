import type { RosterEntry } from '@/lib/api/roster';

/**
 * Turning a spreadsheet into a class list, in the browser.
 *
 * The .xlsx never reaches the API — CLAUDE.md Security rule 5 — so the
 * parsing, the column mapping and the diff all happen here, and what is
 * posted is plain JSON. Everything below is pure: it takes cells that
 * `readSheets` already pulled out of the workbook and returns data, so the
 * rules can be tested exhaustively without a file or a browser.
 *
 * The rules themselves are re-enforced server-side. This layer exists to
 * tell the user which row is wrong while they can still fix it, not to be
 * trusted.
 */

// Byte-for-byte the API's STUDENT_MSSV_REGEX (apps/api/src/common/
// student-mssv.ts), which is itself the database's ck_enrollment_mssv. A
// mismatch here means the preview says a file is fine and the import 400s.
const MSSV_REGEX = /^[A-Za-z0-9]{4,20}$/;

export interface ColumnMapping {
  /** Rows to skip before the data starts — the user says how many. */
  headerRows: number;
  /** 0-based column indexes, chosen by the user. Never inferred. */
  mssvColumn: number;
  nameColumn: number;
}

export interface RosterRowError {
  /** 1-based, as the spreadsheet shows it. 0 means "the file as a whole". */
  row: number;
  reason: string;
}

export interface ParsedRoster {
  students: RosterEntry[];
  errors: RosterRowError[];
}

function cell(row: string[] | undefined, index: number): string {
  return (row?.[index] ?? '').trim();
}

function isBlankRow(row: string[]): boolean {
  return row.every((value) => (value ?? '').trim() === '');
}

/**
 * Drops blank rows from the end of a sheet.
 *
 * A stray format on an untouched row is enough for a spreadsheet to report
 * hundreds of them, so failing a real file over trailing blanks would be
 * theatre. A blank row *inside* the data is a different thing entirely —
 * usually a sign the column mapping or header count is wrong — and
 * `extractRoster` still reports those.
 */
export function trimTrailingBlankRows(rows: string[][]): string[][] {
  let end = rows.length;
  while (end > 0 && isBlankRow(rows[end - 1])) {
    end--;
  }
  return rows.slice(0, end);
}

/**
 * Reads the two mapped columns out of the sheet.
 *
 * Returns students only when every single row is good. Importing the valid
 * rows and reporting the rest was rejected deliberately: a class imported at
 * 38/40 produces a headcount that looks healthy and is not, and making that
 * number trustworthy is the whole reason this screen exists.
 */
export function extractRoster(rows: string[][], mapping: ColumnMapping): ParsedRoster {
  const body = trimTrailingBlankRows(rows).slice(mapping.headerRows);
  const errors: RosterRowError[] = [];
  const students: RosterEntry[] = [];
  const seen = new Map<string, number>();

  if (body.length === 0) {
    return {
      students: [],
      errors: [{ row: 0, reason: 'Không có dòng dữ liệu nào sau phần tiêu đề' }],
    };
  }

  body.forEach((row, index) => {
    const sheetRow = index + mapping.headerRows + 1;

    if (isBlankRow(row)) {
      errors.push({
        row: sheetRow,
        reason: 'Dòng trống nằm giữa danh sách — kiểm tra lại cột đã chọn',
      });
      return;
    }

    const mssv = cell(row, mapping.mssvColumn);
    const name = cell(row, mapping.nameColumn);

    if (!MSSV_REGEX.test(mssv)) {
      errors.push({
        row: sheetRow,
        reason: `MSSV "${mssv}" không hợp lệ (chỉ gồm 4-20 chữ cái hoặc chữ số)`,
      });
      return;
    }

    // student_mssv is citext: two rows differing only in case are one
    // student to the database, and would collide there instead of here.
    const key = mssv.toLowerCase();
    const first = seen.get(key);
    if (first !== undefined) {
      errors.push({ row: sheetRow, reason: `MSSV "${mssv}" đã xuất hiện ở dòng ${first}` });
      return;
    }
    seen.set(key, sheetRow);

    if (name === '') {
      errors.push({ row: sheetRow, reason: 'Thiếu họ tên' });
      return;
    }

    students.push({ mssv, name });
  });

  // All or nothing.
  return { students: errors.length > 0 ? [] : students, errors };
}

export interface RosterDiff {
  added: RosterEntry[];
  renamed: { mssv: string; from: string; to: string }[];
  unchanged: number;
  /** On the list, absent from the file. Reported; never removed on its own. */
  missing: RosterEntry[];
}

/**
 * What this file would change, shown before anything is written.
 *
 * `missing` is separated from the rest because it is the only category with
 * a consequence that cannot be undone in time: deleting an enrollment locks
 * that student out, and the mistake shows up on exam day. It takes an
 * explicit tick, so the user reads the list first.
 */
export function diffRoster(current: RosterEntry[], parsed: RosterEntry[]): RosterDiff {
  const byMssv = new Map(current.map((entry) => [entry.mssv.toLowerCase(), entry]));
  const inFile = new Set(parsed.map((entry) => entry.mssv.toLowerCase()));

  const added: RosterEntry[] = [];
  const renamed: RosterDiff['renamed'] = [];
  let unchanged = 0;

  for (const entry of parsed) {
    const existing = byMssv.get(entry.mssv.toLowerCase());
    if (!existing) {
      added.push(entry);
    } else if (existing.name !== entry.name) {
      renamed.push({ mssv: entry.mssv, from: existing.name, to: entry.name });
    } else {
      unchanged++;
    }
  }

  const missing = current.filter((entry) => !inFile.has(entry.mssv.toLowerCase()));

  return { added, renamed, unchanged, missing };
}

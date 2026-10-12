import type { RosterEntry } from '@/lib/api/roster';

/**
 * Turning a spreadsheet into a class list, in the browser.
 *
 * The .xlsx never reaches the API — CLAUDE.md Security rule 5 — so the
 * parsing, the column mapping and the diff all happen here, and what is
 * posted is plain JSON.
 *
 * Danh sách thi thật (vd. file đào tạo) có tiêu đề / dòng trống / STT.
 * Chỉ lấy dòng có MSSV đúng 8 chữ số ở cột đã chọn; các dòng khác bỏ qua
 * (không coi là lỗi). Cột MSSV / họ tên vẫn do người dùng chọn (có gợi ý).
 */

/** MSSV trong file danh sách thi: đúng 8 chữ số. */
export const ROSTER_MSSV_REGEX = /^\d{8}$/;

export interface ColumnMapping {
  /**
   * Số dòng bỏ qua ở đầu (tuỳ chọn). Thường để 0 — dòng tiêu đề tự bị
   * bỏ vì không có MSSV 8 số.
   */
  headerRows: number;
  /** 0-based — người dùng chọn / gợi ý. Không suy bắt buộc từ header. */
  mssvColumn: number;
  /** 1 hoặc 2 cột họ tên (vd. Họ đệm + Tên). */
  nameColumns: number[];
}

export interface RosterRowError {
  /** 1-based, as the spreadsheet shows it. 0 means "the file as a whole". */
  row: number;
  reason: string;
}

export interface ParsedRoster {
  students: RosterEntry[];
  errors: RosterRowError[];
  /** Dòng đã bỏ vì không có MSSV 8 số (tiêu đề, trống, STT…). */
  skipped: number;
}

function cell(row: string[] | undefined, index: number): string {
  return (row?.[index] ?? '').trim();
}

/** Chuẩn hoá ô MSSV (Excel đôi khi trả "22691861.0"). */
export function normalizeMssvCell(raw: string): string {
  const t = raw.trim();
  if (/^\d+\.0+$/.test(t)) return t.replace(/\.0+$/, '');
  return t;
}

export function isEightDigitMssv(raw: string): boolean {
  return ROSTER_MSSV_REGEX.test(normalizeMssvCell(raw));
}

/** Ghép các cột họ tên theo thứ tự index tăng dần, bỏ ô trống. */
export function joinNameColumns(row: string[] | undefined, columns: number[]): string {
  return [...columns]
    .sort((a, b) => a - b)
    .map((index) => cell(row, index))
    .filter((part) => part !== '')
    .join(' ');
}

function isBlankRow(row: string[]): boolean {
  return row.every((value) => (value ?? '').trim() === '');
}

export function trimTrailingBlankRows(rows: string[][]): string[][] {
  let end = rows.length;
  while (end > 0 && isBlankRow(rows[end - 1])) {
    end--;
  }
  return rows.slice(0, end);
}

function headerLooksLike(text: string, ...needles: string[]): boolean {
  const n = text.toLowerCase().normalize('NFC');
  return needles.some((needle) => n.includes(needle.toLowerCase()));
}

/**
 * Gợi ý cột từ nội dung sheet: cột có nhiều ô 8 số nhất = MSSV;
 * nếu cùng hàng tiêu đề có "Họ"/"Tên" thì lấy; không thì lấy 1–2 cột liền sau MSSV.
 */
export function suggestColumnMapping(rows: string[][]): ColumnMapping {
  const trimmed = trimTrailingBlankRows(rows);
  const columnCount = trimmed.reduce((max, row) => Math.max(max, row.length), 0);
  if (columnCount === 0) {
    return { headerRows: 0, mssvColumn: 0, nameColumns: [1] };
  }

  const digitCounts = Array.from({ length: columnCount }, () => 0);
  for (const row of trimmed) {
    for (let c = 0; c < columnCount; c++) {
      if (isEightDigitMssv(cell(row, c))) digitCounts[c]++;
    }
  }

  let mssvColumn = 0;
  let best = -1;
  for (let c = 0; c < columnCount; c++) {
    if (digitCounts[c] > best) {
      best = digitCounts[c];
      mssvColumn = c;
    }
  }

  // Hàng tiêu đề gần dòng dữ liệu đầu: tìm nhãn Họ / Tên.
  let nameColumns: number[] = [];
  const firstDataRow = trimmed.findIndex((row) => isEightDigitMssv(cell(row, mssvColumn)));
  if (firstDataRow > 0) {
    const header = trimmed[firstDataRow - 1] ?? [];
    let ho = -1;
    let ten = -1;
    for (let c = 0; c < columnCount; c++) {
      const label = cell(header, c);
      if (
        ho < 0 &&
        headerLooksLike(
          label,
          'họ đệm',
          'ho dem',
          'họ và tên',
          'ho va ten',
          'họ tên',
          'ho ten',
          'họ',
        )
      ) {
        ho = c;
      }
      // "Tên" đơn — không lấy lại ô "Họ và tên".
      if (ten < 0 && headerLooksLike(label, 'tên') && !headerLooksLike(label, 'họ')) {
        ten = c;
      }
    }
    if (ho >= 0 && ten >= 0) {
      nameColumns = [ho, ten];
    } else if (ho >= 0) {
      nameColumns = [ho];
    } else if (ten >= 0) {
      nameColumns = [ten];
    }
  }

  if (nameColumns.length === 0) {
    const a = mssvColumn + 1;
    const b = mssvColumn + 2;
    if (a < columnCount && b < columnCount) nameColumns = [a, b];
    else if (a < columnCount) nameColumns = [a];
    else nameColumns = [Math.min(1, columnCount - 1)];
  }

  return { headerRows: 0, mssvColumn, nameColumns: nameColumns.slice(0, 2) };
}

/**
 * Chỉ lấy dòng có MSSV đúng 8 số ở cột đã chọn.
 * Dòng tiêu đề / trống / không khớp → bỏ qua (skipped).
 * Dòng có MSSV hợp lệ nhưng thiếu tên / trùng → lỗi (all-or-nothing trên tập hợp đó).
 */
export function extractRoster(rows: string[][], mapping: ColumnMapping): ParsedRoster {
  if (mapping.nameColumns.length === 0) {
    return {
      students: [],
      errors: [{ row: 0, reason: 'Chưa chọn cột họ tên' }],
      skipped: 0,
    };
  }
  if (mapping.nameColumns.length > 2) {
    return {
      students: [],
      errors: [{ row: 0, reason: 'Chỉ chọn tối đa 2 cột họ tên' }],
      skipped: 0,
    };
  }

  const body = trimTrailingBlankRows(rows).slice(mapping.headerRows);
  const errors: RosterRowError[] = [];
  const students: RosterEntry[] = [];
  const seen = new Map<string, number>();
  let skipped = 0;

  if (body.length === 0) {
    return {
      students: [],
      errors: [{ row: 0, reason: 'Không có dòng dữ liệu nào sau phần tiêu đề' }],
      skipped: 0,
    };
  }

  body.forEach((row, index) => {
    const sheetRow = index + mapping.headerRows + 1;
    const mssvRaw = normalizeMssvCell(cell(row, mapping.mssvColumn));

    // Tiêu đề, STT, dòng trống, ô không phải MSSV 8 số → bỏ qua.
    if (!isEightDigitMssv(mssvRaw)) {
      skipped++;
      return;
    }

    const name = joinNameColumns(row, mapping.nameColumns);
    const key = mssvRaw.toLowerCase();
    const first = seen.get(key);
    if (first !== undefined) {
      errors.push({
        row: sheetRow,
        reason: `MSSV "${mssvRaw}" đã xuất hiện ở dòng ${first}`,
      });
      return;
    }
    seen.set(key, sheetRow);

    if (name === '') {
      errors.push({ row: sheetRow, reason: 'Thiếu họ tên' });
      return;
    }

    if (name.length > 150) {
      errors.push({
        row: sheetRow,
        reason: `Họ tên dài quá 150 ký tự (${name.length})`,
      });
      return;
    }

    students.push({ mssv: mssvRaw, name });
  });

  if (errors.length === 0 && students.length === 0) {
    return {
      students: [],
      errors: [
        {
          row: 0,
          reason:
            'Không tìm thấy dòng nào có MSSV đúng 8 chữ số ở cột đã chọn. Hãy kiểm tra lại cột MSSV.',
        },
      ],
      skipped,
    };
  }

  // All-or-nothing chỉ trên các dòng đã nhận là sinh viên.
  return {
    students: errors.length > 0 ? [] : students,
    errors,
    skipped,
  };
}

export interface RosterDiff {
  added: RosterEntry[];
  renamed: { mssv: string; from: string; to: string }[];
  unchanged: number;
  /** On the list, absent from the file. Reported; never removed on its own. */
  missing: RosterEntry[];
}

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

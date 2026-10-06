import {
  administrativeCodeProblem,
  normalizeAdministrativeCode,
} from '../../common/master-data-normalize';
import { attachSimilar, type NewEntry } from './import-similar';
import { blankRow, errorRow, type ImportPlan, type ImportRowResult } from './import.types';

export interface AdministrativeClassImportRow {
  line: number;
  code: string;
}

export interface ExistingAdministrativeClass {
  id: string;
  code: string;
}

export type AdministrativeClassWrite = { code: string };

/**
 * Danh mục lớp danh nghĩa: một cột, CHỈ THÊM (spec §6.1) — không sửa, không xoá bằng file. Mã đã có là "unchanged";
 * mã mới được so "gần giống" với mã có sẵn và với các mã mới khác trong file.
 *
 * Mã đã viết hoa ở tầng này (`normalizeAdministrativeCode`), nên so khoá bằng chuỗi thẳng là đủ.
 */
export function planAdministrativeClassImport(
  rows: readonly AdministrativeClassImportRow[],
  existing: readonly ExistingAdministrativeClass[],
): ImportPlan<AdministrativeClassWrite> {
  const known = new Set(existing.map((entry) => entry.code));
  const firstLineOfCode = new Map<string, number>();
  const results: ImportRowResult[] = [];
  const writes: AdministrativeClassWrite[] = [];
  const newEntries: NewEntry[] = [];

  rows.forEach((row) => {
    const code = normalizeAdministrativeCode(row.code);
    const problem = administrativeCodeProblem(code);
    if (problem) {
      results.push(errorRow(row.line, code === '' ? `Dòng ${row.line}` : code, [problem]));
      return;
    }

    const first = firstLineOfCode.get(code);
    if (first !== undefined) {
      results.push(errorRow(row.line, code, [`Trùng với dòng ${first}: mã ${code} đã xuất hiện trong file.`]));
      return;
    }
    firstLineOfCode.set(code, row.line);

    if (known.has(code)) {
      results.push(blankRow(row.line, code));
      return;
    }

    results.push({ ...blankRow(row.line, code), status: 'new' });
    writes.push({ code });
    newEntries.push({ index: results.length - 1, line: row.line, name: code });
  });

  attachSimilar(
    results,
    newEntries,
    existing.map((entry) => ({ id: entry.id, name: entry.code })),
  );
  return { rows: results, writes };
}

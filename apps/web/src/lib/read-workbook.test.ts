import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { File } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import { readWorkbook } from './read-workbook';
import { extractRoster, suggestColumnMapping } from './roster-file';

/**
 * The one test that uses a real .xlsx.
 *
 * `roster-file.test.ts` covers the rules exhaustively over plain arrays;
 * this covers the seam those tests deliberately mock away — that a genuine
 * workbook comes out of exceljs as the grid the rules expect.
 */

const SCRIPTS = join(__dirname, '..', '..', '..', '..', 'scripts');

function load(name: string): File {
  const bytes = readFileSync(join(SCRIPTS, name));
  return new File([bytes], name, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

const PARSE_TIMEOUT_MS = 30_000;

describe('readWorkbook against the demo fixtures', () => {
  it('reads the sample roster into 22 students (MSSV 8 số)', { timeout: PARSE_TIMEOUT_MS }, async () => {
    const sheets = await readWorkbook(load('sample-roster.xlsx'));

    expect(sheets).toHaveLength(1);
    expect(sheets[0].name).toBe('DanhSach');

    const mapping = suggestColumnMapping(sheets[0].rows);
    const parsed = extractRoster(sheets[0].rows, mapping);

    expect(parsed.errors).toEqual([]);
    expect(parsed.students).toHaveLength(22);
    expect(parsed.students[0]).toEqual({ mssv: '20000001', name: 'Sinh viên test 01' });
    expect(parsed.students.map((s) => s.mssv)).toContain('20120001');
  });

  it('bỏ qua MSSV hỏng; vẫn lấy các dòng 8 số hợp lệ', { timeout: PARSE_TIMEOUT_MS }, async () => {
    const sheets = await readWorkbook(load('sample-roster-bad.xlsx'));
    const mapping = suggestColumnMapping(sheets[0].rows);
    const parsed = extractRoster(sheets[0].rows, mapping);

    // Dòng "SV 2012 0003" không phải 8 số → skipped, không chặn cả file.
    expect(parsed.errors).toEqual([]);
    expect(parsed.students).toHaveLength(22);
    expect(parsed.skipped).toBeGreaterThan(0);
  });
});

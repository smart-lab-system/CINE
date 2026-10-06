import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { File } from 'node:buffer';
import { Workbook } from 'exceljs';
import { describe, expect, it } from 'vitest';
import { readWorkbook } from './read-workbook';
import { extractRoster } from './roster-file';

/**
 * The one test that uses a real .xlsx.
 *
 * `roster-file.test.ts` covers the rules exhaustively over plain arrays;
 * this covers the seam those tests deliberately mock away — that a genuine
 * workbook comes out of exceljs as the grid the rules expect, with the row
 * numbers the user will be told to go and look at.
 *
 * It reads the demo fixtures DEMO-RUNBOOK.md tells people to import, so the
 * runbook's happy path and its error path are both pinned: if the generator
 * and the parser ever disagree, the demo breaks in front of an audience
 * rather than here.
 */

const SCRIPTS = join(__dirname, '..', '..', '..', '..', 'scripts');
const MAPPING = { headerRows: 2, mssvColumn: 1, nameColumn: 2 };

// Node's File, not jsdom's: jsdom's implementation has no arrayBuffer(),
// which every real browser does have and which readWorkbook uses.
type WorkbookInput = Parameters<typeof readWorkbook>[0];

function load(name: string): WorkbookInput {
  const bytes = readFileSync(join(SCRIPTS, name));
  return new File([bytes], name, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }) as unknown as WorkbookInput;
}

/**
 * Both cases decompress and parse a genuine .xlsx through exceljs. That is
 * real work — normally under a second, but seconds when the machine is
 * also running the API suite — and vitest's 5s default is not a meaningful
 * bound for it. These tests assert what comes OUT of the parser, never how
 * fast; an intermittent timeout here says nothing about the code and
 * teaches everyone to re-run instead of read.
 */
const PARSE_TIMEOUT_MS = 30_000;

describe('readWorkbook against the demo fixtures', () => {
  it('reads the sample roster into 22 students', { timeout: PARSE_TIMEOUT_MS }, async () => {
    const sheets = await readWorkbook(load('sample-roster.xlsx'));

    expect(sheets).toHaveLength(1);
    expect(sheets[0].name).toBe('DanhSach');

    // Two header rows (a title, then the column names) and the MSSV in the
    // second column — the shape a real class list arrives in, which is why
    // the importer asks rather than assuming.
    const parsed = extractRoster(sheets[0].rows, MAPPING);

    expect(parsed.errors).toEqual([]);
    expect(parsed.students).toHaveLength(22);
    // Exactly the identities mock-agent.ts generates; --count 20 depends on
    // these existing after an import.
    expect(parsed.students[0]).toEqual({ mssv: 'MSSVTEST01', name: 'Sinh viên test 01' });
    expect(parsed.students.map((s) => s.mssv)).toContain('SV20120001');
  });

  it('refuses the whole broken fixture and points at the row', { timeout: PARSE_TIMEOUT_MS }, async () => {
    const sheets = await readWorkbook(load('sample-roster-bad.xlsx'));
    const parsed = extractRoster(sheets[0].rows, MAPPING);

    // Row 8: two header rows, five good students, then the bad one.
    expect(parsed.errors).toEqual([
      {
        row: 8,
        reason: 'MSSV "SV 2012 0003" không hợp lệ (chỉ gồm 4-20 chữ cái hoặc chữ số)',
      },
    ]);
    // 22 of 23 is not a partial success.
    expect(parsed.students).toEqual([]);
  });
});

/**
 * Ô ngày. exceljs trả giá trị `Date`, còn `cell.text` của nó là `Date.toString()` theo múi giờ máy
 * ("Tue Sep 01 2026 07:00:00 GMT+0700 (Indochina Time)") — một chuỗi không parser nào của chúng ta nhận, và server từ chối
 * nó có chủ ý. Bộ test này dựng một .xlsx THẬT chứ không giả `cell`, vì điều cần chứng minh là cái exceljs thật sự trả.
 */
async function workbookFile(fill: (sheet: import('exceljs').Worksheet) => void): Promise<WorkbookInput> {
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet('S');
  fill(sheet);
  const buffer = await workbook.xlsx.writeBuffer();
  return new File([new Uint8Array(buffer)], 'ngay.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }) as unknown as WorkbookInput;
}

describe('readWorkbook: ô ngày', () => {
  it('ô ngày ra yyyy-mm-dd, bất kể định dạng hiển thị của ô', { timeout: PARSE_TIMEOUT_MS }, async () => {
    const file = await workbookFile((sheet) => {
      sheet.getCell('A1').value = new Date(Date.UTC(2026, 8, 1)); // 01/09/2026
      sheet.getCell('A1').numFmt = 'dd/mm/yyyy';
      sheet.getCell('A2').value = new Date(Date.UTC(2027, 0, 31));
      sheet.getCell('A2').numFmt = 'yyyy-mm-dd';
      sheet.getCell('A3').value = new Date(Date.UTC(2027, 1, 1));
      sheet.getCell('A3').numFmt = 'd mmm yyyy';
    });

    const [sheet] = await readWorkbook(file);

    // Không có `GMT`, không có tên thứ: đó là dấu hiệu của `Date.toString()`.
    expect(sheet.rows.map((row) => row[0])).toEqual(['2026-09-01', '2027-01-31', '2027-02-01']);
  });

  it('ô công thức cho ra ngày cũng ra yyyy-mm-dd', { timeout: PARSE_TIMEOUT_MS }, async () => {
    const file = await workbookFile((sheet) => {
      sheet.getCell('A1').value = new Date(Date.UTC(2026, 8, 1));
      sheet.getCell('B1').value = { formula: 'A1+30', result: new Date(Date.UTC(2026, 9, 1)) };
    });

    const [sheet] = await readWorkbook(file);

    expect(sheet.rows[0]).toEqual(['2026-09-01', '2026-10-01']);
  });

  it('ô chữ trông như ngày, ô số, ô chữ thường giữ NGUYÊN — chỉ ô ngày thật mới được đổi', { timeout: PARSE_TIMEOUT_MS }, async () => {
    const file = await workbookFile((sheet) => {
      sheet.getCell('A1').value = '01/09/2026';
      sheet.getCell('B1').value = '2026-09-01';
      sheet.getCell('C1').value = 40;
      sheet.getCell('D1').value = 'HK1 2026-2027';
      sheet.getCell('E1').value = '  Phòng H3.03  ';
    });

    const [sheet] = await readWorkbook(file);

    expect(sheet.rows[0]).toEqual(['01/09/2026', '2026-09-01', '40', 'HK1 2026-2027', 'Phòng H3.03']);
  });
});

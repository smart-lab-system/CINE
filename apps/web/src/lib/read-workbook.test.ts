import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { File } from 'node:buffer';
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
function load(name: string): File {
  const bytes = readFileSync(join(SCRIPTS, name));
  return new File([bytes], name, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

describe('readWorkbook against the demo fixtures', () => {
  it('reads the sample roster into 22 students', async () => {
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

  it('refuses the whole broken fixture and points at the row', async () => {
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

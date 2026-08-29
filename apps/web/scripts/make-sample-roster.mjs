// Writes the two .xlsx files DEMO-RUNBOOK.md's roster-import step uses.
//
// It replaces scripts/seed-roster.sql: the roster now arrives through the
// importer, and a demo that reaches into Postgres to create enrollments
// would be demonstrating a path that no longer exists. What a dev database
// lacks is not the SQL — it is the file the training office would issue.
//
//   pnpm --filter web make:sample-roster
//
// It lives in the web package because exceljs is that package's dependency:
// the real importer parses in the browser and the API never sees a file
// (CLAUDE.md Security rule 5). Node resolves an import against the script's
// own directory, so a copy under the repo-root scripts/ folder could not
// find the library at all.
//
// Writes into the repo-root scripts/ folder, beside the other dev scripts:
//   sample-roster.xlsx      22 valid students
//   sample-roster-bad.xlsx  the same list with one broken row
//
// The 22 are deliberate: MSSVTEST01…MSSVTEST20 are exactly the identities
// apps/agent/src/mock-agent.ts generates, so `--count 20` works after an
// import with nothing else to line up, plus SV20120001 / SV20120002 for
// driving the real agent by hand. Raising --count past 20 means adding rows
// here and re-importing.

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import ExcelJS from 'exceljs';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'scripts');

const students = [
  ...Array.from({ length: 20 }, (_, index) => {
    const n = String(index + 1).padStart(2, '0');
    return { mssv: `MSSVTEST${n}`, name: `Sinh viên test ${n}` };
  }),
  { mssv: 'SV20120001', name: 'Nguyễn Văn A' },
  { mssv: 'SV20120002', name: 'Trần Thị B' },
];

/**
 * Shaped like a real class list rather than a clean two-column export: a
 * title row above the headers, an ordinal first column, and a trailing
 * column that means nothing. The importer asks which columns to use, so a
 * file that already sits in the expected shape would demonstrate nothing.
 */
async function write(path, rows) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('DanhSach');

  sheet.addRow(['DANH SÁCH LỚP — CS101 Nhóm 01']);
  sheet.addRow(['STT', 'MSSV', 'Họ và tên', 'Ghi chú']);
  rows.forEach((student, index) => {
    sheet.addRow([index + 1, student.mssv, student.name, '']);
  });

  await workbook.xlsx.writeFile(path);
  console.log(`Wrote ${path} (${rows.length} students)`);
}

await write(join(outDir, 'sample-roster.xlsx'), students);

// One row with a space in the MSSV. The whole file is refused — importing
// 21 of 22 would produce a headcount that looks healthy and is not.
await write(join(outDir, 'sample-roster-bad.xlsx'), [
  ...students.slice(0, 5),
  { mssv: 'SV 2012 0003', name: 'Lê Văn Hỏng' },
  ...students.slice(5),
]);

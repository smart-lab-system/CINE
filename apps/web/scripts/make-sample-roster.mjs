// Writes the two .xlsx files DEMO-RUNBOOK.md's roster-import appendix uses.
//
// Students come from scripts/seed-fixtures/students.json — the same list
// `pnpm seed:sample` posts to the Seed API and mock-agent reads for --count N.
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
//   sample-roster.xlsx      students from the fixture
//   sample-roster-bad.xlsx  the same list with one broken row

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import ExcelJS from 'exceljs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, '..', '..', '..');
const outDir = join(repoRoot, 'scripts');
const studentsPath = join(repoRoot, 'scripts', 'seed-fixtures', 'students.json');

const students = JSON.parse(readFileSync(studentsPath, 'utf8'));
if (!Array.isArray(students) || students.length === 0) {
  console.error(`Expected a non-empty students array at ${studentsPath}`);
  process.exit(1);
}

/**
 * Shaped like a real class list rather than a clean two-column export: a
 * title row above the headers, an ordinal first column, and a trailing
 * column that means nothing. The importer asks which columns to use, so a
 * file that already sits in the expected shape would demonstrate nothing.
 */
async function write(path, rows) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('DanhSach');

  sheet.addRow(['DANH SÁCH LỚP — 4220004247 Nhóm 01']);
  sheet.addRow(['STT', 'MSSV', 'Họ và tên', 'Ghi chú']);
  rows.forEach((student, index) => {
    sheet.addRow([index + 1, student.mssv, student.name, '']);
  });

  await workbook.xlsx.writeFile(path);
  console.log(`Wrote ${path} (${rows.length} students)`);
}

await write(join(outDir, 'sample-roster.xlsx'), students);

// One row with a space in the MSSV. The whole file is refused — importing
// N-1 of N would produce a headcount that looks healthy and is not.
await write(join(outDir, 'sample-roster-bad.xlsx'), [
  ...students.slice(0, 5),
  { mssv: '240 00399', name: 'Lê Văn Hỏng' },
  ...students.slice(5),
]);

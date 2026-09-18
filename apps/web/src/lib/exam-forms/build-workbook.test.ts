import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { buildExamFormWorkbook } from './build-workbook';
import { EXAM_FORM_DEFINITIONS, EXAM_FORM_KINDS } from './schemas';
import { EXAM_FORM_SAMPLES } from './samples';
import type { ExamFormKind } from './types';

async function loadSheet(kind: ExamFormKind, includeSamples: boolean) {
  const fixed = new Date(2026, 11, 1, 9, 30, 0); // 2026-12-01 09:30 local
  const { filename, bytes } = await buildExamFormWorkbook({
    kind,
    includeSamples,
    now: fixed,
  });
  const workbook = new ExcelJS.Workbook();
  // exceljs load accepts Buffer | ArrayBuffer; Uint8Array.buffer can be a
  // SharedArrayBuffer-backed slice — pass a clean copy.
  await workbook.xlsx.load(Buffer.from(bytes));
  const def = EXAM_FORM_DEFINITIONS[kind];
  const sheet = workbook.getWorksheet(def.sheetName);
  return { filename, sheet, def };
}

function rowValues(sheet: ExcelJS.Worksheet, rowNumber: number): string[] {
  const row = sheet.getRow(rowNumber);
  const values: string[] = [];
  for (let c = 1; c <= sheet.columnCount; c++) {
    const cell = row.getCell(c);
    const text = cell.text ?? (cell.value == null ? '' : String(cell.value));
    values.push(text);
  }
  return values;
}

describe('buildExamFormWorkbook', () => {
  it.each(EXAM_FORM_KINDS)('%s writes the correct sheet name and header row', async (kind) => {
    const { filename, sheet, def } = await loadSheet(kind, false);
    expect(filename).toBe(`${kind}_20261201_0930.xlsx`);
    expect(sheet).toBeDefined();
    expect(rowValues(sheet!, 1)).toEqual([...def.headers]);
    expect(sheet!.rowCount).toBe(1);
  });

  it.each(EXAM_FORM_KINDS)('%s appends sample rows when requested', async (kind) => {
    const { sheet, def } = await loadSheet(kind, true);
    const samples = EXAM_FORM_SAMPLES[kind];
    expect(sheet!.rowCount).toBe(1 + samples.length);
    for (let i = 0; i < samples.length; i++) {
      const expected = samples[i].map((cell) => String(cell));
      expect(rowValues(sheet!, i + 2).slice(0, def.headers.length)).toEqual(expected);
    }
  });
});

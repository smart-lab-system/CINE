import ExcelJS from 'exceljs';
import { EXAM_FORM_SAMPLES } from './samples';
import { getExamFormDefinition } from './schemas';
import type { ExamFormKind } from './types';

export interface BuildExamFormOptions {
  kind: ExamFormKind;
  /** When true (default), append the spec sample rows under the header. */
  includeSamples?: boolean;
  /** Injected for stable filenames in tests. Defaults to `new Date()`. */
  now?: Date;
}

export interface BuiltExamForm {
  filename: string;
  bytes: Uint8Array;
}

function formatStamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `_${pad(date.getHours())}${pad(date.getMinutes())}`
  );
}

/**
 * Builds an .xlsx for one form kind entirely in memory. No network, no
 * storage — callers turn the bytes into a browser download.
 */
export async function buildExamFormWorkbook(
  options: BuildExamFormOptions,
): Promise<BuiltExamForm> {
  const { kind, includeSamples = true, now = new Date() } = options;
  const def = getExamFormDefinition(kind);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CINE ExamCollect';
  const sheet = workbook.addWorksheet(def.sheetName);

  sheet.addRow([...def.headers]);
  if (includeSamples) {
    for (const row of EXAM_FORM_SAMPLES[kind]) {
      sheet.addRow([...row]);
    }
  }

  // Bold header row — cosmetic only; column contract is the text itself.
  sheet.getRow(1).font = { bold: true };

  const raw = await workbook.xlsx.writeBuffer();
  const bytes = new Uint8Array(raw as ArrayBuffer);

  return {
    filename: `${kind}_${formatStamp(now)}.xlsx`,
    bytes,
  };
}

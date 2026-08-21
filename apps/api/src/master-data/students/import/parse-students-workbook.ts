import { BadRequestException } from '@nestjs/common';
import { Workbook } from 'exceljs';

export interface RawStudentImportRow {
  rowNumber: number;
  studentCode?: string;
  fullName?: string;
  dateOfBirth?: string;
  classCode?: string;
  cohortYear?: number;
}

const REQUIRED_HEADERS = [
  'student_code',
  'full_name',
  'date_of_birth',
  'class_code',
  'cohort_year',
];

/** Parses the uploaded workbook into plain row objects. Type coercion only
 * (cell value -> string | number | undefined) — semantic validity (regex,
 * ranges, required-ness) is left entirely to `CreateStudentDto`'s
 * class-validator constraints, checked later in the worker. */
export async function parseStudentsWorkbook(buffer: Buffer): Promise<RawStudentImportRow[]> {
  const workbook = new Workbook();
  // exceljs@4.4.0's own .d.ts declares `load(buffer: Buffer)` against a
  // pre-5.7 TypeScript lib where Uint8Array (and therefore Buffer) wasn't
  // generic. This workspace's TypeScript/@types-node combo makes Buffer
  // generic (`Buffer<ArrayBufferLike>`), so the same runtime Buffer no
  // longer structurally matches exceljs's older declared parameter type.
  // Both sides are plain Node Buffers at runtime; this cast only silences
  // the structural mismatch, not a real type error.
  await workbook.xlsx.load(buffer as any);
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    throw new BadRequestException('Workbook has no worksheets');
  }

  const headerValues = sheet.getRow(1).values as unknown[];
  const headers = headerValues.slice(1).map((value) => String(value ?? '').trim().toLowerCase());

  const missing = REQUIRED_HEADERS.filter((header) => !headers.includes(header));
  if (missing.length > 0) {
    throw new BadRequestException(
      `Workbook is missing required column(s): ${missing.join(', ')}`,
    );
  }

  const columnIndexByHeader = new Map(headers.map((header, index) => [header, index + 1]));
  const rows: RawStudentImportRow[] = [];

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) {
      return;
    }
    const cell = (header: string) => row.getCell(columnIndexByHeader.get(header)!).value;
    const studentCode = nonEmptyString(cell('student_code'));
    const fullName = nonEmptyString(cell('full_name'));
    if (!studentCode && !fullName) {
      return; // skip fully blank rows
    }

    rows.push({
      rowNumber,
      studentCode,
      fullName,
      dateOfBirth: toDateString(cell('date_of_birth')),
      classCode: nonEmptyString(cell('class_code')),
      cohortYear: toOptionalNumber(cell('cohort_year')),
    });
  });

  return rows;
}

function nonEmptyString(value: unknown): string | undefined {
  if (value == null) {
    return undefined;
  }
  const str = String(value).trim();
  return str.length > 0 ? str : undefined;
}

function toOptionalNumber(value: unknown): number | undefined {
  if (value == null || value === '') {
    return undefined;
  }
  const num = typeof value === 'number' ? value : Number(value);
  return Math.trunc(num);
}

function toDateString(value: unknown): string | undefined {
  if (value == null || value === '') {
    return undefined;
  }
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return String(value).trim();
}

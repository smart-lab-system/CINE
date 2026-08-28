import * as XLSX from 'xlsx';

export type RosterStudentRow = {
  studentCode: string;
  fullName: string;
};

export type ParsedCourseRoster = {
  sectionCodeFromFile: string | null;
  students: RosterStudentRow[];
};

export class RosterParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RosterParseError';
  }
}

const STUDENT_CODE_RE = /^[A-Za-z0-9._-]{3,32}$/;
const SECTION_CODE_IN_CELL =
  /lớp học phần:\s*([A-Za-z0-9._-]+)/i;
const FOOTER_MARKERS = [
  'tong cong',
  'tong so',
  'giam thi',
  'giao vu',
  'truong khoa',
  'so sinh vien',
];

export function parseCourseRoster(buffer: Buffer): ParsedCourseRoster {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: 'buffer', raw: true });
  } catch {
    throw new RosterParseError('Could not read the Excel file.');
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new RosterParseError('The Excel file has no worksheets.');
  }

  const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
    header: 1,
    raw: true,
    defval: '',
    blankrows: true,
  });

  const sectionCodeFromFile = findSectionCode(rows);
  const header = findHeader(rows);
  if (!header) {
    throw new RosterParseError(
      'Could not find columns STT, Mã số, Họ đệm, and Tên.',
    );
  }

  const students: RosterStudentRow[] = [];
  const seen = new Set<string>();

  for (let r = header.rowIndex + 1; r < rows.length; r += 1) {
    const row = rows[r] ?? [];
    const joined = normalizeHeader(
      row.map((cell) => cellText(cell)).join(' '),
    );
    if (FOOTER_MARKERS.some((marker) => joined.includes(marker))) {
      break;
    }

    const studentCode = cellText(row[header.codeIndex]);
    if (!studentCode) {
      continue;
    }

    if (!STUDENT_CODE_RE.test(studentCode)) {
      throw new RosterParseError(
        `Invalid student code "${studentCode}" on spreadsheet row ${r + 1}.`,
      );
    }

    const fullName = `${cellText(row[header.lastNameIndex])} ${cellText(
      row[header.firstNameIndex],
    )}`
      .replace(/\s+/g, ' ')
      .trim();
    if (!fullName) {
      throw new RosterParseError(
        `Missing full name for student ${studentCode}.`,
      );
    }
    if (fullName.length > 150) {
      throw new RosterParseError(
        `Full name for student ${studentCode} is longer than 150 characters.`,
      );
    }

    const codeKey = studentCode.toLowerCase();
    if (seen.has(codeKey)) {
      throw new RosterParseError(
        `Duplicate student code ${studentCode} in the file.`,
      );
    }
    seen.add(codeKey);
    students.push({ studentCode, fullName });
  }

  if (students.length === 0) {
    throw new RosterParseError('The file does not contain any students.');
  }

  return { sectionCodeFromFile, students };
}

function findSectionCode(rows: unknown[][]): string | null {
  for (const row of rows) {
    for (const cell of row) {
      const text = cellText(cell);
      const match = text.match(SECTION_CODE_IN_CELL);
      if (match) {
        return match[1];
      }
    }
  }
  return null;
}

function findHeader(rows: unknown[][]): {
  rowIndex: number;
  codeIndex: number;
  lastNameIndex: number;
  firstNameIndex: number;
} | null {
  for (let r = 0; r < rows.length; r += 1) {
    const labels = (rows[r] ?? []).map((cell) => normalizeHeader(cellText(cell)));
    const stt = labels.findIndex((label) => label === 'stt');
    const codeIndex = labels.findIndex((label) => label === 'ma so');
    const lastNameIndex = labels.findIndex((label) => label === 'ho dem');
    const firstNameIndex = labels.findIndex((label) => label === 'ten');
    if (stt >= 0 && codeIndex >= 0 && lastNameIndex >= 0 && firstNameIndex >= 0) {
      return { rowIndex: r, codeIndex, lastNameIndex, firstNameIndex };
    }
  }
  return null;
}

function cellText(value: unknown): string {
  if (value == null || value === '') {
    return '';
  }
  if (typeof value === 'number') {
    if (Number.isInteger(value)) {
      return String(value);
    }
    return String(value);
  }
  return String(value).trim();
}

function normalizeHeader(value: string): string {
  return value
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

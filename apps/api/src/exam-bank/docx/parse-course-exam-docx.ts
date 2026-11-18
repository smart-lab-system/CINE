import { BadRequestException } from '@nestjs/common';
import {
  COURSE_EXAM_LANGUAGES,
  type CourseExamLanguage,
  type CourseExamType,
} from '../exam-bank.constants';

export interface ParsedCourseExamQuestion {
  title?: string;
  statement: string;
  points: number;
}

export interface ParsedCourseExamDocx {
  examType: CourseExamType;
  language: CourseExamLanguage;
  /** Mô tả dùng chung (giữa ngôn ngữ và câu 1). */
  description: string | null;
  /** = tổng điểm câu — để form thỏa bằng nhau khi lưu. */
  totalPoints: number;
  questions: ParsedCourseExamQuestion[];
  warnings: string[];
  /** Phần tên môn trong Heading 1 (nếu parse được). */
  titleCourseName?: string;
}

const TITLE_RE =
  /^Đề thi\s+(thường kỳ|giữa kỳ|cuối kỳ)\s*[—–-]\s*(.+?)\s*$/i;

const LANG_RE = /^Ngôn ngữ(?:\s*\/\s*project)?\s*:\s*([a-z0-9-]+)\s*$/i;

const QUESTION_HEAD_RE = /^Câu\s+(\d+)\.\s*\(([\d.,]+)\s*điểm\)\s*$/i;

const LABEL_TO_TYPE: Record<string, CourseExamType> = {
  'thường kỳ': 'TK',
  'giữa kỳ': 'GK',
  'cuối kỳ': 'CK',
};

const LANG_SET = new Set<string>(COURSE_EXAM_LANGUAGES);

function parsePoints(raw: string): number {
  const n = Number(raw.replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) {
    throw new BadRequestException(`Điểm câu không hợp lệ: "${raw}".`);
  }
  return Math.round(n * 100) / 100;
}

/**
 * Parse plain text (sau mammoth) theo FORMAT-DE-THI.md.
 */
export function parseCourseExamText(text: string, expectedCourseName?: string): ParsedCourseExamDocx {
  const lines = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((l) => l.replace(/\u00a0/g, ' ').trimEnd());

  const warnings: string[] = [];
  let examType: CourseExamType | null = null;
  let titleCourseName: string | undefined;
  let language: CourseExamLanguage | null = null;

  let i = 0;
  while (i < lines.length && lines[i].trim() === '') i++;

  if (i < lines.length) {
    const m = lines[i].trim().match(TITLE_RE);
    if (m) {
      examType = LABEL_TO_TYPE[m[1].toLowerCase()] ?? null;
      titleCourseName = m[2].trim();
      i++;
    }
  }

  if (!examType) {
    throw new BadRequestException(
      'Không tìm thấy tiêu đề dạng "Đề thi {thường kỳ|giữa kỳ|cuối kỳ} — {tên môn}".',
    );
  }

  while (i < lines.length && lines[i].trim() === '') i++;

  if (i < lines.length) {
    const m = lines[i].trim().match(LANG_RE);
    if (m) {
      const id = m[1].toLowerCase();
      if (!LANG_SET.has(id)) {
        throw new BadRequestException(
          `Ngôn ngữ / project "${id}" không hỗ trợ. Chọn một trong: ${COURSE_EXAM_LANGUAGES.join(', ')}.`,
        );
      }
      language = id as CourseExamLanguage;
      i++;
    }
  }

  if (!language) {
    throw new BadRequestException(
      'Thiếu dòng "Ngôn ngữ / project: {id}" (hoặc "Ngôn ngữ: {id}").',
    );
  }

  while (i < lines.length && lines[i].trim() === '') i++;

  /** Đoạn giữa ngôn ngữ và câu 1 = mô tả dùng chung. */
  const descriptionLines: string[] = [];
  while (i < lines.length && !QUESTION_HEAD_RE.test(lines[i].trim())) {
    descriptionLines.push(lines[i]);
    i++;
  }
  while (descriptionLines.length > 0 && descriptionLines[0].trim() === '') {
    descriptionLines.shift();
  }
  while (
    descriptionLines.length > 0 &&
    descriptionLines[descriptionLines.length - 1].trim() === ''
  ) {
    descriptionLines.pop();
  }
  const description =
    descriptionLines.length > 0 ? descriptionLines.join('\n').trim() || null : null;

  const questions: ParsedCourseExamQuestion[] = [];
  let current: { ordinal: number; points: number; body: string[] } | null = null;

  const flush = () => {
    if (!current) return;
    const statement = current.body.join('\n').trim();
    if (!statement) {
      throw new BadRequestException(`Câu ${current.ordinal}: thiếu nội dung đề.`);
    }
    questions.push({ statement, points: current.points });
    current = null;
  };

  for (; i < lines.length; i++) {
    const line = lines[i];
    const head = line.trim().match(QUESTION_HEAD_RE);
    if (head) {
      flush();
      const ordinal = Number(head[1]);
      const points = parsePoints(head[2]);
      current = { ordinal, points, body: [] };
      continue;
    }
    if (current) {
      current.body.push(line);
    }
  }
  flush();

  if (questions.length === 0) {
    throw new BadRequestException('Không tìm thấy câu nào (dòng "Câu N. (X điểm)").');
  }

  if (expectedCourseName && titleCourseName) {
    const a = expectedCourseName.trim().toLowerCase();
    const b = titleCourseName.trim().toLowerCase();
    if (a !== b) {
      warnings.push(
        `Tiêu đề Word ghi môn "${titleCourseName}" khác môn đang chọn "${expectedCourseName}". Hệ thống sẽ dùng tên môn trên form.`,
      );
    }
  }

  const totalPoints =
    Math.round(questions.reduce((s, q) => s + q.points, 0) * 100) / 100;

  return {
    examType,
    language,
    description,
    totalPoints,
    questions,
    warnings,
    titleCourseName,
  };
}

/**
 * Đọc .docx bằng mammoth rồi parse text.
 */
export async function parseCourseExamDocx(
  buffer: Buffer,
  expectedCourseName?: string,
): Promise<ParsedCourseExamDocx> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mammoth = require('mammoth') as {
    extractRawText: (input: { buffer: Buffer }) => Promise<{ value: string }>;
  };
  let value: string;
  try {
    const result = await mammoth.extractRawText({ buffer });
    value = result.value ?? '';
  } catch {
    throw new BadRequestException('Không đọc được file Word (.docx).');
  }
  if (!value.trim()) {
    throw new BadRequestException('File Word trống hoặc không có chữ.');
  }
  return parseCourseExamText(value, expectedCourseName);
}

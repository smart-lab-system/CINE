import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
import type { CourseExamLanguage, CourseExamType } from '../exam-bank.constants';
import { buildCourseExamTitle } from '../exam-bank.constants';

export interface CourseExamDocxQuestion {
  statement: string;
  points: number;
  title?: string | null;
}

export interface CourseExamDocxInput {
  examType: CourseExamType;
  courseName: string;
  language: CourseExamLanguage;
  description?: string | null;
  questions: CourseExamDocxQuestion[];
}

/**
 * Xuất đề kho theo FORMAT-DE-THI.md.
 * Tách riêng với answer-key — không dùng chung helper render câu.
 */
export async function buildCourseExamDocx(input: CourseExamDocxInput): Promise<Buffer> {
  const title = buildCourseExamTitle(input.examType, input.courseName);
  const children: Paragraph[] = [
    new Paragraph({ text: title, heading: HeadingLevel.HEADING_1 }),
    new Paragraph({
      children: [new TextRun({ text: `Ngôn ngữ / project: ${input.language}` })],
    }),
    new Paragraph({ text: '' }),
  ];

  const description = input.description?.trim();
  if (description) {
    for (const line of description.split('\n')) {
      children.push(new Paragraph({ text: line }));
    }
    children.push(new Paragraph({ text: '' }));
  }

  input.questions.forEach((q, i) => {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `Câu ${i + 1}. (${formatPoints(q.points)} điểm)`,
            bold: true,
          }),
        ],
      }),
    );
    for (const line of q.statement.split('\n')) {
      children.push(new Paragraph({ text: line }));
    }
    children.push(new Paragraph({ text: '' }));
  });

  return Packer.toBuffer(new Document({ sections: [{ children }] }));
}

function formatPoints(n: number): string {
  const r = Math.round(n * 100) / 100;
  return Number.isInteger(r) ? String(r) : String(r);
}

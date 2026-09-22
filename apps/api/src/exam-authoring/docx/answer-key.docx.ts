import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
import type { GeneratedExam } from '../ai-provider/exam-authoring-provider';

/**
 * `dap-an-va-test.docx` — KHÔNG BAO GIỜ phát cho sinh viên.
 *
 * Tách hẳn khỏi `exam-paper.docx.ts`; xem doc ở file đó để biết vì sao hai
 * tài liệu này không dùng chung code.
 */
export async function buildAnswerKeyDocx(exam: GeneratedExam): Promise<Buffer> {
  const children: Paragraph[] = [
    new Paragraph({ text: `${exam.title} — ĐÁP ÁN`, heading: HeadingLevel.HEADING_1 }),
    new Paragraph({
      children: [
        new TextRun({ text: 'TÀI LIỆU NỘI BỘ — không phát cho sinh viên.', bold: true }),
      ],
    }),
  ];

  if (exam.verification.status === 'unverified') {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: 'CHƯA KIỂM CHỨNG — đáp án mẫu chưa được chạy lần nào.',
            bold: true,
          }),
        ],
      }),
    );
  }
  children.push(new Paragraph({ text: '' }));

  exam.questions.forEach((q, i) => {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: `Câu ${i + 1}. (${q.points} điểm)`, bold: true })],
      }),
    );
    if (q.resemblesKnownProblem) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text:
                `Model tự khai câu này giống bài: ${q.resemblesKnownProblem}. ` +
                `Đây là lời tự khai của chính model đã sinh ra câu hỏi, KHÔNG phải ` +
                `kết quả đối chiếu — hệ thống không có mạng để tra.`,
              italics: true,
            }),
          ],
        }),
      );
    }
    children.push(new Paragraph({ text: 'Đáp án mẫu:' }));
    for (const line of q.modelAnswer.split('\n')) {
      children.push(
        new Paragraph({ children: [new TextRun({ text: line, font: 'Consolas' })] }),
      );
    }
    if (q.testBundle.length > 0) {
      children.push(new Paragraph({ text: 'Ca test:' }));
      for (const c of q.testBundle) {
        children.push(
          new Paragraph({
            text: `- [${c.group}] ${c.name}: ${c.input} -> ${c.expectedOutput}`,
          }),
        );
      }
    }
    children.push(new Paragraph({ text: '' }));
  });

  return Packer.toBuffer(new Document({ sections: [{ children }] }));
}

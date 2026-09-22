import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
import type { GeneratedExam } from '../ai-provider/exam-authoring-provider';

/**
 * `de-thi.docx` — thứ giảng viên in ra và phát cho sinh viên.
 *
 * **Không một byte nào của `modelAnswer` được lọt vào đây**, và cũng không
 * `resemblesKnownProblem`: một đề ghi sẵn "câu này là two-sum" là phát luôn từ
 * khoá để tra.
 *
 * Hàm này cố ý KHÔNG dùng chung helper render câu với `answer-key.docx.ts`:
 * hai tài liệu chia sẻ code là hai tài liệu có thể vô tình chia sẻ nội dung,
 * và lần refactor "gom lại cho DRY" sẽ là lần đáp án rò ra. Vài dòng lặp ở đây
 * rẻ hơn nhiều so với hậu quả đó.
 */
export async function buildExamPaperDocx(exam: GeneratedExam): Promise<Buffer> {
  const children: Paragraph[] = [
    new Paragraph({ text: exam.title, heading: HeadingLevel.HEADING_1 }),
    new Paragraph({
      children: [new TextRun({ text: `Ngôn ngữ: ${exam.language}`, italics: true })],
    }),
    new Paragraph({ text: '' }),
  ];

  exam.questions.forEach((q, i) => {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: `Câu ${i + 1}. (${q.points} điểm)`, bold: true })],
      }),
    );
    // Giữ xuống dòng của đề: một đề nhiều đoạn bị gộp thành một dòng là đề khó
    // đọc, và giảng viên sẽ phải sửa tay từng câu sau khi xuất.
    for (const line of q.statement.split('\n')) {
      children.push(new Paragraph({ text: line }));
    }
    if (q.requiredComplexity) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `Yêu cầu độ phức tạp: ${q.requiredComplexity}`,
              italics: true,
            }),
          ],
        }),
      );
    }
    children.push(new Paragraph({ text: '' }));
  });

  return Packer.toBuffer(new Document({ sections: [{ children }] }));
}

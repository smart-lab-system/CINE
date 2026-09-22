import { BadRequestException } from '@nestjs/common';
import {
  GeneratedExam,
  GeneratedQuestion,
  TestCase,
} from '../ai-provider/exam-authoring-provider';

/**
 * Đọc `examJson` thành `GeneratedExam`, KIỂM CẢ HÌNH DẠNG chứ không chỉ cú
 * pháp.
 *
 * `JSON.parse(x) as GeneratedExam` là một lời hứa suông: `{}` parse được,
 * ép kiểu được, rồi nổ `TypeError` tận trong `buildAnswerKeyDocx` ở dòng
 * `q.modelAnswer.split('\n')`. Vì route dùng `StreamableFile` chứ không
 * `@Res()` nên client không bị treo — nhưng giảng viên nhận 500 "Internal
 * server error" cho một payload mà server hoàn toàn biết là sai ngay từ
 * đầu, và log không nói được câu nào hỏng.
 *
 * Hàm này dựng lại object từ ĐÚNG những trường đã kiểm, nên thứ đi tiếp vào
 * docx builder không còn trường lạ nào của người gửi.
 */
export function parseExamJson(examJson: string): GeneratedExam {
  let raw: unknown;
  try {
    raw = JSON.parse(examJson);
  } catch {
    throw new BadRequestException('examJson không phải JSON hợp lệ.');
  }

  const exam = record(raw, 'examJson');
  const verification = record(exam.verification, 'verification');
  text(verification.status, 'verification.status');

  if (!Array.isArray(exam.questions) || exam.questions.length === 0) {
    throw new BadRequestException('examJson.questions phải là mảng có ít nhất một câu.');
  }

  return {
    title: text(exam.title, 'title'),
    language: text(exam.language, 'language'),
    questions: exam.questions.map((q, i) => question(q, i)),
    verification: exam.verification as GeneratedExam['verification'],
  };
}

function question(raw: unknown, index: number): GeneratedQuestion {
  const at = `questions[${index}]`;
  const q = record(raw, at);

  if (!Array.isArray(q.testBundle)) {
    throw new BadRequestException(`examJson.${at}.testBundle phải là mảng.`);
  }

  return {
    statement: text(q.statement, `${at}.statement`),
    modelAnswer: text(q.modelAnswer, `${at}.modelAnswer`),
    topic: text(q.topic, `${at}.topic`),
    points: number(q.points, `${at}.points`),
    // Hai trường dưới đây chấp nhận vắng: `null` là trạng thái CÓ NGHĨA của
    // chúng ("đề không ràng buộc độ phức tạp", "model không thấy giống bài
    // nào"), nên vắng và null quy về cùng một chỗ thay vì thành lỗi.
    requiredComplexity: nullableText(q.requiredComplexity, `${at}.requiredComplexity`),
    resemblesKnownProblem: nullableText(q.resemblesKnownProblem, `${at}.resemblesKnownProblem`),
    testBundle: q.testBundle.map((c, i) => testCase(c, `${at}.testBundle[${i}]`)),
  };
}

function testCase(raw: unknown, at: string): TestCase {
  const c = record(raw, at);
  return {
    name: text(c.name, `${at}.name`),
    group: text(c.group, `${at}.group`),
    input: text(c.input, `${at}.input`),
    expectedOutput: text(c.expectedOutput, `${at}.expectedOutput`),
  };
}

function record(value: unknown, at: string): Record<string, unknown> {
  // `typeof null === 'object'`, và mảng cũng là object — cả hai đều phải
  // trượt ở đây, nếu không thì lỗi chỉ dời xuống dòng sau.
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new BadRequestException(`examJson.${at} phải là một object.`);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, at: string): string {
  if (typeof value !== 'string') {
    throw new BadRequestException(`examJson.${at} phải là chuỗi.`);
  }
  return value;
}

function nullableText(value: unknown, at: string): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return text(value, at);
}

function number(value: unknown, at: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new BadRequestException(`examJson.${at} phải là số.`);
  }
  return value;
}

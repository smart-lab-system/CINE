import { BadRequestException } from '@nestjs/common';
import { parseExamJson } from './parse-exam';
import { GeneratedExam } from '../ai-provider/exam-authoring-provider';

const VALID: GeneratedExam = {
  title: 'Kiểm tra CTDL&GT',
  language: 'python',
  questions: [
    {
      statement: 'Cài đặt hàng đợi hai đầu.\nIn ra kết quả mỗi thao tác.',
      points: 10,
      topic: 'deque',
      requiredComplexity: 'O(1) mỗi thao tác',
      modelAnswer: 'def solve():\n    pass',
      testBundle: [{ name: 'ca cơ bản', group: 'basic', input: '1 2', expectedOutput: '3' }],
      resemblesKnownProblem: null,
    },
  ],
  verification: { status: 'unverified', reason: 'sandbox_unavailable' },
};

/**
 * Bỏ một trường khỏi bản sao — để dựng payload THIẾU đúng trường đó.
 *
 * Hàm thay vì destructuring có biến thừa, thứ lint bắt đúng — biến sinh ra
 * chỉ để vứt đi vẫn là biến không ai đọc.
 */
function omit<T extends object, K extends keyof T>(obj: T, key: K): Omit<T, K> {
  const copy = { ...obj };
  delete copy[key];
  return copy;
}

function json(patch: unknown): string {
  return JSON.stringify(patch);
}

describe('parseExamJson', () => {
  it('đọc được bộ ba hợp lệ và giữ nguyên nội dung', () => {
    expect(parseExamJson(json(VALID))).toEqual(VALID);
  });

  it('chỉ giữ trường đã kiểm, bỏ trường lạ người gửi nhét thêm', () => {
    const parsed = parseExamJson(
      json({ ...VALID, soLuongMoi: 99, questions: [{ ...VALID.questions[0], noteRieng: 'x' }] }),
    );
    expect(parsed).toEqual(VALID);
  });

  it('testBundle rỗng vẫn hợp lệ — đề chưa có ca test không phải đề hỏng', () => {
    const parsed = parseExamJson(json({ ...VALID, questions: [{ ...VALID.questions[0], testBundle: [] }] }));
    expect(parsed.questions[0].testBundle).toEqual([]);
  });

  it('requiredComplexity vắng hẳn thì quy về null, không ném', () => {
    const rest = omit(VALID.questions[0], 'requiredComplexity');
    const parsed = parseExamJson(json({ ...VALID, questions: [rest] }));
    expect(parsed.questions[0].requiredComplexity).toBeNull();
  });

  it('JSON sai cú pháp -> 400', () => {
    expect(() => parseExamJson('{')).toThrow(BadRequestException);
  });

  // Đây là ca từng cho 500: cú pháp đúng, hình dạng sai, và lỗi chỉ nổ tận
  // trong docx builder.
  it('object rỗng -> 400 chứ không phải 500', () => {
    expect(() => parseExamJson('{}')).toThrow(BadRequestException);
  });

  it('questions rỗng -> 400, nói rõ là mảng phải có ít nhất một câu', () => {
    expect(() => parseExamJson(json({ ...VALID, questions: [] }))).toThrow(/ít nhất một câu/);
  });

  it('câu thiếu modelAnswer -> 400 và chỉ đúng câu nào', () => {
    const rest = omit(VALID.questions[0], 'modelAnswer');
    expect(() => parseExamJson(json({ ...VALID, questions: [rest] }))).toThrow(
      /questions\[0\]\.modelAnswer/,
    );
  });

  it('statement là số -> 400, không để .split() nổ sau', () => {
    expect(() =>
      parseExamJson(json({ ...VALID, questions: [{ ...VALID.questions[0], statement: 7 }] })),
    ).toThrow(/statement/);
  });

  it('points là chuỗi -> 400', () => {
    expect(() =>
      parseExamJson(json({ ...VALID, questions: [{ ...VALID.questions[0], points: 'mười' }] })),
    ).toThrow(/points/);
  });

  it('testBundle không phải mảng -> 400', () => {
    expect(() =>
      parseExamJson(json({ ...VALID, questions: [{ ...VALID.questions[0], testBundle: {} }] })),
    ).toThrow(/testBundle/);
  });

  it('thiếu verification -> 400, vì answer-key đọc thẳng verification.status', () => {
    const rest = omit(VALID, 'verification');
    expect(() => parseExamJson(json(rest))).toThrow(/verification/);
  });

  it('JSON hợp lệ nhưng là mảng -> 400, không nhận nhầm là object', () => {
    expect(() => parseExamJson('[]')).toThrow(BadRequestException);
  });

  it('JSON hợp lệ nhưng là null -> 400', () => {
    expect(() => parseExamJson('null')).toThrow(BadRequestException);
  });
});

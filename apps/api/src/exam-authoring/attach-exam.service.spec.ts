import { createHash } from 'node:crypto';
import { answerSourceOf } from './attach-exam.service';

const SESSION = '11111111-1111-4111-8111-111111111111';
const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const exam = (language: string, ...answers: string[]) => ({ language, questions: answers.map((modelAnswer) => ({ modelAnswer })) });

describe('answerSourceOf() — mã nguồn đáp án lúc gắn (G2b A2b)', () => {
  it('đề một câu cpp → khoá theo băm, đuôi .cpp, body nguyên chuỗi', () => {
    const code = 'int main() { return 0; }\n';
    const s = answerSourceOf(SESSION, exam('cpp', code));
    expect(s).toMatchObject({ key: `grading-reference/${SESSION}/source-${sha(code)}.cpp`, sha256: sha(code) });
    expect(s?.body.toString('utf8')).toBe(code);
  });

  it('đề một câu python → đuôi .py', () => {
    expect(answerSourceOf(SESSION, exam('python', 'print(1)'))?.key).toMatch(/\.py$/);
  });

  it('cùng đáp án → cùng khoá (gắn lại không sinh object mới); đáp án khác → khoá khác', () => {
    expect(answerSourceOf(SESSION, exam('cpp', 'a'))?.key).toBe(answerSourceOf(SESSION, exam('cpp', 'a'))?.key);
    expect(answerSourceOf(SESSION, exam('cpp', 'a'))?.key).not.toBe(answerSourceOf(SESSION, exam('cpp', 'b'))?.key);
  });

  it('đề nhiều câu → null: các câu dùng chung khoá sẽ đè nhau', () => {
    expect(answerSourceOf(SESSION, exam('cpp', 'a', 'b'))).toBeNull();
  });

  it.each(['java', 'node', 'rust', ''])('ngôn ngữ %j không có sandbox → null', (language) => {
    expect(answerSourceOf(SESSION, exam(language, 'code'))).toBeNull();
  });

  it.each(['', '   ', '\n\t\n'])('đáp án rỗng hay chỉ khoảng trắng (%j) → null', (answer) => {
    expect(answerSourceOf(SESSION, exam('cpp', answer))).toBeNull();
  });

  it('đề không có câu nào → null', () => {
    expect(answerSourceOf(SESSION, exam('cpp'))).toBeNull();
  });

  it('khoá khớp đúng khuôn mà GradingReferenceService.upsert kiểm', () => {
    const key = answerSourceOf(SESSION, exam('cpp', 'x'))!.key;
    expect(key).toMatch(new RegExp(`^grading-reference/${SESSION}/source-[0-9a-f]{64}\\.(cpp|py)$`));
  });
});

import { StubAuthoringProvider } from './stub-authoring.provider';
import { AuthoringRequest } from './exam-authoring-provider';

const base: AuthoringRequest = {
  prompt: 'sắp xếp',
  knowledge: [],
  questionCount: 1,
  language: 'python',
};

describe('StubAuthoringProvider', () => {
  const provider = new StubAuthoringProvider();

  it('trả về đúng số câu được yêu cầu', async () => {
    const { exam } = await provider.generate({ ...base, questionCount: 3 });
    expect(exam.questions).toHaveLength(3);
  });

  it('LUÔN unverified — không có sandbox thì không có trạng thái nào khác', async () => {
    const { exam } = await provider.generate(base);
    expect(exam.verification).toEqual({
      status: 'unverified',
      reason: 'sandbox_unavailable',
    });
  });

  it('tất định: cùng đầu vào cho ra cùng đầu ra', async () => {
    const [a, b] = await Promise.all([provider.generate(base), provider.generate(base)]);
    expect(a.exam).toEqual(b.exam);
  });

  it('mỗi câu có đáp án mẫu là MÃ NGUỒN và ít nhất một ca test', async () => {
    const { exam } = await provider.generate(base);
    expect(exam.questions[0].modelAnswer).toContain('def ');
    expect(exam.questions[0].testBundle.length).toBeGreaterThan(0);
  });

  it('không gọi mạng — usage bằng 0 và model là tên stub', async () => {
    // Nếu ai đó lỡ đấu provider thật vào đường test, con số này khác 0 ngay.
    const { usage } = await provider.generate(base);
    expect(usage).toEqual({ modelUsed: 'stub-authoring', inputTokens: 0, outputTokens: 0 });
  });

  it('tổng điểm các câu luôn là 10, bất kể chia cho mấy câu', async () => {
    for (const n of [1, 3, 4]) {
      const { exam } = await provider.generate({ ...base, questionCount: n });
      const total = exam.questions.reduce((s, q) => s + q.points, 0);
      expect(total).toBeCloseTo(10, 5);
    }
  });
});

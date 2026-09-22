import JSZip from 'jszip';
import { buildExamPaperDocx } from './exam-paper.docx';
import { buildAnswerKeyDocx } from './answer-key.docx';
import type { GeneratedExam } from '../ai-provider/exam-authoring-provider';

const SECRET = 'bi_mat_dap_an';

const exam: GeneratedExam = {
  title: 'Giữa kỳ CTDL&GT',
  language: 'python',
  questions: [
    {
      statement: 'Sắp xếp mảng tăng dần.',
      points: 6,
      topic: 'sorting',
      requiredComplexity: 'O(n log n)',
      modelAnswer: `def ${SECRET}(xs):\n    return sorted(xs)\n`,
      testBundle: [
        { name: 'co-ban', group: 'co-ban', input: '[2,1]', expectedOutput: '[1,2]' },
      ],
      resemblesKnownProblem: null,
    },
    {
      statement: 'Đếm phần tử khác nhau.',
      points: 4,
      topic: 'hashing',
      requiredComplexity: null,
      modelAnswer: 'def dem(xs):\n    return len(set(xs))\n',
      testBundle: [],
      resemblesKnownProblem: 'two-sum',
    },
  ],
  verification: { status: 'unverified', reason: 'sandbox_unavailable' },
};

/**
 * `.docx` là một file zip — `toString` trên buffer không đọc ra chữ nào. Giải
 * nén phần XML văn bản để so nội dung THẬT, không so nhị phân.
 */
async function textOf(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const doc = zip.file('word/document.xml');
  if (!doc) throw new Error('không thấy word/document.xml trong file docx');
  return doc.async('string');
}

describe('buildExamPaperDocx', () => {
  it('KHÔNG chứa một ký tự nào của đáp án mẫu', async () => {
    // Test quan trọng nhất của cả task. Một file Word chứa cả đề lẫn đáp án là
    // đúng tai nạn mà GradingReferenceEntity viết hoa cảnh báo, chỉ khác là nó
    // xảy ra ở tay giảng viên: họ in ra, hoặc upload nhầm vào exam_material.
    const text = await textOf(await buildExamPaperDocx(exam));
    expect(text).not.toContain(SECRET);
    expect(text).not.toContain('sorted(xs)');
    expect(text).not.toContain('len(set(xs))');
  });

  it('có đề, điểm và ràng buộc độ phức tạp', async () => {
    const text = await textOf(await buildExamPaperDocx(exam));
    expect(text).toContain('Sắp xếp mảng tăng dần');
    expect(text).toContain('O(n log n)');
    expect(text).toContain('6');
  });

  it('câu có requiredComplexity = null thì dòng đó VẮNG, không in chữ "null"', async () => {
    expect(await textOf(await buildExamPaperDocx(exam))).not.toContain('null');
  });

  it('KHÔNG lộ bài kinh điển mà model tự khai — đó là ghi chú nội bộ', async () => {
    // Sinh viên cầm đề mà đọc được "câu này là two-sum" thì coi như phát luôn
    // từ khoá để tra.
    expect(await textOf(await buildExamPaperDocx(exam))).not.toContain('two-sum');
  });
});

describe('buildAnswerKeyDocx', () => {
  it('chứa đáp án mẫu và ca test', async () => {
    const text = await textOf(await buildAnswerKeyDocx(exam));
    expect(text).toContain(SECRET);
    expect(text).toContain('[1,2]');
  });

  it('nêu bài kinh điển model tự khai, kèm chữ "tự khai"', async () => {
    const text = await textOf(await buildAnswerKeyDocx(exam));
    expect(text).toContain('two-sum');
    expect(text).toContain('tự khai');
  });

  it('dán nhãn CHƯA KIỂM CHỨNG khi verification là unverified', async () => {
    expect(await textOf(await buildAnswerKeyDocx(exam))).toContain('CHƯA KIỂM CHỨNG');
  });

  it('bỏ nhãn đó khi đã kiểm chứng thật', async () => {
    // Cặp đi ngược chiều: chỉ có test trên thì một lần hardcode nhãn vào mọi
    // file vẫn xanh, và giảng viên sẽ học cách phớt lờ nó.
    const verified: GeneratedExam = {
      ...exam,
      verification: { status: 'passed', ranAt: '2026-09-22T08:00:00Z', complexityMeasured: 'O(n log n)' },
    };
    expect(await textOf(await buildAnswerKeyDocx(verified))).not.toContain('CHƯA KIỂM CHỨNG');
  });
});

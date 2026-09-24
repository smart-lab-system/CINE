import { buildAuthoringPrompt, parseAuthoringResponse } from './authoring-prompt';
import { AuthoringRequest } from './exam-authoring-provider';

const base: AuthoringRequest = {
  prompt: 'cây nhị phân tìm kiếm',
  knowledge: [],
  questionCount: 2,
  language: 'python',
};

describe('buildAuthoringPrompt', () => {
  it('nhét tri thức THẲNG vào prompt, không bắt agent đọc file', () => {
    // Spec §2.1: lập luận prompt-caching của spec chấm KHÔNG áp ở đây — soạn
    // đề là MỘT lượt, không có lô 40 bài nào để chia sẻ tiền tố.
    const text = buildAuthoringPrompt({
      ...base,
      knowledge: ['Tiêu chí: dùng đệ quy — 3 điểm'],
    });
    expect(text).toContain('Tiêu chí: dùng đệ quy — 3 điểm');
  });

  it('nguồn tri thức rỗng vẫn dựng được prompt', () => {
    expect(() => buildAuthoringPrompt(base)).not.toThrow();
  });

  it('bắt model tự khai bài kinh điển nó thấy giống', () => {
    expect(buildAuthoringPrompt(base)).toContain('resemblesKnownProblem');
  });

  it('lượt SINH LẠI mang đủ ba vế: tránh gì, đổi gì, và các câu đang giữ', () => {
    // Thiếu vế nào cũng hỏng: không `avoid` thì model ra lại đúng bài cũ;
    // không `refineNote` thì nó không biết đi hướng nào; không
    // `existingStatements` thì câu mới trùng ý câu đang giữ.
    const text = buildAuthoringPrompt({
      ...base,
      questionCount: 1,
      avoid: ['tìm kiếm nhị phân tìm biên trái'],
      refineNote: 'đổi sang đếm số lần so sánh',
      existingStatements: ['Sắp xếp mảng tăng dần.'],
    });
    expect(text).toContain('tìm kiếm nhị phân tìm biên trái');
    expect(text).toContain('đổi sang đếm số lần so sánh');
    expect(text).toContain('Sắp xếp mảng tăng dần.');
  });

  it('lượt sinh ĐẦU TIÊN không mang mấy khối đó — prompt không phình vô cớ', () => {
    const text = buildAuthoringPrompt(base);
    expect(text).not.toContain('KHÔNG được ra lại');
    expect(text).not.toContain('Các câu đang giữ lại');
  });

  it('mảng avoid toàn chuỗi rỗng bị bỏ qua, không sinh ra câu lệnh cụt', () => {
    expect(buildAuthoringPrompt({ ...base, avoid: ['', '   '] })).not.toContain(
      'KHÔNG được ra lại',
    );
  });

  // Vấn đề: model chỉ khai "resemblesKnownProblem" theo trí nhớ tự do — không
  // có mạng để đối chiếu, nên một bài kinh điển ngoài 5 ví dụ cũ (two-sum,
  // Kadane, LRU cache, ba lô 0/1, đảo danh sách liên kết) dễ lọt qua mà model
  // không tự nhận ra. Danh mục có cấu trúc là chỗ model RÀ LẠI thay vì chỉ nhớ.
  it('danh mục bài kinh điển luôn có mặt, kể cả lượt sinh ĐẦU TIÊN, để model đối chiếu thay vì chỉ nhớ tự do', () => {
    const text = buildAuthoringPrompt(base);
    expect(text).toContain('Two Sum');
    expect(text).toContain("Kadane");
    expect(text).toContain('Reverse Linked List');
  });

  it('danh mục phủ đủ các chủ đề CTDL&GT, không chỉ mảng/chuỗi', () => {
    const text = buildAuthoringPrompt(base);
    expect(text).toContain('Đồ thị');
    expect(text).toContain('Quy hoạch động');
    expect(text).toContain('BST');
  });

  it('lượt SINH LẠI vẫn giữ danh mục — tránh bài kinh điển không phải chuyện chỉ lo ở lượt đầu', () => {
    const text = buildAuthoringPrompt({ ...base, questionCount: 1, refineNote: 'đổi hướng khác' });
    expect(text).toContain('Two Sum');
  });

  // Fan-out: mỗi worker chỉ thấy MỘT câu của chính nó, không thấy N-1 câu
  // anh em — khác cơ chế "existingStatements" (đó là CÂU ĐÃ SINH XONG, còn
  // đây là các worker chạy song song, chưa ai xong trước ai). Khối nhắc nhẹ
  // này là giảm nhẹ rủi ro trùng ý, không phải giải pháp triệt để.
  it('có batchIndex/batchSize thì nói rõ đây là một câu trong nhiều câu đang sinh song song', () => {
    const text = buildAuthoringPrompt({ ...base, questionCount: 1, batchIndex: 2, batchSize: 5 });
    expect(text).toContain('2/5');
    expect(text).toMatch(/song song/i);
  });

  it('không có batchIndex/batchSize thì prompt giữ nguyên như cũ — không phình vô cớ', () => {
    const text = buildAuthoringPrompt(base);
    expect(text).not.toMatch(/song song/i);
  });

  it('batchSize=1 thì KHÔNG thêm khối song song dù có batchIndex — N=1 không có gì để fan-out', () => {
    const text = buildAuthoringPrompt({ ...base, questionCount: 1, batchIndex: 1, batchSize: 1 });
    expect(text).not.toMatch(/song song/i);
  });

  it('khối song song nằm SAU danh mục bài kinh điển — không chen vào tiền tố đang được gateway tự cache', () => {
    const text = buildAuthoringPrompt({ ...base, questionCount: 1, batchIndex: 1, batchSize: 3 });
    const catalogAt = text.indexOf('Two Sum');
    const batchAt = text.indexOf('1/3');
    expect(catalogAt).toBeGreaterThan(-1);
    expect(batchAt).toBeGreaterThan(catalogAt);
  });
});

const valid = JSON.stringify({
  title: 'Giữa kỳ CTDL&GT',
  language: 'python',
  questions: [
    {
      statement: 'Sắp xếp mảng',
      points: 10,
      topic: 'sorting',
      requiredComplexity: 'O(n log n)',
      modelAnswer: 'def solve(xs):\n    return sorted(xs)\n',
      testBundle: [
        { name: 'co-ban', group: 'co-ban', input: '[2,1]', expectedOutput: '[1,2]' },
      ],
      resemblesKnownProblem: null,
    },
  ],
});

describe('parseAuthoringResponse', () => {
  it('đọc được JSON hợp lệ và LUÔN gắn unverified', () => {
    const exam = parseAuthoringResponse(valid);
    expect(exam.questions).toHaveLength(1);
    expect(exam.verification).toEqual({
      status: 'unverified',
      reason: 'sandbox_unavailable',
    });
  });

  it('bỏ qua verification do model tự bịa', () => {
    // Model chưa chạy dòng nào, nên mọi khẳng định của nó về việc đã kiểm
    // chứng đều là bịa. Cùng nguyên tắc với spec chấm §5.1.
    const lying = JSON.stringify({
      ...JSON.parse(valid),
      verification: { status: 'passed', ranAt: '2026-01-01', complexityMeasured: 'O(n)' },
    });
    expect(parseAuthoringResponse(lying).verification.status).toBe('unverified');
  });

  it('JSON hỏng thì ném lỗi rõ ràng, KHÔNG trả bộ ba rỗng trông như hợp lệ', () => {
    expect(() => parseAuthoringResponse('{ khong phai json')).toThrow(/không đọc được/i);
  });

  it('câu thiếu modelAnswer thì ném, vì đề không có đáp án là nửa sản phẩm', () => {
    const missing = JSON.parse(valid);
    delete missing.questions[0].modelAnswer;
    expect(() => parseAuthoringResponse(JSON.stringify(missing))).toThrow(/modelAnswer/);
  });

  it('danh sách câu rỗng cũng ném, không trả về một đề không có câu nào', () => {
    expect(() =>
      parseAuthoringResponse(JSON.stringify({ title: 'x', language: 'python', questions: [] })),
    ).toThrow(/không đọc được/i);
  });

  it('gỡ được rào ```json quanh JSON', () => {
    expect(parseAuthoringResponse('```json\n' + valid + '\n```').questions).toHaveLength(1);
  });

  // ĐO THẬT 2026-09-24, occ/claude-sonnet-5, lượt 5 câu: model đóng rào rồi
  // viết tiếp một đoạn ghi chú. Rào đóng khi ấy không còn nằm ở CUỐI chuỗi,
  // và bản cũ chỉ gỡ rào ở cuối — JSON.parse gặp "```" rồi nổ.
  it('đọc được khi model viết thêm ghi chú SAU rào đóng', () => {
    const text =
      '```json\n' +
      valid +
      '\n```\n\n**Lưu ý cho giảng viên:** cả 5 câu đều là các bài "kinh điển" có lời giải tra được ngay trên mạng.';
    expect(parseAuthoringResponse(text).questions).toHaveLength(1);
  });

  it('đọc được khi model mở đầu bằng một câu dẫn TRƯỚC rào', () => {
    const text = 'Dưới đây là đề thi theo yêu cầu:\n\n```json\n' + valid + '\n```';
    expect(parseAuthoringResponse(text).questions).toHaveLength(1);
  });

  it('ngoặc nhọn trong mã nguồn và trong ghi chú không làm lệch chỗ cắt JSON', () => {
    const withBraces = JSON.parse(valid);
    withBraces.questions[0].modelAnswer = 'def solve(xs):\n    seen = {}\n    return {k: 1 for k in xs}\n';
    const text = JSON.stringify(withBraces) + '\n\nGhi chú: dùng dict {} để đếm.';
    expect(parseAuthoringResponse(text).questions[0].modelAnswer).toContain('seen = {}');
  });

  it('JSON bị cắt giữa chừng vẫn ném, không đoán phần thiếu', () => {
    const truncated = '```json\n' + valid.slice(0, valid.length - 20);
    expect(() => parseAuthoringResponse(truncated)).toThrow(/không đọc được/i);
  });
});

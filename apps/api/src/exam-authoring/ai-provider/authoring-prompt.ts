import { AuthoringRequest, GeneratedExam, GeneratedQuestion } from './exam-authoring-provider';

/**
 * Tri thức đi THẲNG vào prompt, không qua file trong workspace.
 *
 * Spec chấm §2.1 cấm nhét bảng lỗi vào system prompt, và cấm đúng: 40 bài của
 * một phiên dùng chung một tiền tố, nên đặt phần thay đổi theo giảng viên vào
 * tiền tố là trả giá đầy đủ bốn mươi lần. **Ở đây không có bốn mươi lần** —
 * soạn đề là một lượt tương tác, một lần. Không có lô nào chia sẻ tiền tố,
 * nên cache không có gì để tiết kiệm, nên không có lý do gì bắt agent đọc
 * file.
 *
 * Ghi ra vì đây đúng loại lập luận dễ bị bê nguyên si sang chỗ không thuộc về
 * nó: một luật tối ưu chỉ đúng trong điều kiện sinh ra nó, và chép luật mà
 * không chép điều kiện là cách một spec tốt đẻ ra một spec tệ.
 */
export function buildAuthoringPrompt(request: AuthoringRequest): string {
  const knowledge = request.knowledge.filter((k) => k.trim().length > 0);
  const knowledgeBlock =
    knowledge.length > 0
      ? `\n\n## Tri thức của chính giảng viên này\n\n${knowledge.join('\n\n')}`
      : '';

  // Ba khối dưới đây chỉ có mặt ở lượt SINH LẠI. Vắng ở lượt đầu, để prompt
  // không phình ra với những dòng chưa có nội dung.
  const refineBlock = request.refineNote?.trim()
    ? `\n\nGiảng viên muốn đổi: ${request.refineNote.trim()}`
    : '';

  const avoid = (request.avoid ?? []).filter((a) => a.trim().length > 0);
  const avoidBlock =
    avoid.length > 0
      ? `\n\nKHÔNG được ra lại các bài sau, kể cả đổi tên biến hay đổi lời kể: ${avoid.join('; ')}.`
      : '';

  const keep = (request.existingStatements ?? []).filter((s) => s.trim().length > 0);
  const keepBlock =
    keep.length > 0
      ? `\n\nCác câu đang giữ lại trong đề — câu mới không được trùng ý với chúng:\n` +
        keep.map((s, i) => `${i + 1}. ${s}`).join('\n')
      : '';

  return `Bạn soạn đề thi môn Cấu trúc dữ liệu và Giải thuật.

Sinh ${request.questionCount} câu bằng ngôn ngữ ${request.language}.

Mỗi câu phải có ĐỦ BA phần, thiếu một phần là câu đó không dùng được:
1. Đề bài.
2. "modelAnswer": MÃ NGUỒN chạy được, không phải lời giải bằng văn xuôi.
3. "testBundle": các ca test, phủ ít nhất một ca biên (mảng rỗng, một phần
   tử, phần tử trùng, hoặc đã sắp sẵn).

"resemblesKnownProblem": nếu câu này về bản chất là một bài kinh điển đã phổ
biến (two-sum, Kadane, LRU cache, ba lô 0/1, đảo danh sách liên kết...) thì
NÓI RA TÊN NÓ. Sinh viên tra mạng ra lời giải trong ba mươi giây, và giảng
viên cần biết điều đó trước khi in đề. Không giống bài nào thì để null.

KHÔNG tự khai trường "verification": bạn chưa chạy gì cả.

Yêu cầu của giảng viên lần này:
${request.prompt}${refineBlock}${avoidBlock}${keepBlock}${knowledgeBlock}

Trả về DUY NHẤT một object JSON:
{
  "title": string,
  "language": string,
  "questions": [{
    "statement": string,
    "points": number,
    "topic": string,
    "requiredComplexity": string | null,
    "modelAnswer": string,
    "testBundle": [{"name": string, "group": string, "input": string, "expectedOutput": string}],
    "resemblesKnownProblem": string | null
  }]
}`;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Không đọc được đầu ra của model: thiếu hoặc sai kiểu ở "${field}"`);
  }
  return value;
}

/**
 * Đọc đầu ra thành `GeneratedExam`. Hai luật, cả hai đều là "thà nổ còn hơn
 * trả một thứ trông hợp lệ":
 *
 * 1. **`verification` do CODE gắn, không bao giờ đọc từ model.** Model chưa
 *    chạy dòng nào, nên mọi khẳng định của nó về việc đã kiểm chứng đều là
 *    bịa. Cùng nguyên tắc với spec chấm §5.1 — đoạn tóm tắt do harness
 *    render, không do model kể lại.
 * 2. **Thiếu `modelAnswer` là ném, không phải bỏ qua.** Một đề không có đáp
 *    án chạy được là nửa sản phẩm, và nửa sản phẩm im lặng đi tiếp sẽ thành
 *    một `grading_reference` rác — đúng cái bẫy spec §4.1 mô tả.
 */
export function parseAuthoringResponse(text: string): GeneratedExam {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '');

  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    throw new Error('Không đọc được đầu ra của model: JSON hỏng');
  }

  const questionsRaw = raw.questions;
  if (!Array.isArray(questionsRaw) || questionsRaw.length === 0) {
    throw new Error('Không đọc được đầu ra của model: thiếu danh sách câu hỏi');
  }

  const questions: GeneratedQuestion[] = questionsRaw.map((q, i) => {
    const row = q as Record<string, unknown>;
    const bundle = Array.isArray(row.testBundle) ? row.testBundle : [];
    return {
      statement: requireString(row.statement, `questions[${i}].statement`),
      points: typeof row.points === 'number' ? row.points : 0,
      topic: typeof row.topic === 'string' ? row.topic : 'khác',
      requiredComplexity:
        typeof row.requiredComplexity === 'string' ? row.requiredComplexity : null,
      modelAnswer: requireString(row.modelAnswer, `questions[${i}].modelAnswer`),
      testBundle: bundle.map((c) => {
        const cell = c as Record<string, unknown>;
        return {
          name: typeof cell.name === 'string' ? cell.name : 'ca',
          group: typeof cell.group === 'string' ? cell.group : 'co-ban',
          input: typeof cell.input === 'string' ? cell.input : '',
          expectedOutput: typeof cell.expectedOutput === 'string' ? cell.expectedOutput : '',
        };
      }),
      resemblesKnownProblem:
        typeof row.resemblesKnownProblem === 'string' ? row.resemblesKnownProblem : null,
    };
  });

  return {
    title: typeof raw.title === 'string' ? raw.title : 'Đề thi CTDL&GT',
    language: typeof raw.language === 'string' ? raw.language : 'python',
    questions,
    // Gắn ở ĐÂY, bất kể model nói gì. Xem luật 1 ở doc trên.
    verification: { status: 'unverified', reason: 'sandbox_unavailable' },
  };
}

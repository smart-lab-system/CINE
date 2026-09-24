import {
  AuthoringRequest,
  GeneratedExam,
  GeneratedQuestion,
  MAX_CLASSIC_PROBLEM_LENGTH,
} from './exam-authoring-provider';

/**
 * Title mặc định khi không có gì để đặt tên đề — model bỏ trống `title`
 * (đây), hoặc fan-out không có worker nào ở `batchIndex: 1` thành công để
 * mượn title của nó (`claude-authoring.provider.ts`). MỘT hằng số, dùng ở
 * cả hai chỗ, để đổi tên mặc định không phải sửa hai nơi.
 */
export const DEFAULT_EXAM_TITLE = 'Đề thi CTDL&GT';

/**
 * Danh mục bài kinh điển — để MODEL ĐỐI CHIẾU khi khai "resemblesKnownProblem",
 * không chỉ dựa vào trí nhớ tự do.
 *
 * Hệ thống không có mạng để tự kiểm tra (không sandbox, không search — spec
 * §4), nên cờ "đây là bài kinh điển" chỉ tồn tại khi CHÍNH MODEL TỰ KHAI.
 * Trước đây prompt chỉ nêu 5 ví dụ rời rạc (two-sum, Kadane, LRU cache, ba lô
 * 0/1, đảo danh sách liên kết) — một bài kinh điển khác 5 ví dụ đó thì việc
 * "nhớ ra" phụ thuộc hoàn toàn vào việc model có tự liên tưởng hay không,
 * không có gì bắt nó phải rà lại trước khi trả lời.
 *
 * Danh mục dưới đây liệt kê theo đúng cấu trúc chương trình CTDL&GT (danh
 * sách liên kết, cây, đồ thị, quy hoạch động...), để model ĐỐI CHIẾU CÓ CHỦ
 * Ý thay vì chỉ nhớ. Đây là "negative prompting theo tên bài" — kỹ thuật rẻ
 * nhất trong nhóm chống copy-paste, và KHÔNG đổi độ khó của đề nên không tăng
 * rủi ro sai đáp án mẫu — đáp án mẫu không được sandbox chạy thử.
 *
 * CỐ Ý KHÔNG áp các kỹ thuật nặng hơn (State Layering: thêm chiều trạng thái;
 * Constraint Inversion: đảo ngược mục tiêu) làm mặc định: cả hai khiến bài
 * khó viết đáp án đúng hơn, và không ai chạy thử đáp án trước khi in đề. Đánh
 * đổi đó chỉ hợp lý khi có sandbox kiểm chứng, hoặc do giảng viên tự chọn cho
 * một câu cụ thể qua lượt "Sinh lại riêng câu này" — không áp cho mọi đề.
 *
 * KHÔNG xoá được lỗ hổng gốc: một biến thể model chưa từng gặp trong huấn
 * luyện vẫn có thể lọt qua cả danh mục lẫn trí nhớ tự do. Danh mục chỉ nâng
 * tỉ lệ bắt được các bài PHỔ BIẾN, không chứng minh được "bài này chưa từng
 * xuất hiện ở đâu" — không công cụ nào không có mạng chứng minh được điều đó.
 */
const CLASSIC_PROBLEMS_CATALOG = `## Danh mục bài kinh điển — đối chiếu TRƯỚC khi khai "resemblesKnownProblem"

Trước khi khai "resemblesKnownProblem", so câu vừa nghĩ ra với TỪNG mục dưới
đây. Khớp một mục thì NÊU ĐÚNG TÊN mục đó (tên tiếng Anh trong ngoặc), dù bạn
đổi tên biến, đổi ngôn ngữ kể chuyện, hay đổi kiểu dữ liệu đầu vào — cốt lõi
thuật toán giống thì vẫn là bài đó.

**Danh sách liên kết:** Đảo ngược danh sách liên kết (Reverse Linked List) ·
Phát hiện chu trình (Linked List Cycle) · Gộp hai danh sách đã sắp xếp (Merge
Two Sorted Lists) · Gộp k danh sách đã sắp xếp (Merge k Sorted Lists) · Xoá
node thứ N từ cuối (Remove Nth Node From End of List) · Kiểm tra danh sách đối
xứng (Palindrome Linked List) · Giao điểm của hai danh sách (Intersection of
Two Linked Lists) · Cài đặt LRU Cache.

**Ngăn xếp & hàng đợi:** Kiểm tra dấu ngoặc hợp lệ (Valid Parentheses) · Ngăn
xếp có thao tác lấy min O(1) (Min Stack) · Cài đặt hàng đợi bằng hai ngăn xếp
(Implement Queue using Stacks) · Phần tử lớn hơn kế tiếp (Next Greater Element)
· Số ngày chờ để ấm hơn (Daily Temperatures).

**Cây nhị phân & BST:** Kiểm tra cây tìm kiếm nhị phân hợp lệ (Validate BST) ·
Phần tử nhỏ thứ k trong BST (Kth Smallest Element in a BST) · Tổ tiên chung
gần nhất (Lowest Common Ancestor) · Kiểm tra cây cân bằng (Balanced Binary
Tree) · Đảo cây nhị phân (Invert Binary Tree) · Đường kính cây nhị phân
(Diameter of Binary Tree) · Xoá node khỏi BST (Delete Node in a BST) · Chèn
vào BST (Insert into a BST) · Tổng đường đi bằng giá trị cho trước (Path Sum)
· Duyệt cây theo mức (Binary Tree Level Order Traversal).

**Đồ thị:** Đếm số đảo (Number of Islands) · Sắp xếp topo / lịch học có điều
kiện tiên quyết (Course Schedule) · Sao chép đồ thị (Clone Graph) · Đường đi
ngắn nhất trong lưới nhị phân (Shortest Path in Binary Matrix) · Biến đổi từ
(Word Ladder) · Cam thối (Rotting Oranges) · Đếm thành phần liên thông (Number
of Connected Components) · Cạnh dư trong đồ thị (Redundant Connection).

**Sắp xếp & tìm kiếm:** Tìm kiếm nhị phân (Binary Search) · Tìm kiếm trong
mảng xoay đã sắp xếp (Search in Rotated Sorted Array) · Gộp các khoảng chồng
lấp (Merge Intervals) · Phần tử lớn thứ k (Kth Largest Element in an Array).

**Quy hoạch động:** Dãy con liên tiếp có tổng lớn nhất (Kadane's — Maximum
Subarray) · Bài toán cái túi 0/1 (0/1 Knapsack) · Dãy con chung dài nhất
(Longest Common Subsequence) · Dãy con tăng dài nhất (Longest Increasing
Subsequence) · Đổi tiền xu ít đồng nhất (Coin Change) · Leo cầu thang (Climbing
Stairs) · Khoảng cách chỉnh sửa (Edit Distance).

**Mảng & chuỗi:** Tổng hai số (Two Sum) · Tổng ba số (Three Sum) · Cửa sổ
trượt lớn nhất (Sliding Window Maximum) · Chuỗi con không lặp dài nhất
(Longest Substring Without Repeating Characters) · Gom nhóm từ đồng dạng
(Group Anagrams) · Tích các phần tử trừ chính nó (Product of Array Except
Self).

**Heap, Trie & Union-Find:** Top K phần tử xuất hiện nhiều nhất (Top K
Frequent Elements) · Cài đặt Trie (Implement Trie) · Tìm từ trong lưới ký tự
(Word Search II) · Đếm thành phần liên thông bằng Union-Find (Number of
Provinces).`;

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

  // Chỉ có mặt khi PROVIDER tự fan-out N câu thành N lời gọi song song
  // (`AuthoringRequest.batchIndex`/`batchSize`, xem doc ở đó). KHÁC hẳn
  // `keepBlock`: đó là các câu ĐÃ SINH XONG, còn đây là các worker chạy
  // song song, chưa ai xong trước ai — không worker nào thấy nội dung của
  // worker khác. Chỉ là một dòng nhắc giảm nhẹ rủi ro trùng ý, không phải
  // cơ chế chống trùng ý thật sự.
  //
  // `batchSize > 1` mới thêm: N=1 (một lời gọi lẻ, không phải fan-out) thì
  // không có gì để "song song" cùng.
  const batchBlock =
    request.batchIndex && request.batchSize && request.batchSize > 1
      ? `\n\nĐây là câu ${request.batchIndex}/${request.batchSize} đang được sinh SONG SONG bởi ` +
        `các bản sao độc lập của bạn — không thấy nội dung của nhau. Nếu đây không phải câu ` +
        `đầu tiên, hãy chọn một khía cạnh/chủ đề con khác trong phạm vi yêu cầu của giảng viên, ` +
        `tránh phương án hiển nhiên nhất.`
      : '';

  return `Bạn soạn đề thi môn Cấu trúc dữ liệu và Giải thuật.

Sinh ${request.questionCount} câu bằng ngôn ngữ ${request.language}.

Mỗi câu phải có ĐỦ BA phần, thiếu một phần là câu đó không dùng được:
1. Đề bài.
2. "modelAnswer": MÃ NGUỒN chạy được, không phải lời giải bằng văn xuôi.
3. "testBundle": các ca test, phủ ít nhất một ca biên (mảng rỗng, một phần
   tử, phần tử trùng, hoặc đã sắp sẵn).

${CLASSIC_PROBLEMS_CATALOG}

"resemblesKnownProblem": khớp một mục trong danh mục trên, hoặc là một bài
kinh điển phổ biến khác không có trong danh mục, thì NÓI RA TÊN NÓ — đừng chỉ
dựa vào trí nhớ tự do khi danh mục đã liệt kê sẵn để đối chiếu. Sinh viên tra
mạng ra lời giải trong ba mươi giây, và giảng viên cần biết điều đó trước khi
in đề. Không giống bài nào thì để null. CHỈ TÊN BÀI, không kèm giải thích
biến thể khác chỗ nào — tối đa một câu ngắn.

KHÔNG tự khai trường "verification": bạn chưa chạy gì cả.

Yêu cầu của giảng viên lần này:
${request.prompt}${refineBlock}${avoidBlock}${keepBlock}${knowledgeBlock}${batchBlock}

"topic" là một NHÃN NGẮN (2-5 từ, ví dụ "đồ thị - Dijkstra", "quy hoạch động"),
không phải câu mô tả. "requiredComplexity" là ký hiệu Big-O ngắn gọn (ví dụ
"O(n log n)"), kèm tối đa một ràng buộc phụ nếu thật sự cần — không phải một
câu liệt kê nhiều ràng buộc.

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
 * Cắt `resemblesKnownProblem` về trong hạn `MAX_CLASSIC_PROBLEM_LENGTH`.
 *
 * Lỗi thật 2026-09-24: field này KHÔNG có giới hạn độ dài ở đây (văn bản tự
 * do của model), nhưng frontend gửi nó nguyên văn lên làm `avoid` ở lượt
 * sinh lại kế tiếp, và `GenerateExamDto.avoid` có trần. Prompt đã dặn model
 * viết ngắn (xem chỉ dẫn "CHỈ TÊN BÀI" ở trên), nhưng dặn không phải chặn —
 * CẮT ở ĐÂY để lượt sinh lại kế tiếp không bao giờ lặp lại lỗi này, bất kể
 * model có nghe lời hay không.
 *
 * Cắt chứ không bỏ hẳn (không trả `null`): một cảnh báo "gần giống bài kinh
 * điển" bị CẮT NGẮN vẫn còn hữu ích cho giảng viên; bỏ hẳn thì giảng viên mất
 * luôn tín hiệu rủi ro chỉ vì model viết dài dòng.
 */
function truncateClassicProblem(value: string): string {
  if (value.length <= MAX_CLASSIC_PROBLEM_LENGTH) return value;
  return value.slice(0, MAX_CLASSIC_PROBLEM_LENGTH - 1) + '…';
}

/**
 * Cắt ra object JSON đầu tiên trong đầu ra, bỏ mọi chữ bao quanh nó.
 *
 * Prompt đã dặn "trả về DUY NHẤT một object JSON", nhưng model không luôn
 * nghe: đo thật 2026-09-24 (occ/claude-sonnet-5, lượt 5 câu), nó đóng rào
 * ```json rồi viết tiếp một đoạn "Lưu ý cho giảng viên". Và không trông vào
 * `output_config.format` được — gateway nhận tham số đó mà không thực thi
 * (xem claude-grading.provider.ts, đo 2026-09-17).
 *
 * Hai bước:
 * 1. Có rào thì lấy phần TRONG rào. An toàn vì JSON không cho phép ký tự
 *    xuống dòng thô trong chuỗi — code trong `modelAnswer` đi dưới dạng
 *    `\n` hai ký tự — nên một dòng mở đầu bằng ``` chỉ có thể là rào.
 * 2. Quét ngoặc có phân biệt chuỗi từ dấu `{` đầu tiên: dấu `{}` nằm trong
 *    code hay trong ghi chú đều không làm lệch chỗ cắt.
 *
 * Trả `null` khi ngoặc không khép — tức đầu ra bị cắt giữa chừng. Không
 * đoán phần thiếu: một đề bị vá là một đề sai mà trông như đúng.
 */
function extractJsonObject(text: string): string | null {
  const fenced = /```(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*```/i.exec(text);
  const source = fenced ? fenced[1] : text;

  const start = source.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
    } else if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      depth++;
    } else if (ch === '}' && --depth === 0) {
      return source.slice(start, i + 1);
    }
  }
  return null;
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
  const json = extractJsonObject(text);

  let raw: Record<string, unknown>;
  try {
    if (json === null) throw new Error('không có object JSON trọn vẹn');
    raw = JSON.parse(json) as Record<string, unknown>;
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
        typeof row.resemblesKnownProblem === 'string'
          ? truncateClassicProblem(row.resemblesKnownProblem)
          : null,
    };
  });

  return {
    title: typeof raw.title === 'string' ? raw.title : DEFAULT_EXAM_TITLE,
    language: typeof raw.language === 'string' ? raw.language : 'python',
    questions,
    // Gắn ở ĐÂY, bất kể model nói gì. Xem luật 1 ở doc trên.
    verification: { status: 'unverified', reason: 'sandbox_unavailable' },
  };
}

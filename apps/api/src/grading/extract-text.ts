/**
 * Getting words out of a submitted file.
 *
 * Only the two formats this slice can honestly handle: .docx through
 * mammoth (CLAUDE.md's own choice, and the submission type the MVP builds
 * first) and anything that is already text. Code projects and photographed
 * answers need a sandbox and a vision model respectively, and both are
 * their own piece of work — until then they extract to nothing, which is
 * what sends them to a human rather than to a fabricated score.
 *
 * Returning "" is a real answer here, never an error: an unreadable file is
 * a fact about the extraction, and a zero would read as a judgement about
 * the student's work.
 */

import {
  MAX_GRADING_INPUT_BYTES,
  MAX_GRADING_INPUT_CHARS,
  TRUNCATION_NOTICE,
} from './grading.types';

/**
 * File quá lớn để chấm tự động. KHÔNG phải điểm 0 — đây là sự thật về
 * cái file, không phải phán xét về bài làm, nên nó đi tới người chấm
 * tay, đúng đường mà một file không đọc được vẫn đi.
 *
 * Ném thay vì trả `''` để dòng log ở `gradeOne` nói được ĐÚNG ca nào:
 * "quá lớn" và "không đọc được định dạng này" dẫn tới cùng một kết cục
 * nhưng cần hai cách xử lý khác nhau từ phía con người.
 */
export class GradingInputTooLargeError extends Error {
  constructor(readonly bytes: number) {
    super(
      `File ${bytes} bytes vượt giới hạn ${MAX_GRADING_INPUT_BYTES} bytes cho chấm tự động`,
    );
    this.name = 'GradingInputTooLargeError';
  }
}

/**
 * Cắt cho vừa giới hạn ký tự, kể cả dòng thông báo.
 *
 * `MAX_GRADING_INPUT_CHARS` là trần của thứ được gửi đi, nên phần nội
 * dung phải nhường chỗ cho thông báo chứ không phải ngược lại.
 */
function capChars(text: string): string {
  if (text.length <= MAX_GRADING_INPUT_CHARS) {
    return text;
  }
  return text.slice(0, MAX_GRADING_INPUT_CHARS - TRUNCATION_NOTICE.length) + TRUNCATION_NOTICE;
}

const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.csv', '.json', '.xml', '.yml', '.yaml', '.html', '.htm',
  '.py', '.js', '.ts', '.tsx', '.jsx', '.java', '.c', '.h', '.cpp', '.cs',
  '.go', '.rs', '.rb', '.php', '.sql', '.sh', '.css', '.r',
]);

function extensionOf(key: string): string {
  const dot = key.lastIndexOf('.');
  return dot === -1 ? '' : key.slice(dot).toLowerCase();
}

/**
 * @param declaredFilename the name the teacher DECLARED for this
 * deliverable, not the storage key. A submission's key is built from ids so
 * that nothing user-typed can steer it, which means it carries no extension
 * and cannot say what the bytes are.
 */
export async function extractText(bytes: Buffer, declaredFilename: string): Promise<string> {
  // Trần BYTE đã chuyển sang `DocumentResolver` (content-resolver/).
  //
  // Nó từng nằm ở đây, với lời tuyên bố "để mọi provider, kể cả provider
  // thêm sau này, đều đi qua cùng một cửa". Lời ấy không đúng: ẢNH không
  // đi qua hàm này (nhánh cuối trả rỗng cho ảnh), nên cái cửa thủng đúng
  // bằng nhánh chưa xây. Ở tầng resolver thì mọi loại bài nộp đều phải qua.
  //
  // Trần KÝ TỰ (`MAX_GRADING_INPUT_CHARS`, qua `capChars`) VẪN ở lại đây,
  // vì nó là thuộc tính của việc trích text: một docx 2MB toàn chữ vẫn ra
  // hàng triệu ký tự, và đó là chuyện chỉ hàm này nhìn thấy.
  const extension = extensionOf(declaredFilename);

  if (extension === '.docx') {
    // Imported lazily: mammoth pulls in a chunk of XML machinery, and only
    // this one path needs it.
    const mammoth = await import('mammoth');
    const { value } = await mammoth.extractRawText({ buffer: bytes });
    return capChars(value);
  }

  if (TEXT_EXTENSIONS.has(extension)) {
    return capChars(bytes.toString('utf8'));
  }

  // .pdf, .doc, images, archives. Deliberately empty rather than a guess:
  // decoding a PDF as UTF-8 produces plausible-looking rubbish, and
  // plausible-looking rubbish is what a keyword matcher scores highest.
  return '';
}

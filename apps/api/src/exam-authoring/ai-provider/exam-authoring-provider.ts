/**
 * Seam duy nhất mà mọi model soạn đề ngồi sau.
 *
 * Cùng một lý do với `AI_GRADING_PROVIDER` (xem `grading/ai-provider/
 * ai-grading-provider.ts`): business logic không được import SDK của một nhà
 * cung cấp cụ thể, vì dự án dùng nhiều nhà cung cấp, so sánh chúng, và theo
 * dõi chi phí riêng từng cái. Service phụ thuộc interface này và không gì
 * khác; nó nhận implementation nào là một quyết định đấu dây ở module.
 */

/**
 * Một ca test của gói test sinh kèm.
 *
 * `group` khớp `rubric_criterion.test_group` của nhánh autograder — không đặt
 * tên mới cho cùng một khái niệm, vì gói này sinh ra để phần chấm dùng lại.
 */
export interface TestCase {
  name: string;
  group: string;
  input: string;
  expectedOutput: string;
}

export interface GeneratedQuestion {
  statement: string;
  points: number;
  topic: string;
  /** `null` = đề không ràng buộc độ phức tạp. KHÔNG dùng chuỗi rỗng: chuỗi
   *  rỗng in ra Word thành một dòng trống trông như lỗi hiển thị. */
  requiredComplexity: string | null;
  /**
   * MÃ NGUỒN, không phải lời giải bằng văn xuôi.
   *
   * Đây là toàn bộ điểm khác biệt của tính năng này. Một lời giải bằng lời
   * mãi mãi chỉ là văn bản tham chiếu; một chương trình thì chạy được, và
   * chạy được nghĩa là đo được — đó là thứ agent chấm cần.
   */
  modelAnswer: string;
  testBundle: TestCase[];
  /**
   * Bài kinh điển mà model TỰ NHẬN câu này giống. `null` = nó không thấy
   * giống bài nào.
   *
   * Là lời tự khai, KHÔNG phải bằng chứng: hệ thống không có mạng để đối
   * chiếu, nên nó không phát hiện được bài kinh điển mà model không tự nhận.
   */
  resemblesKnownProblem: string | null;
}

export type Verification =
  | { status: 'unverified'; reason: 'sandbox_unavailable' }
  | { status: 'passed'; ranAt: string; complexityMeasured: string | null }
  | { status: 'failed'; failures: string[]; repairAttempts: number };

export interface GeneratedExam {
  title: string;
  language: string;
  questions: GeneratedQuestion[];
  verification: Verification;
}

export interface AuthoringRequest {
  /** Prompt giảng viên gõ lần này. */
  prompt: string;
  /** Tri thức sẵn có của chính giảng viên đó, đã render thành văn bản.
   *  Rỗng là hợp lệ — giảng viên chưa có rubric nào vẫn soạn được đề. */
  knowledge: string[];
  questionCount: number;
  language: string;

  /**
   * Ba trường dưới đây chỉ có ở lượt SINH LẠI MỘT CÂU. Vắng ở lượt sinh đầu.
   *
   * Sinh lại mà giữ nguyên prompt thì model rơi lại đúng chỗ cũ: nó chọn bài
   * kinh điển vì đó là chỗ trũng nhất của phân phối, và prompt không đổi thì
   * phân phối không đổi. Ba trường này là ba cách đẩy nó ra.
   */

  /** Bài kinh điển PHẢI tránh. Hệ thống tự điền từ `resemblesKnownProblem`
   *  của câu đang bị thay — giảng viên không phải gõ lại thứ model vừa tự
   *  khai. */
  avoid?: string[];
  /** Ghi chú lái của giảng viên. Đây là phần hệ thống KHÔNG đoán được, nên
   *  nó là phần bắt buộc phải hỏi. */
  refineNote?: string;
  /** Đề của các câu đang giữ lại, để câu mới không trùng ý với chúng. */
  existingStatements?: string[];
}

export interface AuthoringUsage {
  modelUsed: string;
  inputTokens: number;
  outputTokens: number;
}

export interface AuthoringOutcome {
  exam: GeneratedExam;
  usage: AuthoringUsage;
}

export interface ExamAuthoringProvider {
  readonly name: string;
  generate(request: AuthoringRequest): Promise<AuthoringOutcome>;
}

export const EXAM_AUTHORING_PROVIDER = Symbol('EXAM_AUTHORING_PROVIDER');

/**
 * Trần số câu mỗi lượt.
 *
 * Quá số này thì giảng viên không đọc hết nổi trước khi duyệt — và một đề
 * không ai đọc thì tệ hơn không có đề, vì nó mang vẻ đã được kiểm.
 */
export const MAX_QUESTIONS_PER_RUN = 10;

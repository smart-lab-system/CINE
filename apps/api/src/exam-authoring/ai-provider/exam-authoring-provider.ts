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
  /**
   * Số câu KHÔNG sinh được trong lượt fan-out song song (mất mạng, model từ
   * chối, hết trần token, hoặc JSON hỏng ở một trong các lời gọi song song).
   *
   * Vắng mặt hoặc `0` = không câu nào lỗi — kể cả ở lượt `questionCount <= 1`
   * KHÔNG bao giờ đặt trường này (không có gì để fan-out với N=1), nên phía
   * đọc phải kiểm `(exam.failedCount ?? 0) > 0`, không phải chỉ kiểm trường
   * này có mặt hay không.
   *
   * `questions` khi đó NGẮN HƠN số câu giảng viên yêu cầu — không phải một
   * mảng đủ chỗ trống, vì không có gì để lấp vào chỗ một câu chưa từng sinh
   * ra được.
   */
  failedCount?: number;
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

  /**
   * Hai trường dưới đây chỉ có ở lượt FAN-OUT SONG SONG (`questionCount` gốc
   * > 1). CHỈ provider tự đặt cho từng worker — DTO và `ExamAuthoringService`
   * không bao giờ gửi hai trường này lên, và `questionCount` trên request đã
   * bị provider ép về 1 trước khi gắn chúng (mỗi worker vẫn chỉ xin ĐÚNG một
   * câu, đúng khuôn `parseAuthoringResponse` đã có).
   *
   * Cả hai chỉ để dựng MỘT dòng nhắc nhẹ trong prompt ("đây là câu mấy trong
   * mấy câu đang sinh song song") — không phải cơ chế chống trùng ý thật sự.
   * Các worker chạy độc lập, không thấy nội dung của nhau, nên đây chỉ là
   * giảm nhẹ rủi ro trùng ý, không phải giải pháp triệt để.
   */
  batchIndex?: number;
  batchSize?: number;
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

/**
 * Trần độ dài của `resemblesKnownProblem` — MỘT hằng số, dùng ở CẢ HAI đầu
 * của một vòng round-trip, và đó chính là lý do nó phải sống ở đây.
 *
 * Lỗi thật 2026-09-24: `resemblesKnownProblem` là văn bản TỰ DO của model,
 * không giới hạn độ dài ở phía sinh ra nó (`parseAuthoringResponse`). Nhưng
 * frontend gửi nó NGUYÊN VĂN lên làm phần tử của `avoid` ở lượt sinh lại
 * (`handleRegenerate`), và `GenerateExamDto.avoid` giới hạn mỗi phần tử
 * `@Length(1, 200)`. Hai giới hạn KHÔNG khớp nhau (một cái không tồn tại,
 * một cái là 200) là cách một model viết dài hơn 200 ký tự — đã xảy ra thật
 * — làm chính lượt SINH LẠI KẾ TIẾP của câu đó bị 400 ngay từ vòng validate.
 *
 * Import hằng số này ở CẢ HAI đầu (`authoring-prompt.ts` để cắt khi parse,
 * `generate-exam.dto.ts` để validate) thay vì hai số `200` viết tay ở hai
 * chỗ: nếu chỉ đổi một chỗ, đúng lỗi này lặp lại — chỉ đổi chỗ nào bị cắt.
 */
export const MAX_CLASSIC_PROBLEM_LENGTH = 200;

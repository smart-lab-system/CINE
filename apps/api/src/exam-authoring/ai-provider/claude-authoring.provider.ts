import {
  BadGatewayException,
  HttpException,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import {
  AuthoringOutcome,
  AuthoringRequest,
  AuthoringUsage,
  ExamAuthoringProvider,
  GeneratedExam,
  GeneratedQuestion,
} from './exam-authoring-provider';
import { buildAuthoringPrompt, DEFAULT_EXAM_TITLE, parseAuthoringResponse } from './authoring-prompt';

/**
 * Sonnet 5, KHÁC `GRADER_MODEL` ('claude-sonnet-4-6') mà nhánh chấm dùng.
 *
 * Cố ý khác, và lý do đáng ghi ra: chấm một tiêu chí là phán đoán hẹp đã có
 * rubric dẫn đường; soạn một đề kèm đáp án chạy được và gói test phủ biên là
 * việc rộng hơn hẳn. Nhánh chấm nâng bậc khi nào là quyết định riêng của nó —
 * hai con số này không phải cùng một quyết định, nên không dùng chung hằng số.
 */
export const AUTHORING_MODEL = process.env.CLAUDE_AUTHORING_MODEL ?? 'occ/claude-sonnet-5';

/**
 * Trần token đầu ra — và trần này GỒM CẢ token suy nghĩ.
 *
 * Sonnet 5 bật adaptive thinking mặc định, và thinking tiêu vào đúng trần
 * này. Đo thật 2026-09-24 qua gateway: 3 câu tốn 6-9 nghìn token (một nửa là
 * thinking); 10 câu với trần 16000 tiêu TRỌN 16000 cho thinking và không còn
 * token nào cho đề. Không chặn riêng thinking được: `budget_tokens` bị Sonnet
 * 5 trả 400.
 *
 * Trên ~21000, SDK từ chối gọi non-streaming (ước lượng quá 10 phút), nên
 * con số này đi kèm `messages.stream()` ở dưới — đổi một bên phải đổi cả hai.
 *
 * ÁP DỤNG CHO TỪNG LỜI GỌI, kể cả trong fan-out (mỗi worker xin đúng 1 câu):
 * mỗi câu đơn lẻ chưa từng đo quá ~11500 token, nên trần này rộng rãi hơn
 * nhiều so với cần — cố ý, cùng lý lẽ "thà xin nhiều rồi dùng ít" như cũ.
 * Không thu nhỏ riêng cho fan-out để giữ MỘT hằng số, một chỗ đổi.
 */
const MAX_OUTPUT_TOKENS = 64000;

/**
 * Trần thời gian RIÊNG cho mỗi lời gọi trong fan-out.
 *
 * `Promise.allSettled` (xem `generateFanOut`) vẫn phải CHỜ HẾT mọi worker
 * trước khi trả về — không có trần này, một kết nối bị treo (mất gói tin
 * giữa chừng, gateway không đóng socket) kéo dài CẢ LÔ, phá đúng lời hứa
 * "thời gian gần như không đổi theo N" mà fan-out sinh ra để giữ. Vượt trần
 * thì worker đó chỉ thành một slot lỗi bình thường (gộp vào `failedCount`),
 * không kéo những worker khác.
 *
 * 150 giây: rộng hơn hẳn mọi lượt sinh MỘT câu đã đo (17,9-95,8 giây), kể cả
 * lượt nặng nhất (`effort` cao, kèm avoid/refineNote/existingStatements).
 */
const WORKER_TIMEOUT_MS = 150_000;

/**
 * Kết quả MỘT lời gọi model cho ĐÚNG một câu — KHÔNG BAO GIỜ ném lỗi.
 *
 * Khác `generate()` công khai (ném `HttpException` khi hỏng, giữ nguyên
 * hành vi cũ cho lượt `questionCount <= 1`): đây là khối dùng CHUNG cho cả
 * lượt lẻ lẫn từng worker trong fan-out. Fan-out cần THU THẬP lỗi của từng
 * worker để đếm vào `failedCount`, không phải để một worker hỏng kéo đổ
 * `Promise.allSettled` xuống một exception duy nhất.
 */
type WorkerOutcome =
  | { status: 'fulfilled'; exam: GeneratedExam; usage: AuthoringUsage }
  | { status: 'rejected'; error: HttpException; usage: AuthoringUsage | null };

@Injectable()
export class ClaudeAuthoringProvider implements ExamAuthoringProvider {
  readonly name = AUTHORING_MODEL;
  private readonly logger = new Logger(ClaudeAuthoringProvider.name);
  private readonly client = new Anthropic();

  async generate(request: AuthoringRequest): Promise<AuthoringOutcome> {
    if (request.questionCount <= 1) {
      const outcome = await this.generateOne(request);
      if (outcome.status === 'rejected') throw outcome.error;
      this.logger.log(
        `soạn đề: ${outcome.exam.questions.length} câu, ${request.language}, ` +
          `token in=${outcome.usage.inputTokens} out=${outcome.usage.outputTokens}`,
      );
      return { exam: outcome.exam, usage: outcome.usage };
    }
    return this.generateFanOut(request);
  }

  /**
   * N lời gọi ĐỘC LẬP, mỗi lời gọi xin ĐÚNG một câu — SONG SONG, không tuần
   * tự. Đây là toàn bộ điểm của fan-out: thời gian chờ ≈ lời gọi chậm nhất,
   * không phải tổng cộng dồn của N lời gọi (đo thật 2026-09-24: 5 lời gọi
   * song song xong trong 17,7s, trong khi tuần tự sẽ là 70,7s).
   *
   * KHÔNG có bước "dàn ý trước" (outline): một lời gọi tuần tự thêm, chưa đo
   * được tốn bao lâu, có thể ăn hết lợi ích tốc độ ở đúng trường hợp phổ
   * biến nhất (mặc định 3 câu). Mỗi worker chỉ mang một dòng nhắc nhẹ
   * (`batchIndex`/`batchSize` trong `buildAuthoringPrompt`) — giảm nhẹ rủi ro
   * trùng ý, không phải giải pháp triệt để. `resemblesKnownProblem` (danh
   * mục bài kinh điển) vẫn che được ca giá trị cao nhất: hai câu cùng là bài
   * kinh điển.
   */
  private async generateFanOut(request: AuthoringRequest): Promise<AuthoringOutcome> {
    const n = request.questionCount;
    const settled = await Promise.allSettled(
      Array.from({ length: n }, (_, i) =>
        this.generateOne({ ...request, questionCount: 1, batchIndex: i + 1, batchSize: n }),
      ),
    );

    const questions: GeneratedQuestion[] = [];
    const usages: AuthoringUsage[] = [];
    let failedCount = 0;
    let firstError: HttpException | undefined;
    let firstTitle: string | undefined;

    // `allSettled` chứ không `all`, DÙ `generateOne` được thiết kế để không
    // bao giờ ném: lớp phòng thủ kép — nếu một chỗ nào đó trong tương lai
    // làm `generateOne` ném thật (bug chưa lường trước), N-1 worker còn lại
    // vẫn không bị cuốn theo. Cùng triết lý với `ExamSessionGateway.
    // requestRecollect` (xem doc ở đó): một worker lỗi là thông tin cần báo
    // cáo (`failedCount`), không phải lý do bỏ luôn kết quả của những worker
    // còn lại — áp dụng nghiêm hơn một bậc vì lời gọi ở đây tốn tiền thật.
    settled.forEach((result, i) => {
      const outcome: WorkerOutcome =
        result.status === 'fulfilled'
          ? result.value
          : {
              status: 'rejected',
              error: new BadGatewayException('Không sinh được câu này — hãy thử lại'),
              usage: null,
            };

      if (outcome.status === 'fulfilled') {
        questions.push(outcome.exam.questions[0]);
        usages.push(outcome.usage);
        // `i === 0` tức `batchIndex: 1` (mảng giữ nguyên thứ tự đưa vào —
        // bảo đảm của `Promise.allSettled`). Chỉ để LẤY TITLE, không phải
        // để suy ra thứ tự câu nào "quan trọng hơn".
        if (i === 0) firstTitle = outcome.exam.title;
      } else {
        failedCount++;
        // Lỗi SAU khi có response (refusal/max_tokens/JSON hỏng) vẫn tốn
        // token thật — cộng vào. Lỗi TRƯỚC khi có response (mất mạng, treo
        // quá timeout) thì `usage` là `null`, không có gì để cộng.
        if (outcome.usage) usages.push(outcome.usage);
        firstError ??= outcome.error;
      }
    });

    if (questions.length === 0) {
      this.logger.error(`fan-out ${n} câu: cả ${n} lượt đều hỏng`);
      throw firstError ?? new BadGatewayException('Không sinh được câu nào — hãy thử lại');
    }

    const usage: AuthoringUsage = {
      modelUsed: usages[0]?.modelUsed ?? AUTHORING_MODEL,
      inputTokens: usages.reduce((sum, u) => sum + u.inputTokens, 0),
      outputTokens: usages.reduce((sum, u) => sum + u.outputTokens, 0),
    };

    this.logger.log(
      `soạn đề (fan-out): ${questions.length}/${n} câu, ${failedCount} lỗi, ` +
        `token in=${usage.inputTokens} out=${usage.outputTokens}`,
    );

    return {
      exam: {
        // `firstTitle`: title do WORKER ĐẦU TIÊN tự đề xuất (mỗi worker vẫn
        // xin đủ {title, language, questions} dù chỉ sinh 1 câu). Không
        // đúng cho CẢ BỘ (worker đó chỉ thấy câu của chính nó), nhưng vẫn
        // sát hơn một chuỗi cố định. `language` LẤY TỪ REQUEST GỐC, không
        // từ worker nào: đây là input đã được DTO kiểm hợp lệ từ trước, tin
        // nó chắc hơn tin model tự echo lại.
        title: firstTitle ?? DEFAULT_EXAM_TITLE,
        language: request.language,
        questions,
        verification: { status: 'unverified', reason: 'sandbox_unavailable' },
        failedCount: failedCount > 0 ? failedCount : undefined,
      },
      usage,
    };
  }

  /**
   * Một lời gọi model, xin ĐÚNG một câu — dùng chung cho lượt lẻ
   * (`questionCount <= 1`) lẫn từng worker trong fan-out.
   */
  private async generateOne(request: AuthoringRequest): Promise<WorkerOutcome> {
    let response: Anthropic.Message;
    try {
      // Stream chỉ để được phép xin trần cao; ta vẫn chờ trọn thông điệp.
      // `{ timeout: WORKER_TIMEOUT_MS }`: xem doc của hằng số này.
      response = await this.client.messages
        .stream(
          {
            model: AUTHORING_MODEL,
            max_tokens: MAX_OUTPUT_TOKENS,
            messages: [{ role: 'user', content: buildAuthoringPrompt(request) }],
          },
          { timeout: WORKER_TIMEOUT_MS },
        )
        .finalMessage();
    } catch (error) {
      // Hỏng TRƯỚC khi có response — mất mạng, treo quá timeout, gateway
      // rớt kết nối giữa chừng. KHÔNG có usage để cộng: chưa nhận được
      // token nào thì chưa tốn tiền nào.
      this.logger.error(`lượt soạn đề hỏng trước khi có response: ${String(error)}`);
      return {
        status: 'rejected',
        error: new BadGatewayException('Không gọi được model — hãy thử sinh lại'),
        usage: null,
      };
    }

    const usage: AuthoringUsage = {
      // `response.model`, không phải hằng số ở trên: API có thể trả về một
      // id cụ thể hơn id ta gửi, và bảng usage phải ghi cái ĐÃ CHẠY chứ
      // không phải cái ta định chạy.
      modelUsed: response.model ?? AUTHORING_MODEL,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };

    // Kiểm TRƯỚC khi đọc nội dung. Hai ca này đều trả HTTP 200, và nếu để
    // lọt xuống parser thì cả hai đọc ra "JSON hỏng" — đúng lời báo đã làm
    // lần điều tra 2026-09-24 phải gọi lại model năm lượt mới ra nguyên nhân.
    //
    // HttpException chứ không Error trần: Error trần tới trình duyệt thành
    // 500 "Internal server error", và trang soạn đề hiện nguyên `message` lên
    // toast — lời khuyên dưới đây là thứ duy nhất giảng viên làm theo được.
    // 422: yêu cầu này, gửi lại y nguyên, sẽ hỏng y nguyên.
    if (response.stop_reason === 'refusal') {
      return {
        status: 'rejected',
        error: new UnprocessableEntityException(
          'Model từ chối soạn đề với yêu cầu này — thử diễn đạt lại yêu cầu',
        ),
        usage,
      };
    }
    if (response.stop_reason === 'max_tokens') {
      const thinking = response.usage.output_tokens_details?.thinking_tokens ?? 0;
      return {
        status: 'rejected',
        error: new UnprocessableEntityException(
          `Model hết trần token trước khi viết xong đề (${response.usage.output_tokens} token, ` +
            `trong đó ${thinking} token suy nghĩ) — thử giảm số câu mỗi lượt`,
        ),
        usage,
      };
    }

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    try {
      return { status: 'fulfilled', exam: parseAuthoringResponse(text), usage };
    } catch (error) {
      // 502: model phía trên trả về thứ không dùng được, và gọi lại có thể
      // ra khác. Lời báo của parser chỉ nêu tên trường sai, không trích nội
      // dung đề (spec §9), nên đưa thẳng ra được.
      return {
        status: 'rejected',
        error: new BadGatewayException(`${(error as Error).message} — hãy thử sinh lại`),
        usage,
      };
    }
  }
}

import {
  BadGatewayException,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import {
  AuthoringOutcome,
  AuthoringRequest,
  ExamAuthoringProvider,
  GeneratedExam,
} from './exam-authoring-provider';
import { buildAuthoringPrompt, parseAuthoringResponse } from './authoring-prompt';

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
 */
const MAX_OUTPUT_TOKENS = 64000;

@Injectable()
export class ClaudeAuthoringProvider implements ExamAuthoringProvider {
  readonly name = AUTHORING_MODEL;
  private readonly logger = new Logger(ClaudeAuthoringProvider.name);
  private readonly client = new Anthropic();

  async generate(request: AuthoringRequest): Promise<AuthoringOutcome> {
    // Stream chỉ để được phép xin trần cao; ta vẫn chờ trọn thông điệp.
    const response = await this.client.messages
      .stream({
        model: AUTHORING_MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        messages: [{ role: 'user', content: buildAuthoringPrompt(request) }],
      })
      .finalMessage();

    // Kiểm TRƯỚC khi đọc nội dung. Hai ca này đều trả HTTP 200, và nếu để
    // lọt xuống parser thì cả hai đọc ra "JSON hỏng" — đúng lời báo đã làm
    // lần điều tra 2026-09-24 phải gọi lại model năm lượt mới ra nguyên nhân.
    //
    // HttpException chứ không Error trần: Error trần tới trình duyệt thành
    // 500 "Internal server error", và trang soạn đề hiện nguyên `message` lên
    // toast — lời khuyên dưới đây là thứ duy nhất giảng viên làm theo được.
    // 422: yêu cầu này, gửi lại y nguyên, sẽ hỏng y nguyên.
    if (response.stop_reason === 'refusal') {
      throw new UnprocessableEntityException(
        'Model từ chối soạn đề với yêu cầu này — thử diễn đạt lại yêu cầu',
      );
    }
    if (response.stop_reason === 'max_tokens') {
      const thinking = response.usage.output_tokens_details?.thinking_tokens ?? 0;
      throw new UnprocessableEntityException(
        `Model hết trần token trước khi viết xong đề (${response.usage.output_tokens} token, ` +
          `trong đó ${thinking} token suy nghĩ) — thử giảm số câu mỗi lượt`,
      );
    }

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    let exam: GeneratedExam;
    try {
      exam = parseAuthoringResponse(text);
    } catch (error) {
      // 502: model phía trên trả về thứ không dùng được, và gọi lại có thể
      // ra khác. Lời báo của parser chỉ nêu tên trường sai, không trích nội
      // dung đề (spec §9), nên đưa thẳng ra được.
      throw new BadGatewayException(`${(error as Error).message} — hãy thử sinh lại`);
    }
    this.logger.log(
      `soạn đề: ${exam.questions.length} câu, ${request.language}, ` +
        `token in=${response.usage.input_tokens} out=${response.usage.output_tokens}`,
    );

    return {
      exam,
      usage: {
        // `response.model`, không phải hằng số ở trên: API có thể trả về một
        // id cụ thể hơn id ta gửi, và bảng usage phải ghi cái ĐÃ CHẠY chứ
        // không phải cái ta định chạy.
        modelUsed: response.model ?? AUTHORING_MODEL,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }
}

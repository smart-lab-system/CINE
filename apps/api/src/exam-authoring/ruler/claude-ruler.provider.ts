import { BadGatewayException, Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { AUTHORING_MODEL } from '../ai-provider/claude-authoring.provider';
import { AuthoringUsage } from '../ai-provider/exam-authoring-provider';
import { RulerOutcome, RulerProvider, RulerProviderFailure, RulerRequest } from './ruler-provider';
import { buildRulerPrompt, parseRulerResponse, RULER_OUTPUT_SCHEMA, RULER_PROMPT_VERSION } from './ruler-prompt';

/**
 * Trần token đầu ra của MỘT lượt: gồm cả token suy nghĩ (Sonnet 5 bật adaptive thinking mặc định và nó tiêu vào đúng
 * trần này — đo ở `claude-authoring.provider.ts`). Một đề xuất gồm một chương trình và vài chục ca nên rộng rãi hơn cần;
 * giữ dưới ~21000 token thì SDK cho gọi không stream, nhưng ta vẫn stream cho đồng bộ với soạn đề.
 */
const MAX_OUTPUT_TOKENS = 32_000;
/** Trần thời gian chờ HEADER của một lời gọi: một kết nối treo không được giữ cả lượt sinh (đồng bộ, spec D-D). */
const CALL_TIMEOUT_MS = 150_000;
/**
 * Trần TOÀN BỘ lời gọi, kể cả lúc stream. `timeout` của SDK dừng tác dụng khi header đã về, nên một stream chậm không bị chặn; và
 * SDK tự thử lại lỗi timeout hai lần. Quá 15 phút thì lượt kế tiếp coi lượt này đã chết và dọn nó, còn lượt này vẫn ghi gói
 * (xem `TestRunStore.closeStale`) — nên cả lượt phải nằm xa dưới ngưỡng đó. Thử lại là việc của giảng viên (bấm lại), không ngầm.
 */
const OVERALL_TIMEOUT_MS = 240_000;

/**
 * Model đề xuất thước từ một đề cố định (G2b-R Task 3). Cố ý dùng cùng model với soạn đề (`AUTHORING_MODEL`): việc này
 * cũng là viết mã chạy được và nghĩ ca biên, không phải phán đoán hẹp như chấm một tiêu chí.
 *
 * Mọi lỗi ra là `RulerProviderFailure` mang `usage`: một lượt hỏng SAU khi có response vẫn tốn token thật.
 */
@Injectable()
export class ClaudeRulerProvider implements RulerProvider {
  readonly name = AUTHORING_MODEL;
  private readonly logger = new Logger(ClaudeRulerProvider.name);
  private readonly client = new Anthropic();

  async propose(request: RulerRequest): Promise<RulerOutcome> {
    let response: Anthropic.Message;
    try {
      response = await this.client.messages
        .stream(
          {
            model: AUTHORING_MODEL,
            max_tokens: MAX_OUTPUT_TOKENS,
            messages: [{ role: 'user', content: buildRulerPrompt(request) }],
            // Khuôn JSON gửi qua structured outputs: khi gateway thực thi tham số này, đầu ra đúng khuôn, không phụ thuộc việc
            // model tự escape dấu nháy. Xem RULER_OUTPUT_SCHEMA.
            output_config: { format: { type: 'json_schema', schema: RULER_OUTPUT_SCHEMA } },
          },
          { timeout: CALL_TIMEOUT_MS, maxRetries: 0, signal: AbortSignal.timeout(OVERALL_TIMEOUT_MS) },
        )
        .finalMessage();
    } catch (error) {
      // Hỏng TRƯỚC khi có response: chưa nhận token nào thì chưa tốn tiền nào.
      this.logger.error(`lượt sinh thước hỏng trước khi có response: ${String(error)}`);
      throw new RulerProviderFailure(new BadGatewayException('Không gọi được model — hãy thử lại'), null);
    }

    const usage: AuthoringUsage = {
      // `response.model`, không phải hằng số: bảng usage ghi cái ĐÃ CHẠY.
      modelUsed: response.model ?? AUTHORING_MODEL,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };

    // Kiểm TRƯỚC khi đọc nội dung: cả hai ca đều trả HTTP 200 và nếu để lọt xuống parser thì đọc ra "JSON hỏng".
    if (response.stop_reason === 'refusal') {
      throw new RulerProviderFailure(
        new UnprocessableEntityException('Model từ chối dựng thước cho đề này — thử lại hoặc tự tạo gói test'),
        usage,
      );
    }
    if (response.stop_reason === 'max_tokens') {
      const thinking = response.usage.output_tokens_details?.thinking_tokens ?? 0;
      throw new RulerProviderFailure(
        new UnprocessableEntityException(
          `Model hết trần token trước khi viết xong thước (${response.usage.output_tokens} token, trong đó ${thinking} token suy nghĩ) — thử lại`,
        ),
        usage,
      );
    }

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');
    try {
      const proposal = parseRulerResponse(text, request.teacherAnswer === undefined ? 'statement' : 'answer');
      this.logger.log(
        `sinh thước: ${proposal.cases.length} ca đề xuất, ${proposal.examples.length} ví dụ, ${request.language}, ` +
          `token in=${usage.inputTokens} out=${usage.outputTokens}`,
      );
      return { proposal, usage, promptVersion: RULER_PROMPT_VERSION };
    } catch (error) {
      // 502: model trả thứ không dùng được và gọi lại có thể ra khác. Lời báo của parser chỉ nêu tên trường, không chứa nội dung.
      throw new RulerProviderFailure(new BadGatewayException(`${(error as Error).message} — hãy thử lại`), usage);
    }
  }
}

import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import {
  AuthoringOutcome,
  AuthoringRequest,
  ExamAuthoringProvider,
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
 * Trần token đầu ra. Một đề 10 câu, mỗi câu kèm mã nguồn và gói test, là một
 * phản hồi dài — cắt cụt ở đây cho ra JSON hỏng, và `parseAuthoringResponse`
 * sẽ ném. Thà xin nhiều rồi dùng ít.
 */
const MAX_OUTPUT_TOKENS = 16000;

@Injectable()
export class ClaudeAuthoringProvider implements ExamAuthoringProvider {
  readonly name = AUTHORING_MODEL;
  private readonly logger = new Logger(ClaudeAuthoringProvider.name);
  private readonly client = new Anthropic();

  async generate(request: AuthoringRequest): Promise<AuthoringOutcome> {
    const response = await this.client.messages.create({
      model: AUTHORING_MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      messages: [{ role: 'user', content: buildAuthoringPrompt(request) }],
    });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    const exam = parseAuthoringResponse(text);
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

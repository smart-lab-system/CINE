import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { AdvocateOpinion } from './advocate.types';
import { buildAdvocatePrompt } from './advocate-prompt';

/**
 * CÙNG model với Grader, không phải model rẻ hơn (spec §2.1).
 *
 * Cache khoá theo model, nên một cascade hai model sẽ ghi khối tiền tố ở
 * HAI namespace. Và đặt model yếu nhất ở đúng điểm quyết định sự công bằng
 * là ngược: model rẻ bỏ sót một ca lệch thì bài đó bị chấm theo rubric,
 * điểm thấp, KHÔNG AI BIẾT — hỏng âm thầm, trái nguyên tắc "fail loudly".
 */
const ADVOCATE_MODEL = 'claude-opus-5';

/**
 * Schema output — KHÔNG có con số nào.
 *
 * Cùng ranh giới với Grader: model phán đoán, code đếm. Advocate ĐƯỢC
 * phép đề xuất một `verdict` (một phán đoán), nhưng không bao giờ một
 * `points`, một `totalScore` hay một `confidence`.
 */
const AdvocateOutputSchema = z.object({
  isCorrect: z.enum(['yes', 'partially', 'no']),
  reasoning: z.string(),
  evidence: z.array(z.string()),
  suggestedVerdicts: z.array(
    z.object({
      criterionId: z.string(),
      suggestedVerdict: z.enum(['met', 'partially_met', 'not_met']),
      why: z.string(),
    }),
  ),
});

/**
 * Cùng schema, viết tay cho API — helper `zodOutputFormat` của SDK yêu cầu
 * zod v4 còn repo dùng v3 (xem `claude-grading.provider.ts` cho lý do đầy
 * đủ). Hai bản phải khớp nhau, và `safeParse` ở dưới là thứ bắt được lúc
 * chúng lệch.
 */
const ADVOCATE_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['isCorrect', 'reasoning', 'evidence', 'suggestedVerdicts'],
  properties: {
    isCorrect: {
      type: 'string',
      enum: ['yes', 'partially', 'no'],
      description: 'Sinh viên có trả lời ĐÚNG so với đề bài không.',
    },
    reasoning: {
      type: 'string',
      description:
        'Lập luận bênh vực, viết cho GIẢNG VIÊN đọc. Ngắn, cụ thể, dựa trên bài làm.',
    },
    evidence: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Trích NGUYÊN VĂN từ bài làm, đúng từng chữ. Dẫn chứng bịa bị phát hiện bằng máy.',
    },
    suggestedVerdicts: {
      type: 'array',
      description: 'Chỉ những tiêu chí nên xem lại. Không có gì để kiến nghị thì để RỖNG.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['criterionId', 'suggestedVerdict', 'why'],
        properties: {
          criterionId: { type: 'string' },
          suggestedVerdict: {
            type: 'string',
            enum: ['met', 'partially_met', 'not_met'],
          },
          why: { type: 'string' },
        },
      },
    },
  },
};

export interface AdvocateRequest {
  /** Chỉ để ghi log — KHÔNG đi vào prompt. */
  studentMssv: string;
  content: string;
  questionPdf?: Buffer;
  modelAnswerPdf?: Buffer;
  modelAnswerNote?: string;
}

/**
 * Lượt hỏi thứ hai: "bỏ qua rubric, em ấy có đúng không?"
 *
 * CHỈ KIẾN NGHỊ (spec §2.2). Không có đường nào từ file này tới
 * `ai_total_score` — con số đó là của Grader, ghi một lần, bất biến, và
 * `trg_grading_result_guard_ai_immutable` ép điều đó ở tầng DB chứ không
 * chỉ ở tầng quy ước.
 */
@Injectable()
export class AdvocateProvider {
  readonly name = ADVOCATE_MODEL;

  private readonly logger = new Logger(AdvocateProvider.name);
  private readonly client = new Anthropic();

  // KHÔNG có trạng thái nào ở đây — cùng lý do với `ClaudeGradingProvider`:
  // provider là singleton của Nest và worker chạy `concurrency: 5`, nên mọi
  // trường mutable là một cuộc đua chờ xảy ra. Tài liệu đi theo request.

  async advocate(request: AdvocateRequest): Promise<AdvocateOpinion> {
    const prompt = buildAdvocatePrompt({
      studentText: request.content,
      questionPdf: request.questionPdf,
      modelAnswerPdf: request.modelAnswerPdf,
      modelAnswerNote: request.modelAnswerNote,
    });

    const response = await this.client.messages.create({
      model: ADVOCATE_MODEL,
      max_tokens: 16000,
      // KHÔNG `budget_tokens`: Opus 5 trả 400 cho tham số đó.
      thinking: { type: 'adaptive' },
      output_config: {
        effort: 'high',
        format: { type: 'json_schema', schema: ADVOCATE_JSON_SCHEMA },
      },
      system: prompt.system as Anthropic.TextBlockParam[],
      messages: [{ role: 'user', content: prompt.userContent as Anthropic.ContentBlockParam[] }],
    });

    // `stop_reason: 'refusal'` là HTTP 200 — kiểm TRƯỚC khi đọc nội dung.
    if (response.stop_reason === 'refusal') {
      const detail = response.stop_details;
      const error = new Error(
        `Advocate từ chối đọc bài này (${detail?.type ?? 'không rõ'}) — cần người xem`,
      );
      (error as { status?: number }).status = 422;
      throw error;
    }

    const text = response.content.find(
      (block): block is Anthropic.TextBlock => block.type === 'text',
    );
    if (!text) {
      const error = new Error('Advocate không trả về khối text nào');
      (error as { status?: number }).status = 422;
      throw error;
    }

    const validation = AdvocateOutputSchema.safeParse(JSON.parse(text.text));
    if (!validation.success) {
      // KHÔNG nêu nội dung trả về: nó chứa dẫn chứng trích từ bài làm của
      // sinh viên, và message này đi vào `failedReason` trong Redis.
      const paths = validation.error.issues.map((i) => i.path.join('.')).join(', ');
      const error = new Error(`Output của Advocate không khớp schema ở: ${paths}`);
      (error as { status?: number }).status = 422;
      throw error;
    }
    const parsed = validation.data;

    if (prompt.injectionSuspected) {
      this.logger.warn(
        `submission ${request.studentMssv}: nghi ngờ có câu lệnh nhắm vào hệ thống ` +
          'chấm trong bài làm (phát hiện ở server, lượt Advocate)',
      );
    }

    const usage = {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
      cacheCreationTokens: response.usage.cache_creation_input_tokens ?? 0,
    };

    return {
      isCorrect: parsed.isCorrect,
      reasoning: parsed.reasoning,
      evidence: parsed.evidence,
      suggestedVerdicts: parsed.suggestedVerdicts,
      // Để RỖNG ở đây, không tự kiểm: `verifyEvidence` cần bài làm nguyên
      // văn, và nơi cầm nó là `GradingService`. Kiểm ở hai chỗ nghĩa là
      // hai nguồn cho cùng một sự thật, thứ người đọc sau phải tự chứng
      // minh là không lệch nhau được.
      unverifiedEvidence: [],
      usage,
    };
  }
}

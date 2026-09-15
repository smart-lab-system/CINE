import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { AdvocateOpinion } from './advocate.types';
import { ADVOCATE_JSON_SCHEMA, AdvocateOutputSchema } from './advocate-schema';
import { buildAdvocatePrompt } from './advocate-prompt';
import { AdvocateProvider, AdvocateRequest } from './advocate-provider';
import { badOutputError } from './provider-failure';

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
 * Lượt hỏi thứ hai: "bỏ qua rubric, em ấy có đúng không?"
 *
 * CHỈ KIẾN NGHỊ (spec §2.2). Không có đường nào từ file này tới
 * `ai_total_score` — con số đó là của Grader, ghi một lần, bất biến, và
 * `trg_grading_result_guard_ai_immutable` ép điều đó ở tầng DB chứ không
 * chỉ ở tầng quy ước.
 */
@Injectable()
export class ClaudeAdvocateProvider implements AdvocateProvider {
  readonly name = ADVOCATE_MODEL;

  private readonly logger = new Logger(ClaudeAdvocateProvider.name);
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
      throw badOutputError(
        `Advocate từ chối đọc bài này (${detail?.type ?? 'không rõ'}) — cần người xem`,
      );
    }

    const text = response.content.find(
      (block): block is Anthropic.TextBlock => block.type === 'text',
    );
    if (!text) {
      throw badOutputError('Advocate không trả về khối text nào');
    }

    const validation = AdvocateOutputSchema.safeParse(JSON.parse(text.text));
    if (!validation.success) {
      // KHÔNG nêu nội dung trả về: nó chứa dẫn chứng trích từ bài làm của
      // sinh viên, và message này đi vào `failedReason` trong Redis.
      const paths = validation.error.issues.map((i) => i.path.join('.')).join(', ');
      throw badOutputError(`Output của Advocate không khớp schema ở: ${paths}`);
    }
    const parsed = validation.data;

    if (prompt.injectionSuspected || parsed.injectionAttempt.detected) {
      // Hai nguồn, cố ý — cùng lập luận với Grader: phát hiện cơ học ở
      // server không phụ thuộc vào việc model có chịu tố giác một cuộc tấn
      // công nhắm vào chính nó hay không, còn model bắt được thứ mà một
      // regex hình dạng không bao giờ bắt được.
      this.logger.warn(
        `submission ${request.studentMssv}: nghi ngờ có câu lệnh nhắm vào hệ thống chấm ` +
          `trong bài làm (server=${prompt.injectionSuspected}, ` +
          `model=${parsed.injectionAttempt.detected}, lượt Advocate)`,
      );
    }

    const usage = {
      // `?? 0` khớp với Grader có chủ ý: bốn con số này là nguồn DUY NHẤT
      // cho `CalibrationRun.cost_usd`, và một `undefined` lọt qua đây sẽ
      // thành `NaN` ở phép cộng đầu tiên phía sau — một chi phí không đọc
      // được thay vì một chi phí sai, và không ai truy được về tới đây.
      inputTokens: response.usage.input_tokens ?? 0,
      outputTokens: response.usage.output_tokens,
      cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
      cacheCreationTokens: response.usage.cache_creation_input_tokens ?? 0,
    };

    return {
      isCorrect: parsed.isCorrect,
      reasoning: parsed.reasoning,
      evidence: parsed.evidence,
      suggestedVerdicts: parsed.suggestedVerdicts,
      // `null` = CHƯA KIỂM, không phải "đã kiểm và sạch". `verifyEvidence`
      // cần bài làm nguyên văn, thứ chỉ `GradingService` cầm — kiểm ở cả
      // hai chỗ là hai nguồn cho cùng một sự thật. Trả `[]` ở đây sẽ đọc
      // ra y hệt một lượt đã kiểm xong và không có mẩu nào trượt, tức nói
      // dối đúng ở chỗ nguy hiểm nhất.
      unverifiedEvidence: null,
      usage,
    };
  }
}

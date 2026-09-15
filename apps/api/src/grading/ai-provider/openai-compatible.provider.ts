import { Logger } from '@nestjs/common';
import { z } from 'zod';
import {
  AIGradingProvider,
  GradingOutcome,
  GradingRequest,
  GradingRubricCriterion,
  CriterionVerdict,
} from './ai-grading-provider';
import { SYSTEM_DELIMITER_RULE, wrapSubmission } from '../harness/submission-envelope';
import { badOutputError, httpProviderError } from './provider-failure';

/**
 * Một adapter cho MỌI endpoint nói giao thức OpenAI
 * (`POST {baseUrl}/chat/completions`).
 *
 * Hai bậc dự phòng hiện tại — qwen3.8-flash ở api.b.ai và GLM ở gateway —
 * cùng một giao thức, nên một class cấu hình bằng env phục vụ cả hai, và
 * thêm bậc thứ ba sau này là thêm ba dòng `.env` chứ không phải một file.
 *
 * VÌ SAO KHÔNG DÙNG LẠI `ClaudeGradingProvider` VỚI `baseURL` KHÁC —
 * đã thử và đã BÁC, có số đo (2026-09-15):
 *
 * api.b.ai khai `supported_endpoint_types: ["openai","anthropic"]`, và
 * `/v1/messages` kiểu Anthropic nhận hết `output_config`, `thinking:
 * adaptive`, trả usage đúng hình dạng Anthropic. Rất hấp dẫn: đổi mỗi
 * `baseURL` là xong.
 *
 * Nhưng nó NHẬN RỒI BỎ QUA. Ra prompt thù địch ("viết văn xuôi ít nhất 4
 * câu, TUYỆT ĐỐI không dùng JSON"):
 *
 *   /chat/completions + response_format strict → JSON đúng schema ✅
 *   /v1/messages      + output_config          → VĂN XUÔI        ❌
 *
 * Đi đường shim sẽ trông như chạy tốt — không lỗi, usage đúng dạng — trong
 * khi âm thầm mất guard mạnh nhất của cả thiết kế: "model không được phép
 * trả về con số nào". Schema thành đồ trang trí.
 *
 * KHÔNG dùng SDK `openai`: ta chỉ cần đúng một endpoint, và buộc phải tự
 * phân loại `error.code` nên lợi ích chính của SDK không dùng tới — trong
 * khi retry nội bộ của nó lại đá nhau với retry của BullMQ.
 */

export interface OpenAICompatibleConfig {
  /** Nhãn cho log và cho `modelUsed` — phải đủ để truy sau sáu tháng. */
  tier: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  /**
   * Trần tin cậy. Thuộc tính của PHƯƠNG PHÁP, không phải của bài làm.
   *
   * Mặc định 0.5, thấp hơn `AUTO_APPROVE_CONFIDENCE` (0.85) — nghĩa là
   * **không bài nào tự duyệt**. Có chủ ý: chưa ai đo được các model này
   * chấm tốt tới đâu, và §12 đã ghi rằng đặt model yếu ở điểm quyết định
   * sự công bằng là hướng ngược. Nâng nó lên là việc của calibration
   * (§11), không phải của một lần đoán.
   */
  ceiling: number;
}

const GraderOutputSchema = z.object({
  criterionResults: z.array(
    z.object({
      criterionId: z.string(),
      verdict: z.enum(['met', 'partially_met', 'not_met']),
      evidence: z.string(),
    }),
  ),
});

/** Cùng schema, viết cho API. `strict: true` là thứ đã ĐO được là có hiệu lực. */
function jsonSchema(): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['criterionResults'],
    properties: {
      criterionResults: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['criterionId', 'verdict', 'evidence'],
          properties: {
            criterionId: { type: 'string' },
            verdict: { type: 'string', enum: ['met', 'partially_met', 'not_met'] },
            evidence: {
              type: 'string',
              description:
                'Trích NGUYÊN VĂN từ bài làm, đúng từng chữ. Chuỗi RỖNG nếu sinh viên ' +
                'không đề cập tiêu chí này. Dẫn chứng bịa bị phát hiện bằng máy.',
            },
          },
        },
      },
    },
  };
}

/**
 * Cỡ `max_tokens` suy từ đầu vào, không phải một số cố định.
 *
 * Output là một mảng `{criterionId, verdict, evidence}`, nên nó tỉ lệ với
 * SỐ TIÊU CHÍ chứ không với độ dài bài làm. Rubric 3 tiêu chí và rubric 20
 * tiêu chí cần hai ngân sách rất khác nhau, và một con số cứng sẽ hoặc phí
 * ở ca đầu hoặc cụt ở ca sau.
 *
 * Rộng tay vì rộng tay gần như miễn phí: `max_tokens` là TRẦN, tiền trả
 * theo token thật sinh ra, và đã đo `max_tokens: 32000` không bị từ chối.
 *
 * ⚠️ CẢNH BÁO ĐO ĐƯỢC: gateway này KHÔNG tôn trọng `max_tokens` như trần
 * cứng — đặt 40 vẫn nhận về 5840 token. Nên hàm này là PHÒNG BỆNH, không
 * phải bảo đảm; thứ bắt được cắt cụt là `finish_reason === 'length'` ở
 * dưới. Phải có cả hai.
 */
export function maxTokensFor(criteria: GradingRubricCriterion[]): number {
  const BASE = 2000;
  const PER_CRITERION = 600;
  const CEILING = 16000;
  return Math.min(CEILING, BASE + criteria.length * PER_CRITERION);
}

function renderRubric(criteria: GradingRubricCriterion[]): string {
  const sorted = [...criteria].sort((a, b) => a.id.localeCompare(b.id));
  return [
    '<rubric>',
    ...sorted.map(
      (c) => `  <criterion id="${c.id}" maxPoints="${c.maxPoints}">${c.description}</criterion>`,
    ),
    '</rubric>',
  ].join('\n');
}

const SYSTEM_RULES = [
  'Bạn chấm bài thi theo rubric của giảng viên.',
  '',
  'QUY TẮC TRẢ LỜI',
  '- Với MỖI tiêu chí, đưa ra verdict: met / partially_met / not_met.',
  '- Với MỖI tiêu chí, trích NGUYÊN VĂN đoạn trong bài làm chứng minh cho',
  '  verdict đó. Trích đúng từng chữ, không diễn đạt lại, không tóm tắt.',
  '- Nếu sinh viên KHÔNG hề đề cập tiêu chí đó, để trích dẫn RỖNG. Đừng bịa',
  '  một đoạn không có trong bài — dẫn chứng bịa bị phát hiện bằng máy.',
  '',
  'KHÔNG cho điểm số. Không tính tổng. Hệ thống tự tính điểm từ verdict.',
  '',
  SYSTEM_DELIMITER_RULE,
].join('\n');

interface ChatResponse {
  choices?: { finish_reason?: string; message?: { content?: string } }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
  };
}

export class OpenAICompatibleProvider implements AIGradingProvider {
  readonly name: string;

  private readonly logger = new Logger(OpenAICompatibleProvider.name);

  constructor(private readonly config: OpenAICompatibleConfig) {
    // `modelUsed` phải đủ để một lượt calibration sáu tháng sau nói được
    // ĐÚNG model nào đã chấm dòng này — không bao giờ một nhãn thân thiện.
    this.name = config.model;
  }

  async grade(request: GradingRequest): Promise<GradingOutcome> {
    const envelope = wrapSubmission(request.content);

    // Ghi chú của giảng viên là VĂN BẢN nên đi được qua mọi provider; chỉ
    // PDF là không. Phân biệt hai thứ đó chính là chỗ `contextUsed` ở cuối
    // hàm lấy sự thật để báo cáo.
    const note = request.reference?.modelAnswerNote;

    const userContent = [
      renderRubric(request.criteria),
      note ? `<teacher_note>\n${note}\n</teacher_note>` : '<teacher_note/>',
      envelope.wrapped,
    ].join('\n\n');

    const response = await this.post({
      model: this.config.model,
      max_tokens: maxTokensFor(request.criteria),
      stream: false,
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'grading', strict: true, schema: jsonSchema() },
      },
      messages: [
        { role: 'system', content: SYSTEM_RULES },
        { role: 'user', content: userContent },
      ],
    });

    const choice = response.choices?.[0];

    // CẮT CỤT — bắt TRƯỚC khi parse, vì nếu parse trước thì một JSON cụt
    // đọc ra y hệt một JSON hỏng, và hai thứ đó cần hai cách xử lý khác
    // nhau (thử lại cùng bậc vs. nghi ngờ cả bậc).
    if (choice?.finish_reason === 'length') {
      throw badOutputError(
        `${this.config.tier}: output bị cắt cụt (finish_reason=length) — ngân sách token không đủ`,
      );
    }

    const text = choice?.message?.content;
    if (!text) {
      throw badOutputError(`${this.config.tier}: model không trả về nội dung nào`);
    }

    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      // KHÔNG nêu nội dung trả về: nó chứa dẫn chứng trích từ bài làm của
      // sinh viên, và message này đi vào `failedReason` trong Redis.
      throw badOutputError(`${this.config.tier}: output không phải JSON hợp lệ`);
    }

    const validation = GraderOutputSchema.safeParse(raw);
    if (!validation.success) {
      const paths = validation.error.issues.map((i) => i.path.join('.')).join(', ');
      throw badOutputError(`${this.config.tier}: output không khớp schema ở: ${paths}`);
    }

    if (envelope.injectionSuspected) {
      this.logger.warn(
        `submission ${request.studentMssv}: nghi ngờ có câu lệnh nhắm vào hệ thống chấm ` +
          `trong bài làm (phát hiện ở server, tầng ${this.config.tier})`,
      );
    }

    const usage = response.usage ?? {};
    return {
      modelUsed: this.config.model,
      criterionResults: validation.data.criterionResults.map((row) => ({
        criterionId: row.criterionId,
        verdict: row.verdict as CriterionVerdict,
        // `points` để 0 — `enforceScoring` tính lại toàn bộ từ `verdict`.
        points: 0,
        evidence: row.evidence,
      })),
      totalScore: 0,
      confidenceCeiling: this.config.ceiling,
      usage: {
        inputTokens: usage.prompt_tokens ?? 0,
        outputTokens: usage.completion_tokens ?? 0,
        // Endpoint này báo cache ở `prompt_tokens_details.cached_tokens`.
        // Đo được hiện tại là 0 — không có prompt caching — nhưng đọc nó
        // vẫn đúng hơn là ghi cứng 0 và không bao giờ biết khi nào có.
        cacheReadTokens: usage.prompt_tokens_details?.cached_tokens ?? 0,
        cacheCreationTokens: 0,
      },
      // SỰ THẬT, không phải cấu hình: giao thức này không gửi được PDF, nên
      // dù giảng viên đã upload đề bài thì lượt chấm NÀY vẫn không thấy nó.
      contextUsed: { question: false, modelAnswer: Boolean(note) },
    };
  }

  private async post(body: unknown): Promise<ChatResponse> {
    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      // Trần riêng, thấp hơn trần 120s của job: một bậc treo phải nhả chỗ
      // cho bậc sau thử, chứ không ăn hết ngân sách thời gian của cả bài.
      signal: AbortSignal.timeout(90_000),
    });

    const text = await response.text();
    if (!response.ok) {
      // Lấy `code` nếu có — đó là thứ `classifyProviderFailure` cần để
      // phân biệt "hết quota" (bậc chết) với "nghẽn tạm" (retry).
      let code: string | undefined;
      let message = `HTTP ${response.status}`;
      try {
        const parsed = JSON.parse(text) as { error?: { code?: string; message?: string } };
        code = parsed.error?.code;
        // Message của nhà cung cấp về TRẠNG THÁI TÀI KHOẢN, không phải về
        // bài làm — nên giữ lại được, và nó là thứ duy nhất nhận diện được
        // ca hết credit của Anthropic.
        if (parsed.error?.message) {
          message = `HTTP ${response.status} ${parsed.error.message}`;
        }
      } catch {
        // Body không phải JSON: giữ nguyên message chỉ có mã HTTP. KHÔNG
        // ghép `text` vào — với 4xx nó có thể là request của chính ta dội
        // lại, tức chứa bài làm của sinh viên.
      }
      throw httpProviderError(response.status, code, `${this.config.tier}: ${message}`);
    }

    try {
      return JSON.parse(text) as ChatResponse;
    } catch {
      throw badOutputError(`${this.config.tier}: body 200 nhưng không phải JSON`);
    }
  }
}

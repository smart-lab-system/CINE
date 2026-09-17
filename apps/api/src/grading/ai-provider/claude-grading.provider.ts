import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import {
  AIGradingProvider,
  CriterionVerdict,
  GradingOutcome,
  GradingRequest,
} from './ai-grading-provider';
import { buildGraderPrompt } from './grader-prompt';
import { badOutputError } from './provider-failure';

/**
 * Model dùng để chấm. Một chỗ, để calibration biết chính xác cái gì đã chấm.
 *
 * CÙNG MỘT model cho CẢ Grader lẫn Advocate (Plan 2), không cascade sang
 * model rẻ hơn — tên model cụ thể đổi theo thời gian (xem comment dưới),
 * quyết định "cùng một model" thì không. Ba lý do, ghi ở spec §2.1: cache
 * khoá theo model nên cascade phải
 * ghi tiền tố hai lần ở hai namespace; adaptive thinking ĐÃ LÀ cascade làm
 * bên trong với đầy đủ thông tin; và đặt model yếu nhất ở đúng điểm quyết
 * định sự công bằng là ngược — nó bỏ sót thì bài bị chấm theo rubric, điểm
 * thấp, và KHÔNG AI BIẾT.
 */
// Đổi từ `claude-opus-5` ngày 2026-09-17: khoá của gateway đang khai
// trong `.env` KHÔNG đăng ký opus-5 (đo được: 403 "Please subscribe to
// model in the API Key: claude-opus-5"), nên tầng Claude chết ở mọi bài.
// `claude-sonnet-4-6` là model Claude mà khoá này dùng được, và đã đo là
// nuốt trọn hình dạng tham số ở đây (adaptive thinking + effort cao).
//
// Gateway có thể tự định tuyến sang model khác — `modelUsed` vì thế đọc
// `response.model`, không đọc hằng số này.
export const GRADER_MODEL = 'claude-sonnet-4-6';

/**
 * Schema output. KHÔNG có `points`, KHÔNG có `totalScore`, KHÔNG có
 * `confidence` — model phán đoán, code đếm.
 *
 * Đây là guard mạnh nhất trong cả thiết kế, và nó mạnh vì nó XOÁ CƠ HỘI
 * SAI chứ không phải vì nó kiểm tra sau khi sai: model không thể trả về
 * một con số lệch với verdict nếu nó không được phép trả về con số nào.
 */
const GraderOutputSchema = z.object({
  criterionResults: z.array(
    z.object({
      criterionId: z.string(),
      verdict: z.enum(['met', 'partially_met', 'not_met']),
      evidence: z.string(),
    }),
  ),
  uncoveredContent: z.array(z.string()),
  injectionAttempt: z.object({
    detected: z.boolean(),
    quote: z.string().optional(),
  }),
});

/**
 * Cùng một schema, viết cho API.
 *
 * Viết tay thay vì sinh từ zod: helper `zodOutputFormat` của SDK yêu cầu
 * zod v4, còn repo này dùng v3 ở cả `apps/web` (React Hook Form + Zod
 * resolver). Nâng zod cho một provider là kéo cả frontend vào một cuộc di
 * trú không ai yêu cầu.
 *
 * Hai bản phải khớp nhau, và `GraderOutputSchema.parse()` ở dưới là thứ
 * bắt được lúc chúng lệch: API trả về thứ khớp schema này, zod từ chối
 * nó, và ta biết ngay ở lượt chấm đầu tiên.
 *
 * `additionalProperties: false` + `required` đầy đủ: không có chúng thì
 * model được phép bỏ trường, và một `criterionResults` thiếu sẽ đọc ra
 * như một bài không có tiêu chí nào.
 */
const GRADER_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['criterionResults', 'uncoveredContent', 'injectionAttempt'],
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
    uncoveredContent: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Đoạn trong bài làm không thuộc tiêu chí nào — nơi ghi nhận một em trả lời ' +
        'đúng theo hướng rubric không lường trước.',
    },
    injectionAttempt: {
      type: 'object',
      additionalProperties: false,
      required: ['detected'],
      properties: {
        detected: { type: 'boolean' },
        quote: { type: 'string' },
      },
    },
  },
};

@Injectable()
export class ClaudeGradingProvider implements AIGradingProvider {
  readonly name = GRADER_MODEL;

  private readonly logger = new Logger(ClaudeGradingProvider.name);
  private readonly client = new Anthropic();

  // KHÔNG có trạng thái nào ở đây. Provider là singleton và worker chạy
  // năm job song song — mọi trường mutable trên nó là một cuộc đua chờ
  // xảy ra. Tài liệu tham chiếu đi theo `request.reference`.

  async grade(request: GradingRequest): Promise<GradingOutcome> {
    const prompt = buildGraderPrompt({
      criteria: request.criteria,
      studentText: request.content,
      anchors: request.anchors,
      ...(request.reference ?? {}),
    });

    const response = await this.client.messages.create({
      model: GRADER_MODEL,
      max_tokens: 16000,
      // Adaptive thinking: model TỰ quyết định nghĩ sâu bao nhiêu cho từng
      // bài — bài tầm thường trả lời nhanh, bài lệch rubric nghĩ lâu hơn.
      // Đây chính là "cascade" mà ta đã bác ở tầng kiến trúc, nhưng làm
      // BÊN TRONG model với đầy đủ thông tin thay vì bên ngoài bằng một
      // model yếu hơn.
      //
      // KHÔNG `budget_tokens`: Opus 5 trả 400 cho tham số đó.
      thinking: { type: 'adaptive' },
      output_config: {
        effort: 'high',
        format: { type: 'json_schema', schema: GRADER_JSON_SCHEMA },
      },
      system: prompt.system as Anthropic.TextBlockParam[],
      messages: [{ role: 'user', content: prompt.userContent as Anthropic.ContentBlockParam[] }],
    });

    // `stop_reason: 'refusal'` là HTTP 200 — phải kiểm TRƯỚC khi đọc nội
    // dung. Không kiểm thì một lượt từ chối đọc ra như một bài chấm rỗng,
    // và sinh viên nhận 0 điểm vì model không chịu trả lời.
    if (response.stop_reason === 'refusal') {
      const detail = response.stop_details;
      // `badOutputError` chứ không phải Error tự dựng: cờ `badOutput` là
      // thứ `classifyProviderFailure` đọc ĐẦU TIÊN. Thiếu nó thì một lượt
      // từ chối bị xếp là `transient`, chuỗi dự phòng ném thẳng ra ngoài,
      // và `isPermanentFailure(422)` ở processor giết luôn job — bài chết
      // dù bậc dưới hoàn toàn chấm được nó. Xem `provider-failure.ts`.
      throw badOutputError(
        `Model từ chối chấm bài này (${detail?.type ?? 'không rõ'}) — cần người xem`,
      );
    }

    // Validate ở PHÍA MÌNH, không tin `output_config.format` là đủ.
    //
    // API ràng buộc hình dạng, nhưng schema JSON và `GraderOutputSchema`
    // là hai bản viết tay phải khớp nhau — và đây là chỗ bắt được lúc
    // chúng lệch. Một trường bị đổi tên ở một bản mà quên bản kia sẽ nổ
    // ngay ở lượt chấm đầu tiên, không phải âm thầm cho ra bài chấm rỗng.
    const text = response.content.find(
      (block): block is Anthropic.TextBlock => block.type === 'text',
    );
    if (!text) {
      throw badOutputError('Model không trả về khối text nào');
    }

    // `JSON.parse` phải có lưới của riêng nó, không gộp vào safeParse.
    //
    // ĐO THẬT 2026-09-17: một gateway Anthropic nhận
    // `output_config.format = json_schema` nhưng KHÔNG thực thi nó, và
    // model trả về Markdown. `JSON.parse` ném `SyntaxError` thô — không
    // `status`, không `code`, không cờ `badOutput` — nên
    // `classifyProviderFailure` xếp nó là `transient`, `TierChain` NÉM RA,
    // và bậc sàn ngay bên dưới không bao giờ được gọi. Bài nộp bị bỏ rơi
    // sau 3 lượt retry, đúng như ca `ENOTFOUND` ở tầng 2.
    //
    // Một bậc trả về thứ không parse nổi là BẬC ĐÓ TRẢ RÁC: rơi bậc mới
    // là hướng đúng, không phải gọi lại cùng bậc ba lần rồi bỏ bài.
    let payload: unknown;
    try {
      payload = JSON.parse(text.text);
    } catch {
      // KHÔNG nêu nội dung trả về: nó chứa bài làm của sinh viên, và
      // message này đi vào `failedReason` trong Redis.
      throw badOutputError('Model trả về text không phải JSON');
    }

    const validation = GraderOutputSchema.safeParse(payload);
    if (!validation.success) {
      // KHÔNG nêu nội dung trả về trong message: nó chứa dẫn chứng trích
      // từ bài làm của sinh viên, và message này đi vào `failedReason`
      // trong Redis. Chỉ nêu đường dẫn tới trường sai.
      const paths = validation.error.issues.map((i) => i.path.join('.')).join(', ');
      throw badOutputError(`Output của model không khớp schema ở: ${paths}`);
    }
    const parsed = validation.data;

    if (prompt.injectionSuspected || parsed.injectionAttempt.detected) {
      // Hai nguồn, cố ý: phát hiện cơ học ở server (`prompt.injectionSuspected`)
      // và báo cáo của model. Nguồn thứ nhất không phụ thuộc vào việc model
      // có chịu tố giác một cuộc tấn công nhắm vào chính nó hay không.
      this.logger.warn(
        `submission ${request.studentMssv}: nghi ngờ có câu lệnh nhắm vào hệ thống chấm ` +
          `trong bài làm (server=${prompt.injectionSuspected}, ` +
          `model=${parsed.injectionAttempt.detected})`,
      );
    }

    return {
      // Model ĐÃ TRẢ LỜI, không phải model đã xin.
      //
      // Đo thật 2026-09-17: gateway trong `.env` nhận yêu cầu
      // `claude-sonnet-4-6` rồi trả về `model: "claude-sonnet-5"` — nó tự
      // định tuyến. Ghi hằng số ở đây sẽ làm `grading_result.model_used`
      // khai một model chưa hề chấm bài nào, và cả module calibration
      // (§11) đo AI-vs-người đều dựng trên đúng cột đó.
      //
      // `??` chứ không `||`: một gateway trả chuỗi rỗng là bất thường và
      // phải lộ ra như chuỗi rỗng, không được lặng lẽ hoá thành tên model
      // ta tự nghĩ ra.
      modelUsed: response.model ?? GRADER_MODEL,
      // `points` để 0 — `enforceScoring` ở `GradingService` tính lại toàn
      // bộ từ `verdict`. Model chưa bao giờ nhìn thấy trường này.
      criterionResults: parsed.criterionResults.map((row) => ({
        criterionId: row.criterionId,
        verdict: row.verdict as CriterionVerdict,
        points: 0,
        evidence: row.evidence,
      })),
      totalScore: 0,
      // 1 = không tự hạ trần. Đây KHÔNG phải tự khai độ tin cậy về bài
      // này — nó nói rằng cơ chế (model mạnh đọc hiểu + trích dẫn nguyên
      // văn) có thể biện minh cho một điểm số tự duyệt, NẾU các phép đo cơ
      // học của `applyGuards` đồng ý. Con số cuối vẫn do guard quyết.
      confidenceCeiling: 1,
      // Bậc DUY NHẤT đọc được PDF. Báo đúng những gì lượt này thật sự
      // nhận, không phải những gì giảng viên đã upload: nếu `reference`
      // rỗng thì lượt chấm chạy ở mức "chỉ có rubric" dù phiên có đủ
      // tài liệu, và `grading-readiness` không được phép nói ngược lại.
      contextUsed: {
        question: Boolean(request.reference?.questionPdf),
        modelAnswer: Boolean(
          request.reference?.modelAnswerPdf || request.reference?.modelAnswerNote,
        ),
      },
      usage: {
        inputTokens: response.usage.input_tokens ?? 0,
        outputTokens: response.usage.output_tokens,
        cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
        cacheCreationTokens: response.usage.cache_creation_input_tokens ?? 0,
      },
    };
  }
}

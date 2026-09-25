import { badOutputError, httpProviderError } from './provider-failure';

/**
 * Lời gọi `POST {baseUrl}/chat/completions` với structured output.
 *
 * Dùng chung cho Grader và Advocate. Tách ra vì phần xử lý lỗi ở đây
 * NHẠY CẢM — nó quyết định cái gì lọt vào `failedReason` trong Redis, và
 * `failedReason` là nơi bài làm của sinh viên có thể rò ra. Hai bản sao
 * của đoạn này là hai chỗ để một bản được vá còn bản kia thì không.
 *
 * KHÔNG dùng SDK `openai`: ta chỉ cần đúng một endpoint, và buộc phải tự
 * phân loại `error.code` nên lợi ích chính của SDK không dùng tới — trong
 * khi retry nội bộ của nó lại đá nhau với retry của BullMQ.
 */

export interface OpenAITierConfig {
  /** Nhãn cho log và message lỗi — phải đủ để truy sau sáu tháng. */
  tier: string;
  baseUrl: string;
  model: string;
  apiKey: string;
}

export interface ChatUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

interface ChatResponse {
  choices?: { finish_reason?: string; message?: { content?: string } }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
  };
}

export interface ChatJsonRequest {
  system: string;
  user: string;
  schemaName: string;
  schema: Record<string, unknown>;
  maxTokens: number;
  /**
   * Trần thời gian cho MỘT lời gọi. Mặc định 90s.
   *
   * Phải thấp hơn trần của job để một bậc treo còn nhả chỗ cho bậc sau
   * thử — nhưng KHÔNG được thấp hơn thời gian thật của model. Đo
   * 2026-09-15 trên qwen3.8-flash: chấm ~46s, phản biện ~61s cho một bài
   * ngắn, nên lượt phản biện cần trần rộng hơn lượt chấm.
   */
  timeoutMs?: number;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatCall {
  messages: ChatMessage[];
  schemaName: string;
  schema: Record<string, unknown>;
  maxTokens: number;
  timeoutMs?: number;
}

/**
 * Phần DÙNG CHUNG của mọi lời gọi: gửi, phân loại lỗi, bắt cắt cụt. Một bản duy nhất —
 * xem ghi chú đầu file về vì sao hai bản sao của đoạn này là nguy hiểm.
 */
async function postChat(
  config: OpenAITierConfig,
  call: ChatCall,
): Promise<{ content: string; usage: ChatUsage }> {
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: call.maxTokens,
      stream: false,
      response_format: {
        type: 'json_schema',
        json_schema: { name: call.schemaName, strict: true, schema: call.schema },
      },
      messages: call.messages,
    }),
    signal: AbortSignal.timeout(call.timeoutMs ?? 90_000),
  });

  const text = await response.text();

  if (!response.ok) {
    // Lấy `code` nếu có — đó là thứ `classifyProviderFailure` cần để phân
    // biệt "hết quota" (bậc chết) với "nghẽn tạm" (retry).
    let code: string | undefined;
    let message = `HTTP ${response.status}`;
    try {
      const parsed = JSON.parse(text) as { error?: { code?: string; message?: string } };
      code = parsed.error?.code;
      // Message của nhà cung cấp thường nói về TRẠNG THÁI TÀI KHOẢN chứ
      // không về bài làm, và nó là thứ duy nhất nhận diện được ca hết
      // credit của Anthropic — nên giữ lại.
      //
      // Nhưng đó là một giả định về HÀNH VI CỦA NGƯỜI KHÁC: một nhà cung
      // cấp dội lại nội dung request trong body 4xx sẽ biến dòng này
      // thành đường rò bài làm vào `failedReason` ở Redis. Cắt 200 ký tự
      // giữ đủ để chẩn đoán mà không đủ để rò một bài luận.
      if (parsed.error?.message) {
        message = `HTTP ${response.status} ${parsed.error.message.slice(0, 200)}`;
      }
    } catch {
      // Body không phải JSON: giữ nguyên message chỉ có mã HTTP. KHÔNG
      // ghép `text` vào — với 4xx nó có thể là request của chính ta dội
      // lại, tức chứa bài làm của sinh viên.
    }
    throw httpProviderError(response.status, code, `${config.tier}: ${message}`);
  }

  let parsed: ChatResponse;
  try {
    parsed = JSON.parse(text) as ChatResponse;
  } catch {
    throw badOutputError(`${config.tier}: body 200 nhưng không phải JSON`);
  }

  const choice = parsed.choices?.[0];

  // CẮT CỤT — bắt TRƯỚC khi parse nội dung, vì nếu parse trước thì một
  // JSON cụt đọc ra y hệt một JSON hỏng, và hai thứ đó cần hai cách xử lý
  // khác nhau (thử lại cùng bậc vs. nghi ngờ cả bậc).
  if (choice?.finish_reason === 'length') {
    throw badOutputError(
      `${config.tier}: output bị cắt cụt (finish_reason=length) — ngân sách token không đủ`,
    );
  }

  const content = choice?.message?.content;
  if (!content) {
    throw badOutputError(`${config.tier}: model không trả về nội dung nào`);
  }

  const usage = parsed.usage ?? {};
  return {
    content,
    usage: {
      inputTokens: usage.prompt_tokens ?? 0,
      outputTokens: usage.completion_tokens ?? 0,
      // Endpoint này báo cache ở `prompt_tokens_details.cached_tokens`.
      // Đo được hiện tại là 0 — không có prompt caching — nhưng đọc nó
      // vẫn đúng hơn là ghi cứng 0 và không bao giờ biết khi nào có.
      cacheReadTokens: usage.prompt_tokens_details?.cached_tokens ?? 0,
      cacheCreationTokens: 0,
    },
  };
}

/**
 * Gọi và trả về JSON đã parse (CHƯA validate) + usage.
 *
 * Validate bằng zod là việc của người gọi: mỗi agent có schema riêng, và
 * đây là chỗ duy nhất bắt được lúc schema JSON và schema zod lệch nhau.
 */
export async function postChatJson(
  config: OpenAITierConfig,
  request: ChatJsonRequest,
): Promise<{ raw: unknown; usage: ChatUsage }> {
  const { content, usage } = await postChat(config, {
    messages: [
      { role: 'system', content: request.system },
      { role: 'user', content: request.user },
    ],
    schemaName: request.schemaName,
    schema: request.schema,
    maxTokens: request.maxTokens,
    timeoutMs: request.timeoutMs,
  });

  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    // KHÔNG nêu nội dung trả về: nó chứa dẫn chứng trích từ bài làm của
    // sinh viên, và message này đi vào `failedReason` trong Redis.
    throw badOutputError(`${config.tier}: output không phải JSON hợp lệ`);
  }
  return { raw, usage };
}

export interface ChatTextRequest {
  system: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  schemaName: string;
  schema: Record<string, unknown>;
  maxTokens: number;
  timeoutMs?: number;
}

/**
 * Nhiều lượt, trả VĂN BẢN THÔ. Vòng điều tra tự đọc bằng `readSingleJson`: nó phải cắt
 * thẻ suy luận và từ chối nhiều phán quyết (§5.2) — `JSON.parse` thẳng làm sai cả hai việc
 * đó.
 */
export async function postChatText(
  config: OpenAITierConfig,
  request: ChatTextRequest,
): Promise<{ content: string; usage: ChatUsage }> {
  return postChat(config, {
    messages: [{ role: 'system', content: request.system }, ...request.messages],
    schemaName: request.schemaName,
    schema: request.schema,
    maxTokens: request.maxTokens,
    timeoutMs: request.timeoutMs,
  });
}

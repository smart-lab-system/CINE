/**
 * Một lời gọi model hỏng thuộc loại nào — và AI ĐỠ nó.
 *
 * File LEAF, không import gì. Nó được `fallback-grading.provider.ts` và cả
 * ba provider dùng, và CLAUDE.md có nguyên tắc riêng về hằng số dùng chung
 * nằm trong vòng import.
 *
 * VÌ SAO MÃ HTTP KHÔNG ĐỦ. Đo thật ngày 2026-09-15, bốn nhà cung cấp báo
 * cùng một chuyện "tôi không phục vụ được" bằng bốn mã khác nhau:
 *
 *   429 ALL_ACCOUNTS_UNAVAILABLE   tokenrouter qua gateway  — hết tài khoản
 *   503 model_not_found            tokenrouter gọi thẳng    — không có kênh
 *   400 insufficient_user_quota    api.b.ai                 — hết quota
 *   403 access_denied              api.b.ai                 — chưa nạp tiền
 *   400 (credit balance too low)   Anthropic                — hết credit
 *
 * Chỉ đọc mã HTTP thì 429 và 503 bị coi là tạm thời (retry 3 lượt rồi mới
 * chịu thua), còn 400 bị coi là án tử (không bao giờ rơi bậc). Cả hai đều
 * sai. Nên phân loại đọc `code` trước, `status` sau.
 */

export type ProviderFailureKind =
  /**
   * Trục trặc thoáng qua. NÉM RA cho BullMQ retry CÙNG một bậc — đừng rơi
   * bậc, vì bậc trên vẫn khoẻ và bậc dưới thì yếu hơn.
   */
  | 'transient'
  /**
   * Bậc này chết. Mở circuit breaker và sang bậc sau NGAY, không retry:
   * gọi lại một tài khoản hết tiền 3 lần chỉ để nhận cùng một câu trả lời.
   */
  | 'tier_dead'
  /**
   * Gọi được, trả về rác: JSON cụt (`finish_reason: 'length'`), sai schema,
   * hoặc model từ chối. Thử lại CÙNG bậc đúng một lần — cắt cụt thường là
   * ngẫu nhiên — rồi mới sang bậc sau.
   */
  | 'bad_output';

/**
 * Mã lỗi nghĩa là "bậc này không phục vụ được", bất kể mã HTTP là gì.
 *
 * So khớp không phân biệt hoa thường: cùng một ý mà tokenrouter viết HOA
 * (`ALL_ACCOUNTS_UNAVAILABLE`) còn api.b.ai viết thường (`access_denied`).
 */
const DEAD_CODES = new Set([
  'all_accounts_unavailable',
  'model_not_found',
  'insufficient_user_quota',
  'insufficient_quota',
  'access_denied',
  'invalid_api_key',
  'account_deactivated',
  'billing_hard_limit_reached',
]);

/**
 * Anthropic báo hết credit bằng `type: 'invalid_request_error'` + một câu
 * tiếng Anh, KHÔNG có mã riêng — nên chỗ này buộc phải so chuỗi.
 *
 * So chuỗi là cách nhận diện tồi và tôi không thích nó: nhà cung cấp đổi
 * câu chữ là nó im lặng hỏng. Nhưng thay thế duy nhất là coi MỌI 400 là
 * bậc chết, và thế thì một lỗi lập trình của chính ta (gửi tham số sai)
 * sẽ lặng lẽ đẩy cả lượt chấm xuống model yếu hơn thay vì nổ ra để sửa.
 * So chuỗi hẹp, hỏng lộ liễu, còn hơn bắt rộng, hỏng âm thầm.
 *
 * Chuỗi ĐO ĐƯỢC ngày 2026-09-15, giữ nguyên văn để lần sau grep ra được
 * chỗ này khi Anthropic đổi câu chữ:
 *   "Your credit balance is too low to access the Anthropic API.
 *    Please go to Plans & Billing to upgrade or purchase credits."
 */
const CREDIT_MESSAGE = /credit balance is too low|insufficient (credit|balance|funds)/i;

/**
 * Mã ở tầng KẾT NỐI: chưa bao giờ mở nổi một kênh tới bậc đó.
 *
 * ĐO THẬT 2026-09-17. Tầng 2 khai một hostname Tailscale; máy chấm
 * không nối vào tailnet đó nên `fetch` ném:
 *
 *   TypeError: fetch failed
 *     cause: Error { code: ENOTFOUND, message: getaddrinfo ENOTFOUND ... }
 *
 * Trước khi có bảng này, ca đó rơi xuống nhánh mặc định `transient`,
 * `TierChain` NÉM RA, và bậc Claude lẫn bậc SÀN ngay bên dưới không bao
 * giờ được gọi. Một bài nộp thật đã bị bỏ rơi đúng như vậy: hết 3 lượt
 * retry, `markUngradable`, `grading_result` không có model nào. Lời hứa
 * "sàn không bao giờ vắng mặt" ở `grading.module.ts` bị chính nhánh
 * `transient` phá vỡ.
 *
 * `tier_dead` chứ không `transient`, vì hệ quả mới là thứ quyết định:
 * lượt retry kế tiếp cũng sẽ không phân giải nổi cái tên đó, trong khi
 * bậc dưới thì chấm được ngay. Và `tier_dead` KHÔNG phải án tử — breaker
 * vẫn cho bậc này một lượt thăm dò sau `BREAKER_COOLDOWN_MS`.
 *
 * CHỈ những mã "chưa từng nối được". `ETIMEDOUT`/`ECONNRESET` ở lại
 * `transient` có chủ ý: chúng nghĩa là kênh ĐÃ mở rồi mới đứt, tức bậc
 * đó có thật và đang sống — đúng ca mà retry cùng bậc là hướng đúng.
 */
const UNREACHABLE_CODES = new Set(['enotfound', 'econnrefused', 'eai_again']);

/**
 * Lần theo chuỗi `cause` tìm mã kết nối.
 *
 * Bắt buộc phải đi sâu: `fetch` của Node trả `TypeError: fetch failed`
 * với `code` KHÔNG xác định ở tầng ngoài, mã thật nằm trong `cause`. Đọc
 * mỗi tầng ngoài là lý do lỗi này lọt lưới suốt.
 *
 * Chặn ở 5 tầng: một chuỗi `cause` tự trỏ vòng lại sẽ treo vòng lặp, và
 * một hàm phân loại lỗi treo thì giết luôn worker chấm.
 */
function isUnreachable(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; current && depth < 5; depth++) {
    const code = (current as ErrorShape).code;
    if (typeof code === 'string' && UNREACHABLE_CODES.has(code.toLowerCase())) {
      return true;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

interface ErrorShape {
  status?: unknown;
  code?: unknown;
  type?: unknown;
  message?: unknown;
  badOutput?: unknown;
}

export function classifyProviderFailure(error: unknown): ProviderFailureKind {
  const e = (error ?? {}) as ErrorShape;

  // Cờ do CHÍNH ta đặt thắng mọi suy đoán: provider biết rõ nó vừa nhận
  // rác hơn bất cứ phép đoán nào từ mã HTTP.
  if (e.badOutput === true) {
    return 'bad_output';
  }

  const code = typeof e.code === 'string' ? e.code.toLowerCase() : '';
  if (code && DEAD_CODES.has(code)) {
    return 'tier_dead';
  }

  // Sau DEAD_CODES vì cùng một kết luận, nhưng đọc `cause` chứ không
  // đọc mỗi tầng ngoài.
  if (isUnreachable(error)) {
    return 'tier_dead';
  }

  const status = typeof e.status === 'number' ? e.status : undefined;
  const message = typeof e.message === 'string' ? e.message : '';

  // 401/403 là "khoá này không dùng được" — không bao giờ tự khỏi.
  if (status === 401 || status === 403 || status === 404) {
    return 'tier_dead';
  }
  if (status === 400 && CREDIT_MESSAGE.test(message)) {
    return 'tier_dead';
  }

  // Mọi thứ còn lại — 429 không kèm mã chết, 5xx, timeout, đứt mạng —
  // là tạm thời. Đây là mặc định ĐÚNG: đoán nhầm thành tạm thời chỉ tốn
  // vài lượt retry, còn đoán nhầm thành chết sẽ bỏ phí một bậc đang khoẻ.
  return 'transient';
}

/** Lỗi "gọi được nhưng trả về rác". Đánh dấu để phân loại khỏi phải đoán. */
export function badOutputError(message: string): Error {
  const error = new Error(message) as Error & { badOutput: boolean; status: number };
  error.badOutput = true;
  // Giữ 422 cho tương thích với `describeError`/`isPermanentFailure` đang
  // đọc `status` ở `grading.processor.ts`.
  error.status = 422;
  return error;
}

/** Lỗi từ HTTP của một endpoint tương thích OpenAI, giữ đủ thứ để phân loại. */
export function httpProviderError(
  status: number,
  code: string | undefined,
  message: string,
): Error {
  const error = new Error(message) as Error & { status: number; code?: string };
  error.status = status;
  if (code) {
    error.code = code;
  }
  return error;
}

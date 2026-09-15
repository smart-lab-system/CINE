import { Logger } from '@nestjs/common';
import { AIGradingProvider, GradingOutcome, GradingRequest } from './ai-grading-provider';
import { classifyProviderFailure } from './provider-failure';

/**
 * Chuỗi provider có thứ tự: bậc trên chết thì bậc dưới nhận.
 *
 * Nó TỰ NÓ là một `AIGradingProvider`, nên `GradingService` không biết có
 * chuyện gì xảy ra — đúng lý do cái seam đó tồn tại. Mọi thứ quan trọng
 * vẫn đi ra ngoài đúng đường cũ: `modelUsed` là của bậc đã trả lời (không
 * phải của chuỗi), `confidenceCeiling` là trần của bậc đó, `contextUsed`
 * là ngữ cảnh bậc đó thật sự đọc được.
 *
 * RANH GIỚI VỚI RETRY CỦA BULLMQ — thứ dễ làm sai nhất ở đây.
 *
 * Job đã có 3 lượt retry với backoff mũ. Nếu chuỗi này cũng retry thì một
 * bài = 3 lượt × 4 bậc = 12 lời gọi, và không ai đọc log ra được vì sao.
 * Nên phân vai dứt khoát:
 *
 *   chuỗi này   ← lo "BẬC NÀY CHẾT"      (mở breaker, sang bậc sau)
 *   BullMQ      ← lo "TRỤC TRẶC TẠM THỜI" (ném ra, retry cùng bậc)
 *
 * Lỗi `transient` được NÉM RA NGOÀI, cố ý: bậc trên vẫn khoẻ, và đẩy bài
 * xuống model yếu hơn chỉ vì một cú 503 thoáng qua là tự hạ chất lượng
 * chấm mà không có lý do.
 */

/** Bậc chết rồi thì ngủ bao lâu trước khi thử lại. */
const BREAKER_COOLDOWN_MS = 60_000;

interface Tier {
  provider: AIGradingProvider;
  /** Nhãn đọc được trong log — `provider.name` là id model, không đủ ngữ cảnh. */
  label: string;
  openedAt?: number;
  reason?: string;
}

export class FallbackGradingProvider implements AIGradingProvider {
  readonly name: string;

  private readonly logger = new Logger(FallbackGradingProvider.name);
  private readonly tiers: Tier[];

  constructor(tiers: { provider: AIGradingProvider; label: string }[]) {
    if (tiers.length === 0) {
      // Không bao giờ được xảy ra: bậc sàn (keyword) luôn có mặt. Nổ ngay
      // lúc khởi động còn hơn nổ ở bài đầu tiên của một buổi thi.
      throw new Error('FallbackGradingProvider cần ít nhất một bậc');
    }
    this.tiers = tiers.map((t) => ({ ...t }));
    this.name = `fallback(${tiers.map((t) => t.provider.name).join(' → ')})`;
  }

  async grade(request: GradingRequest): Promise<GradingOutcome> {
    const now = Date.now();
    let lastError: unknown;
    let tried = 0;

    for (const tier of this.tiers) {
      if (this.isBreakerOpen(tier, now)) {
        continue;
      }
      tried++;

      try {
        return await this.gradeWithRetryOnBadOutput(tier, request);
      } catch (error) {
        const kind = classifyProviderFailure(error);

        if (kind === 'transient') {
          // Ra khỏi chuỗi luôn — BullMQ lo. Xem ghi chú ranh giới ở đầu file.
          throw error;
        }

        lastError = error;
        if (kind === 'tier_dead') {
          this.openBreaker(tier, error, now);
        } else {
          // `bad_output` sau khi đã thử lại một lần: bậc này gọi được
          // nhưng không trả nổi thứ dùng được. KHÔNG mở breaker — nó có
          // thể chỉ hỏng với riêng bài này (bài quá dài, ký tự lạ), và
          // đóng cả bậc vì một bài là phản ứng thái quá.
          this.logger.warn(
            `${tier.label}: trả về output không dùng được, sang bậc sau — ${describe(error)}`,
          );
        }
      }
    }

    // Hết bậc. Ném lỗi CUỐI CÙNG chứ không dựng một lỗi mới: lỗi cuối là
    // của bậc sàn, và nó mang thông tin thật về vì sao ngay cả sàn cũng
    // không đỡ được.
    this.logger.error(
      `mọi bậc đều không chấm được (thử ${tried}/${this.tiers.length}) — ${describe(lastError)}`,
    );
    throw lastError ?? new Error('Không còn bậc nào khả dụng để chấm');
  }

  /**
   * Thử lại ĐÚNG MỘT LẦN khi output hỏng, rồi mới nhường bậc sau.
   *
   * Vì sao một lần: cắt cụt và lệch schema phần lớn là NGẪU NHIÊN — cùng
   * một prompt gọi lại thường ra kết quả dùng được. Nhưng nếu bậc đó không
   * bao giờ trả đúng schema thì retry vô hạn chỉ đốt tiền, nên sau một lần
   * là đi tiếp. Cùng logic "chấm lại đúng một lần" mà §6.4 đã dùng cho ca
   * dẫn chứng không định vị được.
   */
  private async gradeWithRetryOnBadOutput(
    tier: Tier,
    request: GradingRequest,
  ): Promise<GradingOutcome> {
    try {
      return await tier.provider.grade(request);
    } catch (error) {
      if (classifyProviderFailure(error) !== 'bad_output') {
        throw error;
      }
      this.logger.warn(`${tier.label}: output hỏng, thử lại một lần — ${describe(error)}`);
      return await tier.provider.grade(request);
    }
  }

  private isBreakerOpen(tier: Tier, now: number): boolean {
    if (tier.openedAt === undefined) {
      return false;
    }
    if (now - tier.openedAt < BREAKER_COOLDOWN_MS) {
      return true;
    }
    // Hết hạn nguội: đóng breaker để bài này THỬ LẠI bậc đó. Một lượt 40
    // bài kéo dài nhiều phút, và một nhà cung cấp hồi sinh giữa chừng phải
    // được dùng lại — nếu không thì cả phiên bị khoá xuống model yếu chỉ
    // vì một sự cố ở phút đầu.
    this.logger.log(`${tier.label}: hết hạn nguội, thử lại bậc này`);
    tier.openedAt = undefined;
    tier.reason = undefined;
    return false;
  }

  private openBreaker(tier: Tier, error: unknown, now: number): void {
    tier.openedAt = now;
    tier.reason = describe(error);
    this.logger.error(
      `${tier.label}: BẬC CHẾT, nghỉ ${BREAKER_COOLDOWN_MS / 1000}s rồi thử lại — ${tier.reason}`,
    );
  }
}

/**
 * Mô tả lỗi cho log. Chỉ `status`/`code`/message của chính ta — KHÔNG bao
 * giờ body thô của nhà cung cấp, vì với 4xx nó có thể là request của ta
 * dội lại, tức chứa bài làm của sinh viên.
 */
function describe(error: unknown): string {
  const e = (error ?? {}) as { status?: unknown; code?: unknown; message?: unknown };
  const parts = [
    typeof e.status === 'number' ? `HTTP ${e.status}` : undefined,
    typeof e.code === 'string' ? e.code : undefined,
    typeof e.message === 'string' ? e.message : undefined,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : String(error);
}

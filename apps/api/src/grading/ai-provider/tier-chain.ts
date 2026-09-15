import { Logger } from '@nestjs/common';
import { classifyProviderFailure } from './provider-failure';

/**
 * Chuỗi bậc có thứ tự + circuit breaker, KHÔNG biết mình đang gọi gì.
 *
 * Tách khỏi `FallbackGradingProvider` khi Advocate cũng cần chuỗi
 * (quyết định của chủ đồ án 2026-09-15). Hai bản sao của logic breaker là
 * hai chỗ để lệch nhau, và lệch ở đây thì triệu chứng là "đôi khi bài
 * không được chấm" — loại lỗi không ai truy được.
 *
 * Generic trên `Req`/`Res` vì chuỗi không quan tâm nội dung: nó chỉ biết
 * "gọi bậc này, nếu bậc chết thì sang bậc sau".
 *
 * RANH GIỚI VỚI RETRY CỦA BULLMQ — thứ dễ làm sai nhất ở đây.
 *
 * Job đã có 3 lượt retry với backoff mũ. Nếu chuỗi này cũng retry thì một
 * bài = 3 lượt × N bậc lời gọi, và không ai đọc log ra được vì sao.
 *
 *   chuỗi này ← lo "BẬC NÀY CHẾT"       (mở breaker, sang bậc sau)
 *   BullMQ    ← lo "TRỤC TRẶC TẠM THỜI" (ném ra, retry cùng bậc)
 *
 * Lỗi `transient` được NÉM RA NGOÀI, cố ý: bậc trên vẫn khoẻ, và đẩy bài
 * xuống model yếu hơn chỉ vì một cú 503 thoáng qua là tự hạ chất lượng
 * mà không có lý do.
 */

/** Bậc chết rồi thì ngủ bao lâu trước khi cho một bài thăm dò. */
export const BREAKER_COOLDOWN_MS = 60_000;

export interface TierEntry<Req, Res> {
  /** Nhãn đọc được trong log — id model thường không đủ ngữ cảnh. */
  label: string;
  /** Tên để ghép vào `name` của chuỗi. */
  name: string;
  run(request: Req): Promise<Res>;
}

interface TierState<Req, Res> extends TierEntry<Req, Res> {
  openedAt?: number;
  reason?: string;
  /**
   * Đã có MỘT lời gọi thăm dò đang bay sau khi hết hạn nguội.
   *
   * Cần vì chuỗi là singleton của Nest còn worker chạy `concurrency: 5`:
   * Node xen kẽ ở mỗi `await`, nên không có cờ này thì cả 5 job cùng thấy
   * breaker vừa mở và cùng lao vào một nhà cung cấp có thể vẫn đang chết —
   * 5 lời gọi phí mỗi 60 giây.
   */
  probing?: boolean;
}

export class TierChain<Req, Res> {
  readonly names: string[];

  private readonly logger: Logger;
  private readonly tiers: TierState<Req, Res>[];

  constructor(context: string, tiers: TierEntry<Req, Res>[]) {
    if (tiers.length === 0) {
      // Nổ ngay lúc khởi động còn hơn nổ ở bài đầu tiên của một buổi thi.
      throw new Error(`${context}: cần ít nhất một bậc`);
    }
    this.logger = new Logger(context);
    this.tiers = tiers.map((t) => ({ ...t }));
    this.names = tiers.map((t) => t.name);
  }

  async run(request: Req): Promise<Res> {
    const now = Date.now();
    let lastError: unknown;
    let tried = 0;

    for (const tier of this.tiers) {
      if (this.isBreakerOpen(tier, now)) {
        continue;
      }
      tried++;

      try {
        const result = await this.runWithRetryOnBadOutput(tier, request);
        // Thăm dò thành công: bậc sống lại. Đây là chỗ DUY NHẤT được xoá
        // `openedAt` — xem ghi chú ở `isBreakerOpen`.
        if (tier.probing) {
          this.logger.log(`${tier.label}: đã sống lại`);
          tier.probing = false;
          tier.openedAt = undefined;
          tier.reason = undefined;
        }
        return result;
      } catch (error) {
        const kind = classifyProviderFailure(error);

        if (kind === 'transient') {
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

    // Hết bậc. Ném lỗi CUỐI CÙNG chứ không dựng một lỗi mới: lỗi cuối
    // mang thông tin thật về vì sao ngay cả bậc cuối cũng không đỡ được.
    this.logger.error(
      `mọi bậc đều hỏng (thử ${tried}/${this.tiers.length}) — ${describe(lastError)}`,
    );
    throw lastError ?? new Error('Không còn bậc nào khả dụng');
  }

  /**
   * Thử lại ĐÚNG MỘT LẦN khi output hỏng, rồi mới nhường bậc sau.
   *
   * Vì sao một lần: cắt cụt và lệch schema phần lớn là NGẪU NHIÊN — cùng
   * một prompt gọi lại thường ra kết quả dùng được. Nhưng nếu bậc đó không
   * bao giờ trả đúng schema thì retry vô hạn chỉ đốt tiền. Cùng logic
   * "chấm lại đúng một lần" mà spec §6.4 đã dùng cho ca dẫn chứng không
   * định vị được.
   */
  private async runWithRetryOnBadOutput(tier: TierState<Req, Res>, request: Req): Promise<Res> {
    try {
      return await tier.run(request);
    } catch (error) {
      if (classifyProviderFailure(error) !== 'bad_output') {
        throw error;
      }
      this.logger.warn(`${tier.label}: output hỏng, thử lại một lần — ${describe(error)}`);
      return await tier.run(request);
    }
  }

  private isBreakerOpen(tier: TierState<Req, Res>, now: number): boolean {
    if (tier.openedAt === undefined) {
      return false;
    }
    if (now - tier.openedAt < BREAKER_COOLDOWN_MS) {
      return true;
    }
    // Đã có một bài đang thăm dò: mọi bài khác vẫn coi bậc này là đóng.
    if (tier.probing) {
      return true;
    }
    this.logger.log(`${tier.label}: hết hạn nguội, cho một bài thăm dò`);
    tier.probing = true;
    // GIỮ `openedAt`: nhánh đầu hàm này thoát sớm khi nó `undefined`, nên
    // xoá ở đây làm mọi job song song thấy breaker ĐÓNG HẲN và cùng lao
    // vào — đúng cái stampede mà nửa-mở sinh ra để chặn.
    return false;
  }

  private openBreaker(tier: TierState<Req, Res>, error: unknown, now: number): void {
    tier.openedAt = now;
    tier.probing = false;
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
export function describe(error: unknown): string {
  const e = (error ?? {}) as { status?: unknown; code?: unknown; message?: unknown };
  const parts = [
    typeof e.status === 'number' ? `HTTP ${e.status}` : undefined,
    typeof e.code === 'string' ? e.code : undefined,
    typeof e.message === 'string' ? e.message : undefined,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : String(error);
}

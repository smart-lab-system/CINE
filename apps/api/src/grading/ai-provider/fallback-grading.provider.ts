import { AIGradingProvider, GradingOutcome, GradingRequest } from './ai-grading-provider';
import { TierChain } from './tier-chain';

/**
 * Chuỗi provider chấm bài có thứ tự: bậc trên chết thì bậc dưới nhận.
 *
 * Nó TỰ NÓ là một `AIGradingProvider`, nên `GradingService` không biết có
 * chuyện gì xảy ra — đúng lý do cái seam đó tồn tại. Mọi thứ quan trọng
 * vẫn đi ra ngoài đúng đường cũ: `modelUsed` là của bậc đã trả lời (không
 * phải của chuỗi), `confidenceCeiling` là trần của bậc đó, `contextUsed`
 * là ngữ cảnh bậc đó thật sự đọc được.
 *
 * Toàn bộ luật rơi bậc + circuit breaker nằm ở `TierChain`, dùng chung với
 * chuỗi Advocate: hai bản sao của logic đó là hai chỗ để lệch nhau, và
 * lệch ở đây cho ra triệu chứng "đôi khi bài không được chấm".
 */
export class FallbackGradingProvider implements AIGradingProvider {
  readonly name: string;

  private readonly chain: TierChain<GradingRequest, GradingOutcome>;

  constructor(tiers: { provider: AIGradingProvider; label: string }[]) {
    this.chain = new TierChain(
      'FallbackGradingProvider',
      tiers.map((t) => ({
        label: t.label,
        name: t.provider.name,
        run: (request: GradingRequest) => t.provider.grade(request),
      })),
    );
    this.name = `fallback(${this.chain.names.join(' → ')})`;
  }

  grade(request: GradingRequest): Promise<GradingOutcome> {
    return this.chain.run(request);
  }
}

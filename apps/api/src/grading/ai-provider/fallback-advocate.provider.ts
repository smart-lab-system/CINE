import { AdvocateOpinion } from './advocate.types';
import { AdvocateProvider, AdvocateRequest } from './advocate-provider';
import { TierChain } from './tier-chain';

/**
 * Chuỗi Advocate — cùng luật rơi bậc và cùng circuit breaker với chuỗi
 * chấm bài, qua `TierChain` dùng chung.
 *
 * KHÔNG có bậc sàn tương đương `KeywordGradingProvider`, và đó là khác
 * biệt CÓ CHỦ Ý với chuỗi chấm:
 *
 * Sàn của chuỗi chấm tồn tại vì một bài PHẢI có kết cục — không chấm được
 * thì vẫn cần một dòng để giảng viên xử lý. Advocate thì ngược: nó là ý
 * kiến THÊM. Không có ý kiến nào tốt hơn một ý kiến bịa ra bằng đếm từ,
 * vì thứ nó sinh ra là một LẬP LUẬN BÊNH VỰC mà giảng viên sẽ đọc và có
 * thể tin. Đối sánh từ khoá không bênh vực được ai.
 *
 * Nên khi mọi bậc chết, chuỗi này ném — và `GradingService` bắt, ghi log,
 * rồi cho bài đi tiếp KHÔNG có ý kiến phản biện. Bài vẫn có điểm của
 * Grader và vẫn sang giảng viên.
 */
export class FallbackAdvocateProvider implements AdvocateProvider {
  readonly name: string;

  private readonly chain: TierChain<AdvocateRequest, AdvocateOpinion>;

  constructor(tiers: { provider: AdvocateProvider; label: string }[]) {
    this.chain = new TierChain(
      'FallbackAdvocateProvider',
      tiers.map((t) => ({
        label: t.label,
        name: t.provider.name,
        run: (request: AdvocateRequest) => t.provider.advocate(request),
      })),
    );
    this.name = `fallback(${this.chain.names.join(' → ')})`;
  }

  advocate(request: AdvocateRequest): Promise<AdvocateOpinion> {
    return this.chain.run(request);
  }
}

import { HttpException, HttpStatus, Inject, Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { AiUsageEntity } from './entities/ai-usage.entity';

export const GENERATE_QUOTA_OPTIONS = Symbol('GENERATE_QUOTA_OPTIONS');

export interface GenerateQuotaOptions {
  /** Số lượt soạn đề tối đa trong một cửa sổ trượt, tính theo TỪNG giảng viên. */
  burstLimit: number;
  burstWindowMs: number;
  /** Trần 24 giờ, đếm từ `ai_usage` nên sống sót qua restart và nhiều instance. */
  dailyLimit: number;
  now: () => number;
}

/**
 * Hai con số này chặn hai thứ khác nhau, đừng gộp.
 *
 * `burst` chặn VÒNG LẶP KHÔNG NGƯỜI TRÔNG: double-click, retry sau timeout,
 * một `useEffect` gọi lại mỗi lần render. Một giảng viên thật không thể vượt
 * 20 lượt trong 10 phút — mỗi lượt là 20-60 giây chờ model, và họ phải ĐỌC
 * kết quả rồi mới quyết định sinh lại. Một vòng lặp hỏng thì bắn hàng trăm
 * lượt một phút, và nó đụng trần này trong vài giây.
 *
 * `daily` chặn thứ mà cửa sổ trượt không thấy: rò rỉ CHẬM kéo dài nhiều giờ,
 * và cả việc process khởi động lại làm sạch bộ nhớ (Railway restart thường
 * xuyên). 60 lượt/ngày đủ cho một ngày soạn đề dày (5 đề, mỗi đề một lượt
 * gốc cộng vài lượt sinh lại từng câu), nhưng chặn một client kẹt ở mức 60
 * lời gọi tính tiền thay vì vài nghìn.
 */
export const DEFAULT_GENERATE_QUOTA: GenerateQuotaOptions = {
  burstLimit: 20,
  burstWindowMs: 10 * 60_000,
  dailyLimit: 60,
  now: () => Date.now(),
};

/**
 * Hạn mức cho route soạn đề — route DUY NHẤT trong hệ thống tiêu tiền thật
 * mỗi lần bấm.
 *
 * Soi gương bộ chặn `agent:join` trong `exam-session.gateway.ts`: cửa sổ
 * trượt tự viết, giữ trong bộ nhớ, hằng số có giải thích. Không kéo
 * `@nestjs/throttler` vào chỉ vì một route, và cũng không đặt trần toàn cục
 * — phần lớn route ở đây đọc DB cục bộ, trần chung sẽ vừa thừa cho chúng vừa
 * sai cho route này.
 *
 * Khác bộ kia ở một điểm: khoá theo `teacherId`, không theo kết nối. Tiền
 * tiêu theo người, và một người mở hai tab vẫn là một người.
 */
@Injectable()
export class GenerateQuotaService {
  private readonly attempts = new Map<string, number[]>();
  private readonly options: GenerateQuotaOptions;

  constructor(
    @InjectRepository(AiUsageEntity) private readonly usage: Repository<AiUsageEntity>,
    @Optional()
    @Inject(GENERATE_QUOTA_OPTIONS)
    options?: Partial<GenerateQuotaOptions>,
  ) {
    this.options = { ...DEFAULT_GENERATE_QUOTA, ...options };
  }

  /**
   * Ném 429 nếu vượt hạn mức. Gọi TRƯỚC khi chạm tới provider.
   *
   * Đặt ở service chứ không ở controller, theo đúng lý lẽ của
   * `GradingReferenceService.assertNotGradedYet`: guard ở controller là guard
   * mà một đường gọi tương lai đi vòng qua được.
   */
  async assertWithin(teacherId: string): Promise<void> {
    this.assertBurst(teacherId);
    await this.assertDaily(teacherId);
  }

  /**
   * ĐỒNG BỘ, và ghi nhận lượt thử NGAY tại đây chứ không sau khi gọi model
   * xong. Node chạy một luồng, nên hai request song song không thể cùng đọc
   * "còn chỗ" rồi cùng đi tiếp: request thứ hai thấy dấu vết của request thứ
   * nhất. Ghi sau `await` sẽ mở lại đúng cái khe đó.
   */
  private assertBurst(teacherId: string): void {
    const now = this.options.now();
    const floor = now - this.options.burstWindowMs;

    // Dọn mọi giảng viên đã nguội, không chỉ người đang gọi: Map này không có
    // sự kiện "ngắt kết nối" để dọn theo như bộ chặn của gateway, nên nếu chỉ
    // dọn khoá đang dùng thì nó lớn dần theo số giảng viên từng gọi.
    for (const [key, times] of this.attempts) {
      const alive = times.filter((t) => t > floor);
      if (alive.length === 0) {
        this.attempts.delete(key);
      } else {
        this.attempts.set(key, alive);
      }
    }

    const mine = this.attempts.get(teacherId) ?? [];
    if (mine.length >= this.options.burstLimit) {
      const retryAfterMs = mine[0] + this.options.burstWindowMs - now;
      throw new HttpException(
        `Bạn đã soạn ${this.options.burstLimit} lượt trong ${Math.round(
          this.options.burstWindowMs / 60_000,
        )} phút. Chờ khoảng ${Math.max(1, Math.ceil(retryAfterMs / 60_000))} phút rồi thử lại — ` +
          'mỗi lượt soạn đề là một lời gọi tới model tính tiền thật.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    mine.push(now);
    this.attempts.set(teacherId, mine);
  }

  /**
   * Đếm từ `ai_usage`, tức là đếm những lượt ĐÃ CHẠY XONG.
   *
   * Hệ quả đã biết: `recordUsage` cố ý nuốt lỗi ghi, nên trần này có thể đếm
   * thiếu. Chấp nhận — nó là lớp thứ hai, và lớp thứ nhất mới là lớp chặn
   * được cơn bão. Đổi lại nó sống sót qua restart và đúng với nhiều instance,
   * hai thứ mà cửa sổ trong bộ nhớ không làm được.
   */
  private async assertDaily(teacherId: string): Promise<void> {
    const since = new Date(this.options.now() - 24 * 60 * 60_000);
    const used = await this.usage.count({
      where: { teacherId, feature: 'exam_authoring', createdAt: MoreThan(since) },
    });
    if (used >= this.options.dailyLimit) {
      throw new HttpException(
        `Bạn đã dùng hết ${this.options.dailyLimit} lượt soạn đề trong 24 giờ qua. ` +
          'Hạn mức này để một lỗi phía máy không đốt hết ngân sách gọi model; ' +
          'cần thêm thì báo quản trị viên.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}

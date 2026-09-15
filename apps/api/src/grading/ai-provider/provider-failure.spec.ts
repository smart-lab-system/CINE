import { badOutputError, classifyProviderFailure, httpProviderError } from './provider-failure';

/**
 * Phân loại lỗi là TRỤC của chuỗi dự phòng, không phải chi tiết.
 *
 * Sai một ô trong bảng này thì hoặc hệ thống retry 3 lượt vào một tài
 * khoản đã hết tiền, hoặc nó đẩy cả lượt chấm xuống model yếu hơn chỉ vì
 * một cú 503 thoáng qua. Cả hai đều là hỏng âm thầm: bài vẫn có điểm.
 *
 * Mọi mã dưới đây là ĐO THẬT ngày 2026-09-15, không phải giả định.
 */
describe('classifyProviderFailure', () => {
  describe('bậc chết — mở breaker, sang bậc sau NGAY', () => {
    // Bốn nhà cung cấp, bốn mã HTTP khác nhau, cùng một ý nghĩa. Đây chính
    // là lý do không thể chỉ đọc `status`.
    it.each([
      ['tokenrouter qua gateway', 429, 'ALL_ACCOUNTS_UNAVAILABLE'],
      ['tokenrouter gọi thẳng', 503, 'model_not_found'],
      ['api.b.ai hết quota', 400, 'insufficient_user_quota'],
      ['api.b.ai chưa nạp tiền', 403, 'access_denied'],
    ])('%s: HTTP %i %s', (_label, status, code) => {
      expect(classifyProviderFailure(httpProviderError(status, code, 'x'))).toBe('tier_dead');
    });

    it('so mã KHÔNG phân biệt hoa thường', () => {
      // tokenrouter viết HOA, api.b.ai viết thường — cùng một ý.
      expect(classifyProviderFailure(httpProviderError(429, 'all_accounts_unavailable', 'x'))).toBe(
        'tier_dead',
      );
    });

    it('Anthropic hết credit: 400 KHÔNG có mã, chỉ có câu chữ', () => {
      // Ca duy nhất buộc phải so chuỗi. So chuỗi là cách nhận diện tồi,
      // nhưng thay thế duy nhất — coi MỌI 400 là bậc chết — sẽ khiến một
      // lỗi lập trình của chính ta lặng lẽ đẩy bài xuống model yếu hơn
      // thay vì nổ ra để sửa.
      const error = httpProviderError(
        400,
        undefined,
        'Your credit balance is too low to access the Anthropic API',
      );
      expect(classifyProviderFailure(error)).toBe('tier_dead');
    });

    it.each([401, 403, 404])('HTTP %i là "khoá này không dùng được", không bao giờ tự khỏi', (s) => {
      expect(classifyProviderFailure(httpProviderError(s, undefined, 'x'))).toBe('tier_dead');
    });
  });

  describe('tạm thời — ném ra cho BullMQ retry CÙNG bậc', () => {
    it('429 KHÔNG kèm mã chết là nghẽn nhịp thật, không phải hết hàng', () => {
      // Phân biệt này quan trọng: rơi bậc vì một cú rate limit là tự hạ
      // chất lượng chấm trong khi bậc trên vẫn khoẻ.
      expect(classifyProviderFailure(httpProviderError(429, 'rate_limit_exceeded', 'x'))).toBe(
        'transient',
      );
    });

    it.each([500, 502, 503, 504])('HTTP %i không kèm mã chết', (s) => {
      expect(classifyProviderFailure(httpProviderError(s, undefined, 'x'))).toBe('transient');
    });

    it('lỗi mạng không có status nào', () => {
      expect(classifyProviderFailure(new Error('fetch failed'))).toBe('transient');
    });

    it('thứ không phải Error cũng không được làm sập phân loại', () => {
      expect(classifyProviderFailure(undefined)).toBe('transient');
      expect(classifyProviderFailure('hỏng')).toBe('transient');
    });
  });

  describe('output hỏng — thử lại cùng bậc một lần', () => {
    it('cờ badOutput thắng mọi suy đoán từ mã HTTP', () => {
      // Provider biết rõ nó vừa nhận rác hơn bất cứ phép đoán nào từ status.
      expect(classifyProviderFailure(badOutputError('JSON cụt'))).toBe('bad_output');
    });

    it('badOutput vẫn mang status 422 cho tầng processor đọc', () => {
      // `describeError` và `isPermanentFailure` ở `grading.processor.ts`
      // đọc `status`; đổi hợp đồng đó sẽ làm log mất thông tin mà không ai
      // thấy ngay.
      const error = badOutputError('x') as Error & { status?: number };
      expect(error.status).toBe(422);
    });
  });
});

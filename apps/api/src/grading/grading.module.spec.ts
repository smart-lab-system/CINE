import { selectGradingProvider } from './grading.module';
import { ClaudeGradingProvider } from './ai-provider/claude-grading.provider';
import { KeywordGradingProvider } from './ai-provider/keyword-grading.provider';

/**
 * "Lượt chấm này gọi model nào" — quyết định nghiệp vụ, không phải chi tiết
 * lắp ráp.
 *
 * Bộ test này tồn tại vì nhánh Claude KHÔNG CÒN chạy trong e2e từ
 * 2026-09-15: guard `NODE_ENV === 'test'` luôn trả về keyword provider ở
 * đó, có chủ ý, để một bộ test không tiêu tiền thật. Đánh đổi là nhánh
 * còn lại không còn ai kiểm — nên nó phải được kiểm Ở ĐÂY, nơi `NODE_ENV`
 * đặt được bằng tay.
 */
describe('selectGradingProvider', () => {
  // Hai vật thế thân, không phải instance thật: hàm này chỉ CHỌN giữa hai
  // thứ được trao cho nó, nên dựng provider thật là kiểm thứ khác.
  const claude = { name: 'claude-opus-5' } as ClaudeGradingProvider;
  const keyword = { name: 'keyword-match@1' } as KeywordGradingProvider;

  const ORIGINAL = { ...process.env };

  afterEach(() => {
    // Khôi phục TỪNG BIẾN, không gán `process.env = ORIGINAL`: gán cả đối
    // tượng làm đứt liên kết mà các module đã giữ tham chiếu tới, và triệu
    // chứng sẽ hiện ở một suite khác chạy sau.
    process.env.NODE_ENV = ORIGINAL.NODE_ENV;
    process.env.ANTHROPIC_API_KEY = ORIGINAL.ANTHROPIC_API_KEY;
  });

  it('NODE_ENV=test → keyword, KỂ CẢ khi đã có khoá API', () => {
    // Ca đắt nhất nếu vỡ, và nó vỡ trong IM LẶNG: có credit thì test vẫn
    // xanh, chỉ là mỗi lần chạy `pnpm test:e2e` lại tiêu tiền thật.
    process.env.NODE_ENV = 'test';
    process.env.ANTHROPIC_API_KEY = 'sk-ant-api03-giả-định';

    expect(selectGradingProvider(claude, keyword)).toBe(keyword);
  });

  it('ngoài test, có khoá → Claude', () => {
    // Nhánh mà e2e không còn chạm tới được nữa. Không có test này thì
    // không chỗ nào trong repo khẳng định hệ thống thật gọi model thật.
    process.env.NODE_ENV = 'development';
    process.env.ANTHROPIC_API_KEY = 'sk-ant-api03-giả-định';

    expect(selectGradingProvider(claude, keyword)).toBe(claude);
  });

  it('ngoài test, KHÔNG có khoá → keyword', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.ANTHROPIC_API_KEY;

    expect(selectGradingProvider(claude, keyword)).toBe(keyword);
  });

  it('khoá rỗng tính là KHÔNG có khoá', () => {
    // `ANTHROPIC_API_KEY=` trong `.env` cho chuỗi rỗng. Coi nó là "có
    // khoá" nghĩa là gọi API với khoá rỗng, nhận 401, và bài nộp đi thẳng
    // vào `flagged_for_review` với một lý do không nói gì về nguyên nhân.
    // Cùng họ lỗi với `Number('')` → 0 đã giết hàng đợi ở Plan 1.
    process.env.NODE_ENV = 'development';
    process.env.ANTHROPIC_API_KEY = '';

    expect(selectGradingProvider(claude, keyword)).toBe(keyword);
  });
});

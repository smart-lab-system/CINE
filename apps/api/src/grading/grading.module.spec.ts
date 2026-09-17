import { readTier, selectGradingProvider } from './grading.module';
import { ClaudeGradingProvider, GRADER_MODEL } from './ai-provider/claude-grading.provider';
import { KeywordGradingProvider } from './ai-provider/keyword-grading.provider';
import { FallbackGradingProvider } from './ai-provider/fallback-grading.provider';

/**
 * "Lượt chấm này gọi model nào" — quyết định nghiệp vụ, không phải chi tiết
 * lắp ráp.
 *
 * Bộ test này tồn tại vì nhánh gọi model thật KHÔNG CÒN chạy trong e2e từ
 * 2026-09-15: guard `NODE_ENV === 'test'` luôn trả về keyword provider ở
 * đó, có chủ ý, để một bộ test không tiêu tiền thật. Đánh đổi là mọi nhánh
 * còn lại không còn ai kiểm — nên chúng phải được kiểm Ở ĐÂY, nơi
 * `NODE_ENV` đặt được bằng tay.
 */
describe('selectGradingProvider', () => {
  // Vật thế thân, không phải instance thật: hàm này chỉ DỰNG CHUỖI từ
  // những thứ được trao cho nó, nên khởi tạo provider thật là kiểm thứ khác.
  const claude = { name: GRADER_MODEL } as ClaudeGradingProvider;
  const keyword = { name: 'keyword-match@1' } as KeywordGradingProvider;

  const TIER_VARS = [
    'GRADING_TIER1_BASE_URL',
    'GRADING_TIER1_MODEL',
    'GRADING_TIER1_API_KEY',
    'GRADING_TIER1_CEILING',
    'GRADING_TIER2_BASE_URL',
    'GRADING_TIER2_MODEL',
    'GRADING_TIER2_API_KEY',
  ];
  const ORIGINAL = { ...process.env };

  beforeEach(() => {
    // Máy chạy test có thể đã có các biến này trong `.env` thật. Xoá sạch
    // trước mỗi ca để test nói về thứ nó đặt, không về thứ máy đang có.
    for (const key of TIER_VARS) {
      delete process.env[key];
    }
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    // Khôi phục TỪNG BIẾN, không gán `process.env = ORIGINAL`: gán cả đối
    // tượng làm đứt liên kết mà các module đã giữ tham chiếu tới.
    //
    // Và phải XOÁ chứ không gán khi giá trị gốc là `undefined`:
    // `process.env` ép mọi giá trị về chuỗi, nên `process.env.X = undefined`
    // cho ra chuỗi `"undefined"` — MỘT CHUỖI TRUTHY. Một suite chạy sau sẽ
    // thấy "có khoá API" ở một máy chưa bao giờ đặt khoá.
    for (const key of [...TIER_VARS, 'ANTHROPIC_API_KEY', 'NODE_ENV']) {
      restore(key, ORIGINAL[key]);
    }
  });

  function restore(key: string, value: string | undefined): void {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  function setTier1(overrides: Record<string, string> = {}): void {
    process.env.GRADING_TIER1_BASE_URL = 'https://example.test/v1';
    process.env.GRADING_TIER1_MODEL = 'model-bac-1';
    process.env.GRADING_TIER1_API_KEY = 'sk-giả-định';
    for (const [k, v] of Object.entries(overrides)) {
      process.env[k] = v;
    }
  }

  it('NODE_ENV=test → keyword, KỂ CẢ khi đã cấu hình đủ mọi bậc', () => {
    // Ca đắt nhất nếu vỡ, và nó vỡ trong IM LẶNG: có credit thì e2e vẫn
    // xanh, chỉ là mỗi lần chạy lại tiêu tiền thật.
    process.env.NODE_ENV = 'test';
    process.env.ANTHROPIC_API_KEY = 'sk-ant-api03-giả-định';
    setTier1();

    expect(selectGradingProvider(claude, keyword)).toBe(keyword);
  });

  it('không bậc nào cấu hình → keyword TRẦN, không bọc chuỗi', () => {
    // Bọc một chuỗi chỉ có sàn là thêm một tầng gián tiếp không đổi lấy gì.
    process.env.NODE_ENV = 'development';

    expect(selectGradingProvider(claude, keyword)).toBe(keyword);
  });

  it('có khoá Claude → chuỗi Claude rồi tới sàn', () => {
    process.env.NODE_ENV = 'development';
    process.env.ANTHROPIC_API_KEY = 'sk-ant-api03-giả-định';

    const provider = selectGradingProvider(claude, keyword);

    expect(provider).toBeInstanceOf(FallbackGradingProvider);
    expect(provider.name).toBe(`fallback(${GRADER_MODEL} → keyword-match@1)`);
  });

  it('bậc 1 đứng TRƯỚC Claude — thứ tự là thứ quyết định ai chấm', () => {
    // Thứ tự không phải chi tiết: bậc đầu là bậc chấm gần như mọi bài, và
    // trần tin cậy của NÓ quyết định có bài nào tự duyệt được hay không.
    process.env.NODE_ENV = 'development';
    process.env.ANTHROPIC_API_KEY = 'sk-ant-api03-giả-định';
    setTier1();

    const provider = selectGradingProvider(claude, keyword);

    expect(provider.name).toBe(`fallback(model-bac-1 → ${GRADER_MODEL} → keyword-match@1)`);
  });

  it('sàn LUÔN là bậc cuối', () => {
    // Không có sàn thì một ngày mọi nhà cung cấp cùng hỏng sẽ thành một
    // lượt chấm không có kết cục nào — bài treo, không lỗi, không điểm.
    process.env.NODE_ENV = 'development';
    setTier1();

    expect(selectGradingProvider(claude, keyword).name).toMatch(/→ keyword-match@1\)$/);
  });

  it('bậc khai THIẾU biến thì bị bỏ qua, không đoán phần còn lại', () => {
    // Đoán một baseUrl hay một tên model là cách chắc chắn nhất để có một
    // bậc luôn trả 404 mà không ai hiểu vì sao.
    process.env.NODE_ENV = 'development';
    process.env.GRADING_TIER1_BASE_URL = 'https://example.test/v1';
    process.env.GRADING_TIER1_MODEL = 'model-bac-1';
    // thiếu API_KEY

    expect(selectGradingProvider(claude, keyword)).toBe(keyword);
  });

  it('khoá rỗng tính là KHÔNG có khoá', () => {
    // `ANTHROPIC_API_KEY=` trong `.env` cho chuỗi rỗng. Coi nó là "có
    // khoá" nghĩa là gọi API với khoá rỗng, nhận 401, rồi bài rơi vào
    // flagged_for_review với một lý do không nói gì về nguyên nhân. Cùng
    // họ với `Number('')` → 0 đã giết hàng đợi ở Plan 1.
    process.env.NODE_ENV = 'development';
    process.env.ANTHROPIC_API_KEY = '';

    expect(selectGradingProvider(claude, keyword)).toBe(keyword);
  });

  describe('trần tin cậy đọc từ env', () => {
    // Trần của bậc đầu quyết định CÓ BÀI NÀO TỰ DUYỆT ĐƯỢC KHÔNG, nên một
    // giá trị rác không được phép âm thầm trở thành một con số nào đó.
    // Cùng họ với `Number('')` → 0 đã giết hàng đợi ở Plan 1.
    // Kiểm thẳng `readTier` thay vì chọc vào cấu trúc bên trong chuỗi:
    // bản trước đọc `chain.tiers[0].provider.config.ceiling`, và nó vỡ
    // ngay lần refactor đầu tiên (`TierChain` dùng chung) — đúng dấu hiệu
    // của một test bám vào chỗ riêng tư thay vì vào hành vi.
    function ceilingOf(raw?: string): number {
      setTier1(raw === undefined ? {} : { GRADING_TIER1_CEILING: raw });
      return readTier(1)!.ceiling;
    }

    it.each([
      ['không khai', undefined, 0.5],
      ['rỗng', '', 0.5],
      ['không phải số', 'abc', 0.5],
      ['0 — không có nghĩa', '0', 0.5],
      ['âm', '-1', 0.5],
      ['lớn hơn 1', '1.5', 0.5],
      ['hợp lệ', '0.9', 0.9],
      ['đúng 1', '1', 1],
    ])('%s → %s', (_label, raw, expected) => {
      expect(ceilingOf(raw as string | undefined)).toBe(expected);
    });
  });

  it('bậc 2 cấu hình mà bậc 1 không → bậc 2 vẫn chạy, không cần lấp chỗ trống', () => {
    // Số thứ tự là ĐỘ ƯU TIÊN, không phải chỉ số mảng phải liên tục.
    process.env.NODE_ENV = 'development';
    process.env.GRADING_TIER2_BASE_URL = 'https://example.test/v1';
    process.env.GRADING_TIER2_MODEL = 'model-bac-2';
    process.env.GRADING_TIER2_API_KEY = 'sk-giả-định';

    expect(selectGradingProvider(claude, keyword).name).toBe(
      'fallback(model-bac-2 → keyword-match@1)',
    );
  });
});

import { ClaudeGradingProvider } from './claude-grading.provider';
import { GradingRubricCriterion } from './ai-grading-provider';

/**
 * T-CACHE-1 — phép đo DUY NHẤT nói prompt caching có tác dụng thật.
 *
 * ⚠️ GỌI API TÍNH TIỀN. Không chạy trong bộ test thường, và không bao giờ
 * được để nó chạy: `pnpm test` phải miễn phí, tất định, và không phụ thuộc
 * một dịch vụ ngoài mạng. Guard `NODE_ENV === 'test'` ở `grading.module.ts`
 * chặn đường DI, còn file này tự chặn bằng một biến môi trường riêng.
 *
 * Chạy khi tài khoản đã có credit:
 *
 *     cd apps/api
 *     RUN_PAID_INTEGRATION=true npx jest --testPathPattern integration
 *
 * Chi phí một lượt: ~$0,02 (hai lời gọi, tiền tố ~1.400 token).
 *
 * VÌ SAO RUBRIC PHẢI CỠ THẬT — đây là chỗ dễ đo sai nhất, và tôi đã suýt
 * mắc (2026-09-15):
 *
 * Breakpoint cache của Opus chỉ kích hoạt khi tiền tố đạt TỐI THIỂU 1024
 * token. Đo bằng rubric một tiêu chí cho tiền tố ~450 token — DƯỚI ngưỡng
 * — nên `cacheReadTokens` về 0 và kết quả đọc ra y hệt "caching hỏng",
 * trong khi caching hoàn toàn đúng.
 *
 * Đó cũng là một PHÁT HIỆN phải ghi vào báo cáo, không chỉ là một cái bẫy
 * đo lường: với rubric ngắn và không có tài liệu tham chiếu, prompt
 * caching KHÔNG kích hoạt chút nào, và bảng chi phí §2.3 của spec không
 * áp dụng cho ca đó.
 */

const ENABLED = process.env.RUN_PAID_INTEGRATION === 'true';
const describeIfPaid = ENABLED ? describe : describe.skip;

/** Rubric cỡ THẬT: 5 tiêu chí, mô tả như giảng viên viết. */
const CRITERIA: GradingRubricCriterion[] = [
  {
    id: 'c1',
    description:
      'Trình bày được ý tưởng của thuật toán sắp xếp nổi bọt: duyệt qua mảng nhiều lượt, ' +
      'mỗi lượt so sánh từng cặp phần tử kề nhau và hoán đổi nếu chúng sai thứ tự, để sau ' +
      'mỗi lượt phần tử lớn nhất trong phần chưa sắp xếp được đẩy về cuối.',
    maxPoints: 10,
  },
  {
    id: 'c2',
    description:
      'Phân tích độ phức tạp thời gian trong trường hợp xấu nhất và trung bình là O(n^2), ' +
      'và giải thích được con số đó đến từ đâu: hai vòng lặp lồng nhau, mỗi vòng chạy tối ' +
      'đa n lần. Nêu được trường hợp tốt nhất O(n) khi mảng đã sắp xếp và có cờ kiểm tra.',
    maxPoints: 10,
  },
  {
    id: 'c3',
    description:
      'Nêu được độ phức tạp không gian O(1) và giải thích: thuật toán sắp xếp tại chỗ, ' +
      'chỉ dùng thêm một biến tạm để hoán đổi, không cấp phát mảng phụ theo kích thước.',
    maxPoints: 5,
  },
  {
    id: 'c4',
    description:
      'Viết được mã giả hoặc mã nguồn đúng cho thuật toán, có vòng lặp ngoài và vòng lặp ' +
      'trong với cận đúng, thao tác hoán đổi đúng, và không truy cập ra ngoài biên mảng.',
    maxPoints: 15,
  },
  {
    id: 'c5',
    description:
      'So sánh được với ít nhất một thuật toán sắp xếp khác và chỉ ra khi nào nên hoặc ' +
      'không nên dùng nổi bọt trong thực tế, kèm lý do dựa trên độ phức tạp.',
    maxPoints: 10,
  },
];

const BAI_1 =
  'Thuật toán sắp xếp nổi bọt duyệt qua mảng nhiều lượt. Ở mỗi lượt ta so sánh từng cặp ' +
  'phần tử kề nhau, nếu phần tử đứng trước lớn hơn thì hoán đổi. Sau lượt đầu, phần tử ' +
  'lớn nhất được đẩy về cuối mảng. Hai vòng lặp lồng nhau nên trường hợp xấu nhất là ' +
  'O(n^2). Thuật toán sắp xếp tại chỗ nên độ phức tạp không gian là O(1).';

const BAI_2 =
  'Em xin trình bày sắp xếp nổi bọt. Ý tưởng là đi từ đầu mảng tới cuối, so sánh hai ' +
  'phần tử cạnh nhau, sai thứ tự thì đổi chỗ, lặp lại tới khi không còn cặp nào sai. ' +
  'So với chèn trực tiếp thì nổi bọt chậm hơn trên dữ liệu gần như đã sắp xếp.';

describeIfPaid('T-CACHE-1: prompt caching (GỌI API THẬT)', () => {
  jest.setTimeout(300_000);

  it('bài thứ hai cùng phiên đọc được token từ cache', async () => {
    const provider = new ClaudeGradingProvider();

    const first = await provider.grade({
      studentMssv: 'CACHE-001',
      content: BAI_1,
      deliverableType: 'document',
      criteria: CRITERIA,
    });

    const second = await provider.grade({
      studentMssv: 'CACHE-002',
      content: BAI_2,
      deliverableType: 'document',
      criteria: CRITERIA,
    });

    // Bài đầu GHI cache, bài sau ĐỌC. Đây là bằng chứng duy nhất rằng
    // tiền tố dùng chung thật sự được tái sử dụng — không có nó thì cả
    // lập luận "nhét đề bài vào context gần như miễn phí" (§2.3) chỉ là
    // một câu trong báo cáo.
    expect(first.usage.cacheCreationTokens).toBeGreaterThan(0);
    expect(second.usage.cacheReadTokens).toBeGreaterThan(0);

    // In ra để dán vào spec §15 — số đo, không phải "đã chạy OK".
    console.log('T-CACHE-1:', {
      bai1: first.usage,
      bai2: second.usage,
    });
  });
});

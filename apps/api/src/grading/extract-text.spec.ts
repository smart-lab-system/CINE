import { extractText, GradingInputTooLargeError } from './extract-text';
import {
  MAX_GRADING_INPUT_BYTES,
  MAX_GRADING_INPUT_CHARS,
  TRUNCATION_NOTICE,
} from './grading.types';

/**
 * Giới hạn đầu vào cho một lượt chấm (CLAUDE.md §7.1.4).
 *
 * Chặn ở đây chứ không ở chỗ gọi model: mọi provider — kể cả provider
 * thêm về sau — đều đi qua `extractText`, nên một chỗ chặn là đủ và
 * không có đường vòng.
 */
describe('extractText input limits', () => {
  it('từ chối file vượt MAX_GRADING_INPUT_BYTES TRƯỚC khi phân tích nó', async () => {
    // Trước khi parse, không phải sau: parse một file 30MB đã tốn thời
    // gian và bộ nhớ rồi mới biết là phải vứt.
    const tooBig = Buffer.alloc(MAX_GRADING_INPUT_BYTES + 1, 0x41);

    await expect(extractText(tooBig, 'Cau1.txt')).rejects.toThrow(GradingInputTooLargeError);
  });

  it('nhận file đúng bằng giới hạn — biên là "vượt", không phải "bằng"', async () => {
    const exactly = Buffer.alloc(MAX_GRADING_INPUT_BYTES, 0x41);

    await expect(extractText(exactly, 'Cau1.txt')).resolves.toBeDefined();
  });

  it('cắt text ở MAX_GRADING_INPUT_CHARS, KỂ CẢ dòng thông báo cắt', async () => {
    // Con số này là giới hạn của thứ THẬT SỰ được gửi đi, nên dòng thông
    // báo phải nằm TRONG nó. Cắt đủ 200k rồi cộng thêm thông báo ra
    // ngoài là để giới hạn tự nó bị vượt — nhỏ, nhưng là đúng cái kiểu
    // sai mà một giới hạn không được phép mắc.
    const long = Buffer.from('x'.repeat(500_000), 'utf8');

    const text = await extractText(long, 'Cau1.txt');

    expect(text.length).toBeLessThanOrEqual(MAX_GRADING_INPUT_CHARS);
    expect(text.endsWith(TRUNCATION_NOTICE)).toBe(true);
  });

  it('nói ra là đã cắt, không cắt im lặng', async () => {
    // Người đọc kết quả chấm phải biết model chỉ nhìn thấy một phần bài.
    const long = Buffer.from('x'.repeat(MAX_GRADING_INPUT_CHARS + 1), 'utf8');

    const text = await extractText(long, 'Cau1.txt');

    expect(text).toContain('bị cắt');
  });

  it('để yên file kích thước bình thường — không đụng gì', async () => {
    const text = await extractText(Buffer.from('Bài làm của em.', 'utf8'), 'Cau1.txt');

    expect(text).toBe('Bài làm của em.');
  });

  it('định dạng không đọc được vẫn trả chuỗi rỗng, không ném lỗi', async () => {
    // Chống hồi quy: thêm guard kích thước không được biến ".pdf" từ
    // "không đọc được" thành "lỗi". Chuỗi rỗng là câu trả lời thật ở đây
    // — nó đẩy bài sang người chấm tay, còn điểm 0 sẽ là một phán xét.
    const text = await extractText(Buffer.from('%PDF-1.7', 'utf8'), 'Cau1.pdf');

    expect(text).toBe('');
  });
});

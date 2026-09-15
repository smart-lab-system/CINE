import { extractText } from './extract-text';
import {
  MAX_GRADING_INPUT_BYTES,
  MAX_GRADING_INPUT_CHARS,
  TRUNCATION_NOTICE,
} from './grading.types';

/**
 * Giới hạn đầu vào cho một lượt chấm (CLAUDE.md §7.1.4).
 *
 * Trần BYTE đã chuyển sang `DocumentResolver` — xem
 * `content-resolver/content-resolver.spec.ts`. Lý do: lời tuyên bố cũ ở
 * đây ("mọi provider đều đi qua `extractText`, nên một chỗ chặn là đủ")
 * KHÔNG đúng — ảnh không đi qua hàm này, nên cửa thủng đúng bằng nhánh
 * chưa xây.
 *
 * Trần KÝ TỰ ở lại đây, vì nó là thuộc tính của việc trích text: một docx
 * 2MB toàn chữ vẫn ra hàng triệu ký tự, và chỉ hàm này nhìn thấy điều đó.
 */
describe('extractText input limits', () => {
  it('KHÔNG còn tự chặn theo byte — việc đó là của resolver', async () => {
    // Ghim chỗ trách nhiệm đã chuyển đi, thay vì xoá test đi trong im lặng.
    // Nếu ai đó thêm lại trần byte vào đây, test này đỏ và họ sẽ đọc được
    // lý do ở trên trước khi làm hai chỗ chặn cùng một thứ.
    const tooBig = Buffer.alloc(MAX_GRADING_INPUT_BYTES + 1, 0x41);

    await expect(extractText(tooBig, 'Cau1.txt')).resolves.toBeDefined();
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

import { ContentResolverRegistry } from './content-resolver.registry';
import { DocumentResolver } from './document-resolver';
import { GradingInputTooLargeError } from '../extract-text';

describe('ContentResolverRegistry', () => {
  const registry = new ContentResolverRegistry([new DocumentResolver()]);

  it('chọn resolver theo loại ĐÃ KHAI, không đoán', () => {
    // Giảng viên đã khai `deliverable_type` lúc tạo phiên. Dùng LLM đoán
    // lại thứ đã biết là vừa tốn token vừa thêm một đường sai.
    expect(registry.for('document')).toBeInstanceOf(DocumentResolver);
  });

  it('T-B1: loại chưa có resolver thì NỔ, không im lặng rơi về document', () => {
    // Trước thay đổi này `deliverableType` bị hardcode 'document', nên bài
    // code và ảnh viết tay đi cùng đường với bài tự luận — chấm ra một con
    // số trông hợp lệ từ một đường xử lý sai, và không ai phát hiện.
    // Nổ to còn hơn sai âm thầm.
    expect(() => registry.for('image')).toThrow(/chưa có resolver/i);
    expect(() => registry.for('code_project')).toThrow(/chưa có resolver/i);
  });

  it('thông điệp lỗi nêu rõ LOẠI nào chưa hỗ trợ', () => {
    // "Chưa chấm được" mà không nói loại gì thì người đọc log phải đi tra
    // ngược từ id bài nộp.
    expect(() => registry.for('image')).toThrow(/image/);
  });
});

describe('DocumentResolver', () => {
  const resolver = new DocumentResolver();

  it('T-B4: chặn file vượt trần TRƯỚC khi parse', async () => {
    // Trần này trước đây nằm trong `extractText` với comment "để mọi
    // provider đi qua cùng một cửa" — nhưng ảnh KHÔNG đi qua `extractText`
    // (nó trả rỗng cho ảnh), nên cửa thủng đúng bằng nhánh chưa xây.
    // Ở resolver thì MỌI nhánh đều phải qua.
    const tooBig = Buffer.alloc(11 * 1024 * 1024);

    await expect(resolver.resolve(tooBig, 'Cau1.docx')).rejects.toBeInstanceOf(
      GradingInputTooLargeError,
    );
  });

  it('đọc được text thuần', async () => {
    const out = await resolver.resolve(Buffer.from('nội dung bài làm', 'utf8'), 'Cau1.txt');

    expect(out.text).toBe('nội dung bài làm');
    // `artifact` chỉ có nghĩa với nhánh ảnh (bản phiên âm) và nhánh code
    // (log chạy test). Document không có hiện vật trung gian nào.
    expect(out.artifact).toBeUndefined();
  });

  it('định dạng không đọc được trả chuỗi RỖNG, không ném', async () => {
    // Một file không đọc được là sự thật về việc trích xuất, không bao giờ
    // là phán xét về bài làm. Nó tới provider dưới dạng nội dung rỗng —
    // và đó là thứ đẩy bài sang cho con người.
    const out = await resolver.resolve(Buffer.from('%PDF-1.4 ...'), 'Cau1.pdf');

    expect(out.text).toBe('');
  });

  it('khai đúng loại mình xử lý', () => {
    expect(resolver.handles).toBe('document');
  });
});

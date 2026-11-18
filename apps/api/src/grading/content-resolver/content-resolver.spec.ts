import { ContentResolverRegistry } from './content-resolver.registry';
import { CodeProjectResolver } from './code-project-resolver';
import { DocumentResolver } from './document-resolver';
import { GradingInputTooLargeError } from '../extract-text';
import { MAX_GRADING_INPUT_BYTES } from '../grading.types';

describe('ContentResolverRegistry', () => {
  const registry = new ContentResolverRegistry([
    new DocumentResolver(),
    new CodeProjectResolver(),
  ]);

  it('chọn resolver theo loại ĐÃ KHAI, không đoán', () => {
    expect(registry.for('document')).toBeInstanceOf(DocumentResolver);
    expect(registry.for('code_project')).toBeInstanceOf(CodeProjectResolver);
  });

  it('T-B1: loại chưa có resolver thì NỔ, không im lặng rơi về document', () => {
    expect(() => registry.for('image')).toThrow(/chưa có resolver/i);
  });

  it('thông điệp lỗi nêu rõ LOẠI nào chưa hỗ trợ', () => {
    expect(() => registry.for('image')).toThrow(/image/);
  });
});

describe('DocumentResolver', () => {
  const resolver = new DocumentResolver();

  it('file quá lớn → GradingInputTooLargeError', async () => {
    const tooBig = Buffer.alloc(MAX_GRADING_INPUT_BYTES + 1);
    await expect(resolver.resolve(tooBig, 'Cau1.docx')).rejects.toBeInstanceOf(
      GradingInputTooLargeError,
    );
  });

  it('txt → text', async () => {
    const out = await resolver.resolve(Buffer.from('nội dung bài làm', 'utf8'), 'Cau1.txt');
    expect(out.text).toBe('nội dung bài làm');
  });

  it('pdf → rỗng (không đoán)', async () => {
    const out = await resolver.resolve(Buffer.from('%PDF-1.4 ...'), 'Cau1.pdf');
    expect(out.text).toBe('');
  });
});

describe('CodeProjectResolver', () => {
  const resolver = new CodeProjectResolver();

  it('file .java → text khác rỗng', async () => {
    const src = 'class A { static int x = 1; }\n';
    const out = await resolver.resolve(Buffer.from(src, 'utf8'), '{MSSV}_bai.java');
    expect(out.text).toBe(src);
  });

  it('file quá lớn → GradingInputTooLargeError', async () => {
    const tooBig = Buffer.alloc(MAX_GRADING_INPUT_BYTES + 1);
    await expect(resolver.resolve(tooBig, 'Main.java')).rejects.toBeInstanceOf(
      GradingInputTooLargeError,
    );
  });
});

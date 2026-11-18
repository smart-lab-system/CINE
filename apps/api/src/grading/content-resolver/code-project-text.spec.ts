import * as yazl from 'yazl';
import { resolveCodeProjectText, sanitizeCodeZipPath } from './code-project-text';

function makeZip(files: Record<string, string | Buffer>): Promise<Buffer> {
  const zip = new yazl.ZipFile();
  for (const [name, content] of Object.entries(files)) {
    zip.addBuffer(Buffer.isBuffer(content) ? content : Buffer.from(content), name);
  }
  zip.end();
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    zip.outputStream.on('data', (c: Buffer) => chunks.push(c));
    zip.outputStream.on('end', () => resolve(Buffer.concat(chunks)));
    zip.outputStream.on('error', reject);
  });
}

describe('resolveCodeProjectText', () => {
  it('file .java lẻ → UTF-8 đầy đủ', async () => {
    const src = 'class Main { public static void main(String[] a) {} }\n';
    await expect(resolveCodeProjectText(Buffer.from(src, 'utf8'), 'Bai1.java')).resolves.toBe(src);
  });

  it('zip chứa .java → ghép text có header đường dẫn', async () => {
    const zip = await makeZip({
      'sol/Main.java': 'class Main {}\n',
      'sol/README.md': 'ignore',
      '__MACOSX/sol/._Main.java': 'x',
    });
    const text = await resolveCodeProjectText(zip, 'bai.zip');
    expect(text).toContain('class Main {}');
    expect(text).toContain('sol/Main.java');
    expect(text).not.toContain('ignore');
  });

  it('zip không có file nguồn → rỗng', async () => {
    const zip = await makeZip({ 'notes.txt': 'hello' });
    await expect(resolveCodeProjectText(zip, 'bai.zip')).resolves.toBe('');
  });

  it('RAR magic → rỗng', async () => {
    const rar = Buffer.from([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00, 0x00]);
    await expect(resolveCodeProjectText(rar, 'bai.rar')).resolves.toBe('');
  });
});

describe('sanitizeCodeZipPath', () => {
  it('chặn zip-slip', () => {
    expect(sanitizeCodeZipPath('../evil.java')).toBeNull();
    expect(sanitizeCodeZipPath('ok/Main.java')).toBe('ok/Main.java');
  });
});

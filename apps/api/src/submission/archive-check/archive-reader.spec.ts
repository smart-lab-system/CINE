import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as yazl from 'yazl';
import {
  ArchiveTooManyEntriesError,
  ArchiveUnreadableError,
  detectArchiveFormat,
  listArchiveEntries,
} from './archive-reader';
import { ARCHIVE_MAX_ENTRIES } from './archive-check.constants';

const FIXTURES = join(__dirname, '../../../test/fixtures/archive');

/** Dựng một zip trong bộ nhớ. Dùng `yazl` — chỉ ở devDependencies. */
function makeZip(files: Record<string, string>, dirs: string[] = []): Promise<Buffer> {
  const zip = new yazl.ZipFile();
  for (const [name, content] of Object.entries(files)) {
    zip.addBuffer(Buffer.from(content), name);
  }
  for (const dir of dirs) {
    zip.addEmptyDirectory(dir);
  }
  zip.end();
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    zip.outputStream.on('data', (c: Buffer) => chunks.push(c));
    zip.outputStream.on('end', () => resolve(Buffer.concat(chunks)));
    zip.outputStream.on('error', reject);
  });
}

describe('detectArchiveFormat', () => {
  it('nhận ra zip (local file header)', () => {
    expect(detectArchiveFormat(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]))).toBe('zip');
  });

  it('nhận ra zip rỗng (end of central directory)', () => {
    expect(detectArchiveFormat(Buffer.from([0x50, 0x4b, 0x05, 0x06, 0x00]))).toBe('zip');
  });

  it('nhận ra rar4', () => {
    expect(detectArchiveFormat(Buffer.from([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00]))).toBe(
      'rar',
    );
  });

  it('nhận ra rar5', () => {
    expect(
      detectArchiveFormat(Buffer.from([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01, 0x00])),
    ).toBe('rar');
  });

  it('rác thì unknown', () => {
    expect(detectArchiveFormat(Buffer.from('khong phai file nen'))).toBe('unknown');
  });

  it('buffer rỗng thì unknown, không ném', () => {
    expect(detectArchiveFormat(Buffer.alloc(0))).toBe('unknown');
  });

  it('buffer ngắn hơn cả magic bytes thì unknown, không ném', () => {
    expect(detectArchiveFormat(Buffer.from([0x50, 0x4b]))).toBe('unknown');
  });

  // §6.1 — em đổi tên .rar thành .zip là chuyện có thật; đọc theo đuôi sẽ
  // báo hỏng cho một file hoàn toàn lành.
  it('nhận ra rar THẬT kể cả khi file được đặt tên .zip', () => {
    const rar = readFileSync(join(FIXTURES, 'sample-rar5.rar'));
    expect(detectArchiveFormat(rar)).toBe('rar');
  });
});

describe('listArchiveEntries — zip', () => {
  it('đọc zip thật ra đúng danh sách', async () => {
    const buf = await makeZip({ 'Main.java': 'x', 'src/Helper.java': 'y' });
    await expect(listArchiveEntries(buf, 'zip')).resolves.toEqual(
      expect.arrayContaining(['Main.java', 'src/Helper.java']),
    );
  });

  it('mục thư mục xuất hiện kèm dấu "/" ở cuối', async () => {
    const buf = await makeZip({ 'Main.java': 'x' }, ['src/']);
    const entries = await listArchiveEntries(buf, 'zip');
    expect(entries).toEqual(expect.arrayContaining(['src/']));
  });

  it('zip hỏng ném ArchiveUnreadableError', async () => {
    const broken = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('rac')]);
    await expect(listArchiveEntries(broken, 'zip')).rejects.toBeInstanceOf(
      ArchiveUnreadableError,
    );
  });

  it('quá trần thì ném, và dừng chứ không đọc hết', async () => {
    const many: Record<string, string> = {};
    for (let i = 0; i < ARCHIVE_MAX_ENTRIES + 50; i++) {
      many[`f${i}.txt`] = '';
    }
    const buf = await makeZip(many);
    await expect(listArchiveEntries(buf, 'zip')).rejects.toBeInstanceOf(
      ArchiveTooManyEntriesError,
    );
  }, 60_000);
});

describe('listArchiveEntries — rar', () => {
  it('đọc rar5 thật ra đúng danh sách, thư mục kèm "/"', async () => {
    const buf = readFileSync(join(FIXTURES, 'sample-rar5.rar'));
    const entries = await listArchiveEntries(buf, 'rar');
    expect(entries).toEqual(expect.arrayContaining(['Main.java', 'src/Helper.java', 'src/']));
  });

  // Header bị mã hoá thì không đọc nổi danh sách — `unreadable`, KHÔNG phải
  // `failed`. Hai kết luận dẫn tới hai hành động khác nhau của giảng viên.
  it('rar mã hoá header ném ArchiveUnreadableError', async () => {
    const buf = readFileSync(join(FIXTURES, 'sample-rar5-encrypted-headers.rar'));
    await expect(listArchiveEntries(buf, 'rar')).rejects.toBeInstanceOf(ArchiveUnreadableError);
  });

  it('dữ liệu không phải rar ném ArchiveUnreadableError', async () => {
    await expect(listArchiveEntries(Buffer.from('rac'), 'rar')).rejects.toBeInstanceOf(
      ArchiveUnreadableError,
    );
  });
});

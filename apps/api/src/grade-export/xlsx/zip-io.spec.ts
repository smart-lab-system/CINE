import JSZip from 'jszip';
import {
  CorruptZipError,
  EncryptedOrLegacyError,
  NotZipError,
  ZipLimitError,
  readZipEntries,
  writeZip,
} from './zip-io';

const DATE = new Date(Date.UTC(2026, 8, 1, 10, 20, 30));

async function makeZip(files: Record<string, string | Buffer>, opts: { dirs?: string[] } = {}): Promise<Buffer> {
  const zip = new JSZip();
  for (const dir of opts.dirs ?? []) zip.file(dir, null, { dir: true, date: DATE, createFolders: false });
  for (const [name, data] of Object.entries(files)) zip.file(name, data, { date: DATE, createFolders: false });
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

describe('readZipEntries / writeZip', () => {
  it('reads every entry, in order, with its bytes', async () => {
    const bytes = Buffer.from(Array.from({ length: 300 }, (_, i) => i % 256));
    const entries = await readZipEntries(await makeZip({ '[Content_Types].xml': '<a/>', 'xl/b.xml': '<b/>', 'xl/media/logo.png': bytes }));
    expect(entries.map((e) => e.name)).toEqual(['[Content_Types].xml', 'xl/b.xml', 'xl/media/logo.png']);
    expect(entries[0]!.data.toString()).toBe('<a/>');
    expect(entries[2]!.data.equals(bytes)).toBe(true);
    expect(entries.every((e) => !e.isDirectory)).toBe(true);
  });

  it('write → read gives back the same names, order, bytes and dates', async () => {
    const source = await readZipEntries(await makeZip({ 'a.txt': 'một', 'b/c.txt': 'hai' }));
    const again = await readZipEntries(await writeZip(source));
    expect(again.map((e) => e.name)).toEqual(['a.txt', 'b/c.txt']);
    expect(again.map((e) => e.data.toString())).toEqual(['một', 'hai']);
    expect(again[0]!.date).toEqual(DATE);
  });

  it('does NOT invent directory entries the original did not have (createFolders: false)', async () => {
    const again = await readZipEntries(await writeZip(await readZipEntries(await makeZip({ 'xl/worksheets/sheet1.xml': '<w/>' }))));
    expect(again.map((e) => e.name)).toEqual(['xl/worksheets/sheet1.xml']);
  });

  it('keeps directory entries the original DID have', async () => {
    const source = await readZipEntries(await makeZip({ 'xl/a.xml': '<a/>' }, { dirs: ['xl/'] }));
    expect(source.map((e) => [e.name, e.isDirectory])).toEqual([['xl/', true], ['xl/a.xml', false]]);
    const again = await readZipEntries(await writeZip(source));
    expect(again.map((e) => [e.name, e.isDirectory])).toEqual([['xl/', true], ['xl/a.xml', false]]);
  });

  it('an empty archive reads as no entries', async () => {
    expect(await readZipEntries(await new JSZip().generateAsync({ type: 'nodebuffer' }))).toEqual([]);
  });

  it('an old .xls / password-protected file (CFB container) is named as such', async () => {
    const cfb = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(64)]);
    await expect(readZipEntries(cfb)).rejects.toBeInstanceOf(EncryptedOrLegacyError);
  });

  it('something that is not a zip at all is named as such', async () => {
    await expect(readZipEntries(Buffer.from('MSSV,Điểm\n1,2\n'))).rejects.toBeInstanceOf(NotZipError);
    await expect(readZipEntries(Buffer.alloc(0))).rejects.toBeInstanceOf(NotZipError);
  });

  it('a truncated zip is corrupt, not "not a zip"', async () => {
    const zip = await makeZip({ 'a.txt': 'x'.repeat(2000) });
    await expect(readZipEntries(zip.subarray(0, Math.floor(zip.length / 2)))).rejects.toBeInstanceOf(CorruptZipError);
  });

  it('refuses more entries than the limit', async () => {
    const zip = await makeZip({ a: '1', b: '2', c: '3', d: '4', e: '5' });
    await expect(readZipEntries(zip, { maxEntries: 3, maxEntryBytes: 1000, maxTotalBytes: 1000 })).rejects.toBeInstanceOf(ZipLimitError);
  });

  it('refuses an entry whose declared size is over the per-entry limit — before inflating it', async () => {
    const zip = await makeZip({ big: 'x'.repeat(100) });
    await expect(readZipEntries(zip, { maxEntries: 10, maxEntryBytes: 50, maxTotalBytes: 1000 })).rejects.toBeInstanceOf(ZipLimitError);
  });

  it('refuses a total declared size over the limit even when every entry is small', async () => {
    const zip = await makeZip({ a: 'x'.repeat(40), b: 'y'.repeat(40), c: 'z'.repeat(40) });
    await expect(readZipEntries(zip, { maxEntries: 10, maxEntryBytes: 50, maxTotalBytes: 100 })).rejects.toBeInstanceOf(ZipLimitError);
  });
});

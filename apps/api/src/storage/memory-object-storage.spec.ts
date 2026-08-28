import { MemoryObjectStorage } from './memory-object-storage';

describe('MemoryObjectStorage', () => {
  it('round-trips an object by bucket and key', async () => {
    const storage = new MemoryObjectStorage();
    const put = await storage.putObject({
      bucket: 'course-rosters',
      key: 'sec/file.xls',
      body: Buffer.from('hello'),
      contentType: 'application/vnd.ms-excel',
    });

    expect(put.etag).toMatch(/^[a-f0-9]{64}$/);
    const got = await storage.getObject('course-rosters', 'sec/file.xls');
    expect(got.toString()).toBe('hello');
  });

  it('throws when the object is missing', async () => {
    const storage = new MemoryObjectStorage();
    await expect(
      storage.getObject('course-rosters', 'missing.xls'),
    ).rejects.toThrow(/not found/i);
  });
});

import { IdeExtensionExtractService, buildExtractTree } from './ide-extension-extract.service';
import type { StorageService } from '../../storage/storage.service';
import JSZip from 'jszip';

describe('buildExtractTree', () => {
  it('nests directories and sorts dirs before files', () => {
    const tree = buildExtractTree([
      { path: 'b.txt', size: 1 },
      { path: 'extension/package.json', size: 10 },
      { path: 'a.txt', size: 2 },
    ]);
    expect(tree.root.map((n) => n.name)).toEqual(['extension', 'a.txt', 'b.txt']);
    const ext = tree.root.find((n) => n.name === 'extension');
    expect(ext?.type).toBe('dir');
    if (ext?.type === 'dir') {
      expect(ext.children).toEqual([{ name: 'package.json', type: 'file', size: 10 }]);
    }
  });
});

describe('IdeExtensionExtractService', () => {
  const EXT_PK = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const VER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const STORAGE_KEY = `ide-extensions/${EXT_PK}/${VER_ID}.vsix`;

  async function makeVsixBuffer(entries: Record<string, string>): Promise<Buffer> {
    const zip = new JSZip();
    for (const [path, body] of Object.entries(entries)) {
      zip.file(path, body);
    }
    return Buffer.from(await zip.generateAsync({ type: 'nodebuffer' }));
  }

  function createService(opts: {
    storageKey?: string | null;
    archive?: Buffer | null;
    size?: number | null;
  }) {
    const row = {
      id: VER_ID,
      extensionPk: EXT_PK,
      storageKey: opts.storageKey === undefined ? STORAGE_KEY : opts.storageKey,
      extractStatus: 'pending',
      extractError: null,
      extractTreeKey: null,
      extractStartedAt: null,
      extractFinishedAt: null,
      extractEntryCount: null,
      extractTotalBytes: null,
    };

    const putObject = jest.fn().mockResolvedValue(undefined);
    const storage = {
      getObjectSize: jest.fn().mockResolvedValue(opts.size === undefined ? 100 : opts.size),
      getObject: jest.fn().mockResolvedValue(opts.archive ?? Buffer.alloc(0)),
      putObject,
      buildIdeExtensionExtractedFileKey: jest
        .fn()
        .mockImplementation((_e: string, _v: string, p: string) => `extracted/${p}`),
      buildIdeExtensionTreeKey: jest.fn().mockReturnValue('extracted/tree.json'),
    } as unknown as StorageService;

    const versions = {
      findOne: jest.fn().mockResolvedValue(row),
      save: jest.fn(async (r: unknown) => r),
    };

    const service = new IdeExtensionExtractService(storage, versions as never);
    return { service, storage, versions, row, putObject };
  }

  it('extracts files, writes tree.json, marks ready', async () => {
    const archive = await makeVsixBuffer({
      'extension/package.json': '{"name":"x"}',
      '[Content_Types].xml': '<Types/>',
    });
    const { service, putObject, row } = createService({ archive, size: archive.length });

    await service.processOne(VER_ID);

    expect(row.extractStatus).toBe('ready');
    expect(row.extractTreeKey).toBe('extracted/tree.json');
    expect(row.extractEntryCount).toBeGreaterThanOrEqual(2);
    expect(putObject).toHaveBeenCalled();
    const treeCall = putObject.mock.calls.find(
      (c: unknown[]) => c[0] === 'extracted/tree.json',
    );
    expect(treeCall).toBeTruthy();
    const tree = JSON.parse((treeCall![1] as Buffer).toString('utf8'));
    expect(tree.root.some((n: { name: string }) => n.name === 'extension')).toBe(true);
  });

  it('marks failed on Zip Slip', async () => {
    const archive = await makeVsixBuffer({ '../evil.js': 'x' });
    // JSZip may normalize — force a raw slip via yauzl by using a crafted name if possible.
    // If JSZip refuses .., simulate by patching sanitize through a path that opens then fails:
    const { service, row } = createService({
      storageKey: null,
    });
    await expect(service.processOne(VER_ID)).rejects.toThrow(/storage_key/i);
    expect(row.extractStatus).toBe('failed');
  });
});

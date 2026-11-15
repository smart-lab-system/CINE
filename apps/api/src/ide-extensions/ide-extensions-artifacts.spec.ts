import { BadRequestException, NotFoundException } from '@nestjs/common';
import { IdeExtensionsService } from './ide-extensions.service';
import type { StorageService } from '../storage/storage.service';

jest.mock('./marketplace-client', () => ({
  fetchMarketplaceMeta: jest.fn().mockResolvedValue(null),
}));

const EXT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const VER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const IDENTIFIER = 'ms-python.python';
const VERSION = '2024.12.0';
const STORAGE_KEY = `ide-extensions/${EXT_ID}/${VER_ID}.vsix`;

function makeVersion(overrides: Record<string, unknown> = {}) {
  return {
    id: VER_ID,
    extensionPk: EXT_ID,
    version: VERSION,
    addedAt: new Date('2026-11-02T00:00:00Z'),
    approvalStatus: 'pending',
    approvedAt: null,
    approvedBy: null,
    note: null,
    storageKey: null,
    artifactSha256: null,
    artifactSizeBytes: null,
    artifactUploadedAt: null,
    extractStatus: 'none',
    extractError: null,
    extractTreeKey: null,
    extractEntryCount: null,
    extractTotalBytes: null,
    extractStartedAt: null,
    extractFinishedAt: null,
    ...overrides,
  };
}

function makeExt(overrides: Record<string, unknown> = {}) {
  return {
    id: EXT_ID,
    identifier: IDENTIFIER,
    displayName: 'Python',
    publisher: 'ms-python',
    publishedAt: null,
    lastReleasedAt: null,
    marketplaceSyncedAt: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function createService(opts: {
  ext?: ReturnType<typeof makeExt> | null;
  version?: ReturnType<typeof makeVersion> | null;
  objectExists?: boolean;
}) {
  const ext = opts.ext === undefined ? makeExt() : opts.ext;
  const version = opts.version === undefined ? makeVersion() : opts.version;

  const storage = {
    buildIdeExtensionKey: jest.fn().mockReturnValue(STORAGE_KEY),
    buildIdeExtensionExtractedFileKey: jest
      .fn()
      .mockImplementation((_e: string, _v: string, p: string) => `extracted/${p}`),
    buildIdeExtensionTreeKey: jest.fn().mockReturnValue('extracted/tree.json'),
    generateUploadUrl: jest.fn().mockResolvedValue({
      uploadUrl: 'https://storage.example/put',
      expiresIn: 900,
    }),
    generateDownloadUrl: jest.fn().mockResolvedValue({
      downloadUrl: 'https://storage.example/get',
      expiresIn: 300,
    }),
    getObject: jest.fn().mockResolvedValue(
      Buffer.from(JSON.stringify({ root: [{ name: 'a.txt', type: 'file', size: 1 }] })),
    ),
    getObjectSize: jest.fn().mockResolvedValue(1),
    objectExists: jest.fn().mockResolvedValue(opts.objectExists ?? false),
  } as unknown as StorageService;

  const extractQueue = {
    add: jest.fn().mockResolvedValue(undefined),
    getJob: jest.fn().mockResolvedValue(null),
  };

  const extensions = {
    findOne: jest.fn().mockResolvedValue(ext),
    save: jest.fn(async (row: unknown) => row),
    create: jest.fn((row: unknown) => row),
  };
  const versions = {
    findOne: jest.fn().mockImplementation(async ({ where }: { where: Record<string, string> }) => {
      if (where.id === VER_ID) return version;
      if (where.extensionPk && where.version === VERSION) return version;
      if (where.extensionPk && where.version) return null;
      return version;
    }),
    save: jest.fn(async (row: unknown) => row),
    create: jest.fn((row: unknown) => ({
      id: VER_ID,
      storageKey: null,
      artifactSha256: null,
      artifactSizeBytes: null,
      artifactUploadedAt: null,
      ...(row as object),
    })),
  };

  const service = new IdeExtensionsService(
    {} as never,
    storage,
    extractQueue as never,
    extensions as never,
    versions as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  return { service, storage, extensions, versions, extractQueue };
}

describe('IdeExtensionsService artifacts', () => {
  describe('ensureArtifacts', () => {
    it('upserts pending and returns needed upload URL when binary missing', async () => {
      const { service, storage } = createService({
        version: makeVersion({ storageKey: null }),
        objectExists: false,
      });

      const result = await service.ensureArtifacts({
        items: [{ extensionId: IDENTIFIER, version: VERSION, displayName: 'Python' }],
      });

      expect(result.skipped).toBe(0);
      expect(result.needed).toEqual([
        {
          versionId: VER_ID,
          extensionId: IDENTIFIER,
          version: VERSION,
          storageKey: STORAGE_KEY,
          uploadUrl: 'https://storage.example/put',
          expiresIn: 900,
        },
      ]);
      expect(storage.generateUploadUrl).toHaveBeenCalledWith(STORAGE_KEY);
    });

    it('skips when storageKey exists and objectExists is true', async () => {
      const { service, storage } = createService({
        version: makeVersion({ storageKey: STORAGE_KEY }),
        objectExists: true,
      });

      const result = await service.ensureArtifacts({
        items: [{ extensionId: IDENTIFIER, version: VERSION }],
      });

      expect(result).toEqual({ needed: [], skipped: 1 });
      expect(storage.generateUploadUrl).not.toHaveBeenCalled();
    });

    it('returns needed again when DB has storageKey but object is missing (1B / backend switch)', async () => {
      const { service } = createService({
        version: makeVersion({ storageKey: STORAGE_KEY }),
        objectExists: false,
      });

      const result = await service.ensureArtifacts({
        items: [{ extensionId: IDENTIFIER, version: VERSION }],
      });

      expect(result.skipped).toBe(0);
      expect(result.needed).toHaveLength(1);
      expect(result.needed[0].storageKey).toBe(STORAGE_KEY);
    });

    it('drops wildcard * without counting as skipped-with-file', async () => {
      const { service, storage } = createService({});

      const result = await service.ensureArtifacts({
        items: [{ extensionId: IDENTIFIER, version: '*' }],
      });

      expect(result).toEqual({ needed: [], skipped: 0 });
      expect(storage.generateUploadUrl).not.toHaveBeenCalled();
    });

    it('dedupes identical extensionId+version', async () => {
      const { service, storage } = createService({
        version: makeVersion({ storageKey: null }),
        objectExists: false,
      });

      const result = await service.ensureArtifacts({
        items: [
          { extensionId: IDENTIFIER, version: VERSION },
          { extensionId: IDENTIFIER, version: VERSION },
        ],
      });

      expect(result.needed).toHaveLength(1);
      expect(storage.generateUploadUrl).toHaveBeenCalledTimes(1);
    });
  });

  describe('confirmArtifact', () => {
    it('writes artifact columns when key matches and object exists', async () => {
      const { service, versions, extractQueue } = createService({
        version: makeVersion({ storageKey: null }),
        objectExists: true,
      });

      const view = await service.confirmArtifact(VER_ID, {
        storageKey: STORAGE_KEY,
        sha256: 'abc',
        sizeBytes: 42,
      });

      expect(versions.save).toHaveBeenCalled();
      expect(view.storageKey).toBe(STORAGE_KEY);
      expect(view.artifactSha256).toBe('abc');
      expect(view.artifactSizeBytes).toBe('42');
      expect(view.artifactUploadedAt).toBeInstanceOf(Date);
      expect(view.extractStatus).toBe('pending');
      expect(extractQueue.add).toHaveBeenCalledWith(
        'extract',
        { versionId: VER_ID },
        expect.objectContaining({ jobId: `extract-${VER_ID}` }),
      );
    });

    it('rejects storage key mismatch', async () => {
      const { service } = createService({ objectExists: true });
      await expect(
        service.confirmArtifact(VER_ID, { storageKey: 'ide-extensions/other/other.vsix' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects when object is missing', async () => {
      const { service } = createService({ objectExists: false });
      await expect(
        service.confirmArtifact(VER_ID, { storageKey: STORAGE_KEY }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('404 when version missing', async () => {
      const { service, versions } = createService({});
      versions.findOne.mockResolvedValue(null);
      await expect(
        service.confirmArtifact(VER_ID, { storageKey: STORAGE_KEY }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('browseVersion', () => {
    it('returns status without tree while pending', async () => {
      const { service } = createService({
        version: makeVersion({
          storageKey: STORAGE_KEY,
          extractStatus: 'pending',
        }),
        objectExists: true,
      });
      const view = await service.browseVersion(VER_ID);
      expect(view.status).toBe('pending');
      expect(view.tree).toBeNull();
    });

    it('returns tree when ready', async () => {
      const { service } = createService({
        version: makeVersion({
          storageKey: STORAGE_KEY,
          extractStatus: 'ready',
          extractTreeKey: 'extracted/tree.json',
          extractEntryCount: 1,
        }),
        objectExists: true,
      });
      const view = await service.browseVersion(VER_ID);
      expect(view.status).toBe('ready');
      expect(view.tree?.root).toHaveLength(1);
    });
  });

  describe('browseVersionFile', () => {
    it('returns presigned URL for a safe path', async () => {
      const { service, storage } = createService({
        version: makeVersion({
          storageKey: STORAGE_KEY,
          extractStatus: 'ready',
        }),
        objectExists: true,
      });
      const view = await service.browseVersionFile(VER_ID, 'extension/package.json');
      expect(view.downloadUrl).toContain('https://storage.example/get');
      expect(view.path).toBe('extension/package.json');
      expect(storage.generateDownloadUrl).toHaveBeenCalled();
    });

    it('rejects path traversal', async () => {
      const { service } = createService({
        version: makeVersion({
          storageKey: STORAGE_KEY,
          extractStatus: 'ready',
        }),
        objectExists: true,
      });
      await expect(service.browseVersionFile(VER_ID, '../evil')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('requestExtract', () => {
    it('enqueues when status is none', async () => {
      const { service, extractQueue } = createService({
        version: makeVersion({ storageKey: STORAGE_KEY, extractStatus: 'none' }),
        objectExists: true,
      });
      const view = await service.requestExtract(VER_ID);
      expect(view.extractStatus).toBe('pending');
      expect(extractQueue.add).toHaveBeenCalled();
    });
  });

  describe('getNormalizedSources', () => {
    it('parses contributes.snippets from extracted package.json', async () => {
      const { service, storage } = createService({
        version: makeVersion({ storageKey: STORAGE_KEY, extractStatus: 'ready' }),
        objectExists: true,
      });
      (storage.getObject as jest.Mock).mockImplementation(async (key: string) => {
        if (key.includes('package.json')) {
          return Buffer.from(
            JSON.stringify({
              name: 'demo-snippets',
              contributes: {
                snippets: [{ path: './snippets/a.code-snippets' }],
              },
            }),
          );
        }
        return Buffer.from(
          JSON.stringify({
            'Demo Footer': {
              prefix: 'demo:footer',
              body: ['const Footer = () => null;', 'export default Footer;'],
            },
          }),
        );
      });

      const view = await service.getNormalizedSources(VER_ID);
      expect(view.mode).toBe('snippets');
      expect(view.packageName).toBe('demo-snippets');
      expect(view.items).toHaveLength(1);
      expect(view.items[0]?.prefix).toBe('demo:footer');
      expect(view.items[0]?.content).toContain('const Footer');
    });

    it('rejects when extract is not ready', async () => {
      const { service } = createService({
        version: makeVersion({ storageKey: STORAGE_KEY, extractStatus: 'pending' }),
        objectExists: true,
      });
      await expect(service.getNormalizedSources(VER_ID)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });
});

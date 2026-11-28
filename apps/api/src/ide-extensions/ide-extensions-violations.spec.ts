import { IdeExtensionsService } from './ide-extensions.service';

const EXT_ID = 'evil.tool';
const SCAN_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const SCAN_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const ITEM_A = '11111111-1111-1111-1111-111111111111';
const ITEM_B = '22222222-2222-2222-2222-222222222222';
const EXAM_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const COURSE_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

function makeBlockedItem(opts: {
  id: string;
  scanId: string;
  version: string | null;
  mssv: string;
  scannedAt: Date;
  displayName?: string | null;
}) {
  return {
    id: opts.id,
    scanId: opts.scanId,
    extensionId: EXT_ID,
    displayName: opts.displayName ?? 'Evil Tool',
    version: opts.version,
    verdict: 'blocked' as const,
    matchedScope: null,
    isBuiltin: false,
    scan: {
      id: opts.scanId,
      examSessionId: EXAM_ID,
      courseId: COURSE_ID,
      studentMssv: opts.mssv,
      machineId: 'pc-1',
      machineName: 'PC-01',
      scannedAt: opts.scannedAt,
      examSession: {
        id: EXAM_ID,
        name: 'Thi CK 2026',
        courseName: 'Lập trình Web',
      },
    },
  };
}

function createService(opts: {
  blocked: ReturnType<typeof makeBlockedItem>[];
  approvedVersions?: Array<{ version: string; identifier: string }>;
  catalog?: { id: string; identifier: string; displayName: string; publisher: string } | null;
}) {
  const scanItems = {
    find: jest.fn(async () => opts.blocked),
  };
  const versions = {
    find: jest.fn(async () =>
      (opts.approvedVersions ?? []).map((v) => ({
        version: v.version,
        approvalStatus: 'approved',
        extension: { identifier: v.identifier },
      })),
    ),
  };
  const students = {
    find: jest.fn(async () => [
      { mssv: 'SV001', fullName: 'Nguyen Van A' },
      { mssv: 'SV002', fullName: 'Tran Thi B' },
    ]),
  };
  const extensions = {
    find: jest.fn(async () =>
      opts.catalog
        ? [opts.catalog]
        : [{ id: 'cat-1', identifier: EXT_ID, displayName: 'Evil Tool', publisher: 'evil' }],
    ),
  };
  const courses = {
    find: jest.fn(async () => [{ id: COURSE_ID, name: 'Lập trình Web', code: 'WEB' }]),
  };
  const dataSource = {
    getRepository: jest.fn(() => courses),
  };

  const service = new IdeExtensionsService(
    dataSource as never,
    {} as never,
    {} as never,
    extensions as never,
    versions as never,
    {} as never,
    {} as never,
    {} as never,
    scanItems as never,
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
    students as never,
    { find: jest.fn(async () => []) } as never,
  );

  return { service, scanItems, versions };
}

describe('IdeExtensionsService listViolations', () => {
  it('aggregates two scans of same extension@version into one accordion group', async () => {
    const { service } = createService({
      blocked: [
        makeBlockedItem({
          id: ITEM_A,
          scanId: SCAN_A,
          version: '1.0.0',
          mssv: 'SV001',
          scannedAt: new Date('2026-11-01T10:00:00Z'),
        }),
        makeBlockedItem({
          id: ITEM_B,
          scanId: SCAN_B,
          version: '1.0.0',
          mssv: 'SV002',
          scannedAt: new Date('2026-11-02T10:00:00Z'),
        }),
      ],
    });

    const rows = await service.listViolations();
    expect(rows).toHaveLength(1);
    expect(rows[0].extensionId).toBe(EXT_ID);
    expect(rows[0].versionCount).toBe(1);
    expect(rows[0].incidentCount).toBe(2);
    expect(rows[0].studentCount).toBe(2);
    expect(rows[0].versions[0].incidents).toHaveLength(2);
    expect(rows[0].versions[0].incidents[0].studentMssv).toBe('SV002');
    expect(rows[0].versions[0].incidents[0].examSessionName).toBe('Thi CK 2026');
    expect(rows[0].versions[0].incidents[0].studentFullName).toBe('Tran Thi B');
  });

  it('drops pair after exact version approved', async () => {
    const { service } = createService({
      blocked: [
        makeBlockedItem({
          id: ITEM_A,
          scanId: SCAN_A,
          version: '1.0.0',
          mssv: 'SV001',
          scannedAt: new Date('2026-11-01T10:00:00Z'),
        }),
      ],
      approvedVersions: [{ identifier: EXT_ID, version: '1.0.0' }],
    });

    await expect(service.listViolations()).resolves.toEqual([]);
  });

  it('drops all versions of an id when * approved', async () => {
    const { service } = createService({
      blocked: [
        makeBlockedItem({
          id: ITEM_A,
          scanId: SCAN_A,
          version: '1.0.0',
          mssv: 'SV001',
          scannedAt: new Date('2026-11-01T10:00:00Z'),
        }),
        makeBlockedItem({
          id: ITEM_B,
          scanId: SCAN_B,
          version: '2.0.0',
          mssv: 'SV002',
          scannedAt: new Date('2026-11-02T10:00:00Z'),
        }),
      ],
      approvedVersions: [{ identifier: EXT_ID, version: '*' }],
    });

    await expect(service.listViolations()).resolves.toEqual([]);
  });

  it('filters incidents to examSessionId and enriches jplag/extract fields', async () => {
    const OTHER_EXAM = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
    const otherItem = makeBlockedItem({
      id: ITEM_B,
      scanId: SCAN_B,
      version: '1.0.0',
      mssv: 'SV002',
      scannedAt: new Date('2026-11-02T10:00:00Z'),
    });
    otherItem.scan.examSessionId = OTHER_EXAM;
    otherItem.scan.examSession = {
      id: OTHER_EXAM,
      name: 'Phiên khác',
      courseName: 'Lập trình Web',
    };

    const catalogVer = {
      id: 'ver-1',
      extensionPk: 'cat-1',
      version: '1.0.0',
      extractStatus: 'ready' as const,
      approvalStatus: 'pending',
      extension: undefined,
    };

    const jplagRuns = {
      find: jest.fn(async () => [
        {
          id: 'run-1',
          examSessionId: EXAM_ID,
          extensionIdentifier: EXT_ID,
          extensionVersion: '1.0.0',
          versionId: 'ver-1',
          kind: 'vs_model',
          status: 'completed',
          similarityText: 0.42,
          createdAt: new Date('2026-11-02T12:00:00Z'),
        },
      ]),
    };

    const versionsFind = jest
      .fn()
      .mockResolvedValueOnce([]) // approvedVersions
      .mockResolvedValueOnce([catalogVer]); // catalog versions by pk

    const scanItems = {
      find: jest.fn(async () => [
        makeBlockedItem({
          id: ITEM_A,
          scanId: SCAN_A,
          version: '1.0.0',
          mssv: 'SV001',
          scannedAt: new Date('2026-11-01T10:00:00Z'),
        }),
        otherItem,
      ]),
    };
    const students = {
      find: jest.fn(async () => [{ mssv: 'SV001', fullName: 'Nguyen Van A' }]),
    };
    const extensions = {
      find: jest.fn(async () => [
        {
          id: 'cat-1',
          identifier: EXT_ID,
          displayName: 'Evil Tool',
          publisher: 'evil',
          publishedAt: new Date('2026-01-01T00:00:00Z'),
          lastReleasedAt: new Date('2026-06-01T00:00:00Z'),
        },
      ]),
    };
    const courses = {
      find: jest.fn(async () => [{ id: COURSE_ID, name: 'Lập trình Web', code: 'WEB' }]),
    };
    const dataSource = { getRepository: jest.fn(() => courses) };
    const versions = { find: versionsFind };

    const service = new IdeExtensionsService(
      dataSource as never,
      {} as never,
      {} as never,
      extensions as never,
      versions as never,
      {} as never,
      {} as never,
      {} as never,
      scanItems as never,
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
      students as never,
      jplagRuns as never,
    );

    const rows = await service.listViolations(EXAM_ID);
    expect(rows).toHaveLength(1);
    expect(rows[0].incidentCount).toBe(1);
    expect(rows[0].versions[0].incidents[0].studentMssv).toBe('SV001');
    expect(rows[0].publishedAt).toBe('2026-06-01T00:00:00.000Z');
    expect(rows[0].jplagText).toBe(0.42);
    expect(rows[0].jplagStatus).toBe('completed');
    expect(rows[0].jplagRunId).toBe('run-1');
    expect(rows[0].primaryVersionId).toBe('ver-1');
    expect(rows[0].extractStatus).toBe('ready');
  });

  it('does not attach JPlag run from a different extension version', async () => {
    const catalogVer = {
      id: 'ver-1',
      extensionPk: 'cat-1',
      version: '1.0.0',
      extractStatus: 'ready' as const,
      approvalStatus: 'pending',
      extension: undefined,
    };

    const jplagRuns = {
      find: jest.fn(async () => [
        {
          id: 'run-other',
          examSessionId: EXAM_ID,
          extensionIdentifier: EXT_ID,
          extensionVersion: '2.0.0',
          versionId: 'ver-2',
          kind: 'vs_model',
          status: 'completed',
          similarityText: 0.99,
          createdAt: new Date('2026-11-02T12:00:00Z'),
        },
      ]),
    };

    const versionsFind = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([catalogVer]);

    const scanItems = {
      find: jest.fn(async () => [
        makeBlockedItem({
          id: ITEM_A,
          scanId: SCAN_A,
          version: '1.0.0',
          mssv: 'SV001',
          scannedAt: new Date('2026-11-01T10:00:00Z'),
        }),
      ]),
    };
    const students = {
      find: jest.fn(async () => [{ mssv: 'SV001', fullName: 'Nguyen Van A' }]),
    };
    const extensions = {
      find: jest.fn(async () => [
        {
          id: 'cat-1',
          identifier: EXT_ID,
          displayName: 'Evil Tool',
          publisher: 'evil',
          publishedAt: new Date('2026-01-01T00:00:00Z'),
          lastReleasedAt: new Date('2026-06-01T00:00:00Z'),
        },
      ]),
    };
    const courses = {
      find: jest.fn(async () => [{ id: COURSE_ID, name: 'Lập trình Web', code: 'WEB' }]),
    };
    const dataSource = { getRepository: jest.fn(() => courses) };
    const versions = { find: versionsFind };

    const service = new IdeExtensionsService(
      dataSource as never,
      {} as never,
      {} as never,
      extensions as never,
      versions as never,
      {} as never,
      {} as never,
      {} as never,
      scanItems as never,
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
      students as never,
      jplagRuns as never,
    );

    const rows = await service.listViolations(EXAM_ID);
    expect(rows).toHaveLength(1);
    expect(rows[0].primaryVersion).toBe('1.0.0');
    expect(rows[0].jplagText).toBeNull();
    expect(rows[0].jplagStatus).toBeNull();
    expect(rows[0].jplagRunId).toBeNull();
  });
});

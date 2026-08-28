import { Repository } from 'typeorm';
import { WorkstationsService } from './workstations.service';
import { WorkstationEntity } from '../entities/workstation.entity';
import { LabsService } from '../labs/labs.service';

describe('WorkstationsService', () => {
  let service: WorkstationsService;
  let workstationsRepo: Partial<Repository<WorkstationEntity>>;
  let labsService: Partial<LabsService>;

  beforeEach(() => {
    workstationsRepo = {
      create: jest.fn((dto) => dto as any) as any,
      save: jest.fn().mockImplementation(async (entity) => ({
        id: 'ws-uuid-1',
        ...entity,
      })),
      findOne: jest.fn().mockResolvedValue({
        id: 'ws-uuid-1',
        labId: 'lab-uuid-1',
        agentId: 'agent-uuid-1',
        assetCode: 'WS-01',
        hostname: 'ws01',
        macAddress: null,
        staticIpAddress: null,
        serialNumber: null,
        operatingSystem: null,
        isEnabled: true,
        type: 'client',
        status: 'available',
        notes: null,
        deletedAt: null,
      }),
      find: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      manager: {
        transaction: jest.fn(async (cb: (em: { getRepository: Function }) => unknown) =>
          cb({ getRepository: () => workstationsRepo }),
        ),
      },
    } as any;

    labsService = {
      findActiveOrThrow: jest.fn().mockResolvedValue({
        id: 'lab-uuid-1',
        code: 'LAB-01',
        name: 'Lab 1',
      } as any),
    };

    service = new WorkstationsService(
      workstationsRepo as Repository<WorkstationEntity>,
      labsService as LabsService,
    );
  });

  it('creates workstation with specified type (master)', async () => {
    const result = await service.create('lab-uuid-1', {
      assetCode: 'WS-MASTER-01',
      hostname: 'master-01',
      type: 'master',
    });

    expect(result).toEqual({ id: 'ws-uuid-1' });
    expect(workstationsRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        labId: 'lab-uuid-1',
        assetCode: 'WS-MASTER-01',
        hostname: 'master-01',
        type: 'master',
      }),
    );
  });

  it('creates workstation defaulting type to client', async () => {
    const result = await service.create('lab-uuid-1', {
      assetCode: 'WS-02',
      hostname: 'client-02',
    });

    expect(result).toEqual({ id: 'ws-uuid-1' });
    expect(workstationsRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'client',
      }),
    );
  });

  it('updates workstation type to master', async () => {
    const updated = await service.update('lab-uuid-1', 'ws-uuid-1', {
      type: 'master',
    });

    expect(workstationsRepo.update).toHaveBeenCalledWith(
      'ws-uuid-1',
      expect.objectContaining({
        type: 'master',
      }),
    );
    expect(updated).toBeDefined();
  });

  it('batch-renames workstations inside a transaction using two-phase updates', async () => {
    const ws1 = {
      id: 'ws-1',
      labId: 'lab-uuid-1',
      agentId: 'agent-1',
      assetCode: 'OLD-1',
      hostname: 'old-1',
      macAddress: null,
      staticIpAddress: null,
      serialNumber: null,
      operatingSystem: null,
      isEnabled: true,
      type: 'client' as const,
      status: 'available' as const,
      notes: null,
      deletedAt: null,
    };
    const ws2 = { ...ws1, id: 'ws-2', agentId: 'agent-2', assetCode: 'OLD-2', hostname: 'old-2' };
    const renamed = [
      { ...ws1, assetCode: 'FIT.H1.01', hostname: 'FIT.H1.01' },
      { ...ws2, assetCode: 'FIT.H1.02', hostname: 'FIT.H1.02' },
    ];

    (workstationsRepo.find as jest.Mock)
      .mockResolvedValueOnce([ws1, ws2])
      .mockResolvedValueOnce(renamed);

    const result = await service.batchRename('lab-uuid-1', {
      items: [
        { id: 'ws-1', assetCode: 'FIT.H1.01', hostname: 'FIT.H1.01' },
        { id: 'ws-2', assetCode: 'FIT.H1.02', hostname: 'FIT.H1.02' },
      ],
    });

    expect((workstationsRepo as any).manager.transaction).toHaveBeenCalled();
    expect(workstationsRepo.update).toHaveBeenCalledTimes(4);
    expect(result.total).toBe(2);
    expect(result.items.map((item) => item.assetCode)).toEqual([
      'FIT.H1.01',
      'FIT.H1.02',
    ]);
  });

  it('rejects batch rename when a workstation is missing from the lab', async () => {
    (workstationsRepo.find as jest.Mock).mockResolvedValueOnce([
      {
        id: 'ws-1',
        labId: 'lab-uuid-1',
        deletedAt: null,
      },
    ]);

    await expect(
      service.batchRename('lab-uuid-1', {
        items: [
          { id: 'ws-1', assetCode: 'FIT.H1.01' },
          { id: 'ws-missing', assetCode: 'FIT.H1.02' },
        ],
      }),
    ).rejects.toThrow('One or more workstations do not belong to this lab');
  });

  it('rejects duplicate target values in the payload', async () => {
    await expect(
      service.batchRename('lab-uuid-1', {
        items: [
          { id: 'ws-1', assetCode: 'FIT.H1.01' },
          { id: 'ws-2', assetCode: 'FIT.H1.01' },
        ],
      }),
    ).rejects.toThrow('This request conflicts with an existing record.');
  });
});

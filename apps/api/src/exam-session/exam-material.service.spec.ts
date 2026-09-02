import { Repository } from 'typeorm';
import { ExamMaterialService } from './exam-material.service';
import { ExamMaterialEntity } from './entities/exam-material.entity';
import { ExamSessionEntity } from './entities/exam-session.entity';
import { StorageService } from '../storage/storage.service';
import { ExamSessionEvents } from './exam-session.events';

/**
 * CLAUDE.md Security rule 2, tested at the only place it is decided.
 *
 * "Allowed into the lobby" and "allowed to see the exam" are different
 * questions. `agent:join` already refuses a session that has not started,
 * so over a socket the closed side of this gate is currently unreachable —
 * which is exactly why it is tested here instead of being taken on trust.
 * It is a second lock on the same door, and the second lock is the one that
 * still holds if the first is ever loosened (CLAUDE.md's own Phase 2 has
 * agents connecting and waiting).
 */
describe('ExamMaterialService — Security rule 2', () => {
  const START = new Date('2026-09-01T09:00:00.000Z');

  function harness(rows: Partial<ExamMaterialEntity>[]) {
    const materials = {
      find: jest.fn().mockResolvedValue(
        rows.map((row) => ({
          id: 'material-1',
          fileName: 'de-thi.pdf',
          fileSize: '1024',
          storageKey: 'materials/session-1/material-1',
          uploadedAt: START,
          ...row,
        })),
      ),
    };
    const storage = {
      generateDownloadUrl: jest
        .fn()
        .mockResolvedValue({ downloadUrl: 'https://signed', expiresIn: 300 }),
    };
    const events = { publishMaterialAdded: jest.fn() };
    const service = new ExamMaterialService(
      materials as unknown as Repository<ExamMaterialEntity>,
      storage as unknown as StorageService,
      events as unknown as ExamSessionEvents,
    );
    const session = { id: 'session-1', startTime: START } as ExamSessionEntity;
    return { service, session, materials, storage, events };
  }

  it('releases nothing one second before start_time', async () => {
    const { service, session, materials } = harness([{}]);

    const result = await service.listForAgent(session, new Date(START.getTime() - 1_000));

    expect(result.released).toBe(false);
    // Not "an empty list": the table was never even read, so there is no
    // path by which a filename or a signed URL could leak out of here.
    expect(materials.find).not.toHaveBeenCalled();
  });

  it('says WHEN, so an early agent can come back instead of polling', async () => {
    const { service, session } = harness([{}]);

    const result = await service.listForAgent(session, new Date(START.getTime() - 60_000));

    expect(result).toEqual({ released: false, releaseAt: START.toISOString() });
  });

  it('releases at exactly start_time', async () => {
    const { service, session } = harness([{}]);

    const result = await service.listForAgent(session, START);

    expect(result.released).toBe(true);
  });

  it('hands over a signed URL once released, never the bytes', async () => {
    const { service, session, storage } = harness([{}]);

    const result = await service.listForAgent(session, new Date(START.getTime() + 1_000));

    expect(result.released).toBe(true);
    if (!result.released) return;
    expect(result.materials[0]).toMatchObject({ fileName: 'de-thi.pdf', fileSize: 1024 });
    // Security rule 5: the file goes storage -> agent, never through here.
    expect(storage.generateDownloadUrl).toHaveBeenCalledWith('materials/session-1/material-1');
  });

  it('is not fooled by a session with no materials', async () => {
    const { service, session } = harness([]);

    const before = await service.listForAgent(session, new Date(START.getTime() - 1));
    const after = await service.listForAgent(session, new Date(START.getTime() + 1));

    // "Nothing to give" and "not yet" must stay distinguishable — an agent
    // that treats them alike either polls forever or never fetches.
    expect(before.released).toBe(false);
    expect(after.released).toBe(true);
    if (after.released) {
      expect(after.materials).toEqual([]);
    }
  });
});

/**
 * QA-reported gap: a student who joined before the teacher uploaded
 * anything got `examMaterialCount: 0` in their join ack and was never told
 * to ask again — permanently, short of a full reconnect. This pins the
 * server-side half of the fix: `create()` must publish the nudge every
 * time, unconditionally, since it has no way to know whether an agent is
 * already connected and stuck waiting.
 */
describe('ExamMaterialService.create — publishes the materials-updated nudge', () => {
  const START = new Date('2026-09-01T09:00:00.000Z');

  function harness() {
    const materials = {
      create: jest.fn((row) => row),
      save: jest.fn(async (row) => ({ ...row, uploadedAt: START })),
    };
    const storage = {
      buildMaterialKey: jest.fn(
        (examSessionId: string, examMaterialId: string) =>
          `materials/${examSessionId}/${examMaterialId}`,
      ),
      objectExists: jest.fn().mockResolvedValue(true),
      generateDownloadUrl: jest
        .fn()
        .mockResolvedValue({ downloadUrl: 'https://signed', expiresIn: 300 }),
    };
    const events = { publishMaterialAdded: jest.fn() };
    const service = new ExamMaterialService(
      materials as unknown as Repository<ExamMaterialEntity>,
      storage as unknown as StorageService,
      events as unknown as ExamSessionEvents,
    );
    const session = { id: 'session-1', startTime: START } as ExamSessionEntity;
    return { service, session, events };
  }

  it('publishes exactly one nudge, scoped to this session, after a successful create', async () => {
    const { service, session, events } = harness();

    await service.create(session, {
      examMaterialId: 'material-1',
      storageKey: 'materials/session-1/material-1',
      fileName: 'de-thi.pdf',
      fileSize: 1024,
    });

    expect(events.publishMaterialAdded).toHaveBeenCalledTimes(1);
    expect(events.publishMaterialAdded).toHaveBeenCalledWith({ examSessionId: 'session-1' });
  });

  it('does NOT publish when the storage key does not match — nothing was actually created', async () => {
    const { service, session, events } = harness();

    await expect(
      service.create(session, {
        examMaterialId: 'material-1',
        storageKey: 'someone-elses-key',
        fileName: 'de-thi.pdf',
        fileSize: 1024,
      }),
    ).rejects.toThrow();

    expect(events.publishMaterialAdded).not.toHaveBeenCalled();
  });
});

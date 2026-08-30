import { Repository } from 'typeorm';
import { ExamMaterialService } from './exam-material.service';
import { ExamMaterialEntity } from './entities/exam-material.entity';
import { ExamSessionEntity } from './entities/exam-session.entity';
import { StorageService } from '../storage/storage.service';

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
    const service = new ExamMaterialService(
      materials as unknown as Repository<ExamMaterialEntity>,
      storage as unknown as StorageService,
    );
    const session = { id: 'session-1', startTime: START } as ExamSessionEntity;
    return { service, session, materials, storage };
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

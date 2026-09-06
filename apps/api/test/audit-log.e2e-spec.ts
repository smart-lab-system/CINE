import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';
import { AppModule } from '../src/app.module';
import { AuditLogEntity } from '../src/admin/entities/audit-log.entity';
import { randomUUID } from 'node:crypto';
import { AuditLogService } from '../src/admin/audit-log.service';
import { createTestAccount } from './helpers/create-account';

/**
 * audit_log is the one table CLAUDE.md makes a hard security requirement
 * (rule 4: no path to edit a score without going through the log), and it
 * is also the trickiest table in the schema — RANGE-partitioned by
 * occurred_at, which forces a composite primary key, and guarded by an
 * append-only trigger.
 *
 * Nothing writes to it yet, so none of that had ever actually been
 * exercised. Both properties below were broken in ways that only showed up
 * against a real Postgres:
 *
 *  - AuditLogEntity declared `id` as the sole primary key, so every
 *    `migration:generate` emitted statements rewriting the real
 *    (occurred_at, id) key into PRIMARY KEY (id) — which would have
 *    dropped the partitioning and the append-only guarantee with it.
 *  - Leaving occurred_at to its `now()` default made a saved row
 *    unfindable by its own primary key, because Postgres stores
 *    microseconds and a JS Date only carries milliseconds.
 *
 * These run inside a transaction that is always rolled back: audit_log is
 * append-only by trigger, so a test row could not be deleted afterwards.
 */
describe('AuditLog (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let runner: QueryRunner;
  let actorId: string;
  let auditLog: AuditLogService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    dataSource = app.get(DataSource);
    auditLog = app.get(AuditLogService);

    actorId = await createTestAccount(dataSource, {
      email: `audit_actor_${Date.now()}@example.com`,
      password: 'correct-horse-battery',
      role: 'admin',
    });
  });

  beforeEach(async () => {
    runner = dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
  });

  afterEach(async () => {
    await runner.rollbackTransaction();
    await runner.release();
  });

  afterAll(async () => {
    await app.close();
  });

  function newEntry() {
    return {
      actorType: 'user' as const,
      actorId,
      action: 'grading_result.score_edited',
      targetType: 'grading_result',
      targetId: '00000000-0000-4000-8000-000000000001',
      oldValue: { finalScore: 7 },
      newValue: { finalScore: 8 },
    };
  }

  it('round-trips a row by its composite primary key', async () => {
    const repo = runner.manager.getRepository(AuditLogEntity);

    const saved = await repo.save(repo.create(newEntry()));
    expect(saved.id).toBeTruthy();
    expect(saved.occurredAt).toBeInstanceOf(Date);

    // The property that was broken: occurred_at is half the primary key, so
    // a value that comes back truncated makes the row unreachable through
    // the ORM even though it is sitting in the table.
    const found = await repo.findOne({
      where: { id: saved.id, occurredAt: saved.occurredAt },
    });
    expect(found).not.toBeNull();
    expect(found!.action).toBe('grading_result.score_edited');
    expect(found!.oldValue).toEqual({ finalScore: 7 });
    expect(found!.newValue).toEqual({ finalScore: 8 });
  });

  it('refuses to update an existing entry (append-only)', async () => {
    const repo = runner.manager.getRepository(AuditLogEntity);
    const saved = await repo.save(repo.create(newEntry()));

    // trg_audit_log_immutable. Without this the audit trail could be
    // rewritten after the fact, which is the whole thing rule 4 exists to
    // prevent.
    await expect(
      repo.update({ id: saved.id, occurredAt: saved.occurredAt }, { action: 'tampered' }),
    ).rejects.toThrow();
  });

  it('refuses to delete an existing entry (append-only)', async () => {
    const repo = runner.manager.getRepository(AuditLogEntity);
    const saved = await repo.save(repo.create(newEntry()));

    await expect(
      repo.delete({ id: saved.id, occurredAt: saved.occurredAt }),
    ).rejects.toThrow();
  });

  it('rejects a system entry that names an actor, and a user entry that does not', async () => {
    const repo = runner.manager.getRepository(AuditLogEntity);

    // ck_audit_log_actor. 'system' exists for events with no human behind
    // them (the scheduled finalize sweep, auto-flagging low confidence);
    // letting the two mix would make "who did this" unanswerable.
    await expect(
      repo.save(repo.create({ ...newEntry(), actorType: 'system' })),
    ).rejects.toThrow();

    await runner.rollbackTransaction();
    await runner.startTransaction();

    await expect(
      repo.save(
        repo.create({ ...newEntry(), actorType: 'user', actorId: null }),
      ),
    ).rejects.toThrow();
  });

  // Có hành động mà audit phải sống chết cùng nó. Đổi kỳ hiện hành đổi thứ MỌI
  // giảng viên trong trường nhìn thấy, nên một dòng audit nói về việc đã
  // rollback còn tệ hơn không có dòng nào — recordUserAction phải ghi được
  // TRONG transaction của caller, không phải bằng repository riêng của nó.
  it('không để lại dòng audit khi transaction bao ngoài rollback', async () => {
    const targetId = randomUUID();

    await expect(
      dataSource.transaction(async (manager) => {
        await auditLog.recordUserAction(
          {
            actorId,
            action: 'test.rolled_back',
            targetType: 'test',
            targetId,
          },
          manager,
        );
        throw new Error('force rollback');
      }),
    ).rejects.toThrow('force rollback');

    const rows = await dataSource.query(
      `SELECT 1 FROM examcollect.audit_log WHERE target_id = $1`,
      [targetId],
    );
    expect(rows).toHaveLength(0);
  });

  it('vẫn ghi bình thường khi không truyền manager', async () => {
    const targetId = randomUUID();
    await auditLog.recordUserAction({
      actorId,
      action: 'test.plain_write',
      targetType: 'test',
      targetId,
    });

    const rows = await dataSource.query(
      `SELECT action FROM examcollect.audit_log WHERE target_id = $1`,
      [targetId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe('test.plain_write');
  });
});

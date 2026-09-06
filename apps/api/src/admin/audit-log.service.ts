import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { AuditLogEntity } from './entities/audit-log.entity';

/**
 * The only way to write the audit trail.
 *
 * CLAUDE.md Security rule 4 exists for score edits, but the principle is
 * wider and this is its first real writer: whenever a human overrides a
 * rule the machine enforces, the override is recorded. `audit_log` is
 * append-only at the database level, so nothing here can update or delete —
 * there is deliberately no method for it.
 */
@Injectable()
export class AuditLogService {
  constructor(
    @InjectRepository(AuditLogEntity)
    private readonly entries: Repository<AuditLogEntity>,
  ) {}

  async recordUserAction(
    input: {
      actorId: string;
      action: string;
      targetType: string;
      targetId: string;
      oldValue?: Record<string, unknown>;
      newValue?: Record<string, unknown>;
    },
    // The caller's transaction, for when the act being recorded must not be
    // able to commit without its entry. Security rule 4 says there is no path
    // to a score edit that skips this book — and an entry written on a second
    // connection IS such a path: the edit commits, this write fails, and the
    // published score has changed with nobody's name against it.
    //
    // Defaults to the pool's own manager, which is what a caller outside a
    // transaction wants.
    manager: EntityManager = this.entries.manager,
  ): Promise<void> {
    const entries = manager.getRepository(AuditLogEntity);
    await entries.save(
      entries.create({
        actorType: 'user',
        actorId: input.actorId,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        oldValue: input.oldValue ?? {},
        newValue: input.newValue ?? {},
      }),
    );
  }
}

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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

  async recordUserAction(input: {
    actorId: string;
    action: string;
    targetType: string;
    targetId: string;
    oldValue?: Record<string, unknown>;
    newValue?: Record<string, unknown>;
  }): Promise<void> {
    await this.entries.save(
      this.entries.create({
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

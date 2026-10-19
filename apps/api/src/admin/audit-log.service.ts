import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { AuditLogEntity } from './entities/audit-log.entity';

export interface AuditLogItem {
  id: string;
  occurredAt: string;
  actorType: string;
  actorName: string | null;
  action: string;
  targetType: string;
  targetId: string;
  /** Tên các trường đã đổi (khoá của old/new). Không có giá trị. */
  changedFields: string[];
}

export interface AuditLogPage {
  items: AuditLogItem[];
  /** Cursor cho trang sau (`before`); null khi đã hết. */
  nextBefore: string | null;
}

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

  /**
   * Trang nhật ký cho admin, mới nhất trước. Chỉ trả TÊN các trường đã đổi, không trả giá trị cũ hay mới: chúng có thể
   * chứa dữ liệu nhạy cảm và màn đọc này không cần chúng để trả lời "ai đã làm gì, lúc nào".
   */
  async list(filter: {
    actions?: string[];
    actorId?: string;
    targetType?: string;
    from?: Date;
    before?: Date;
    limit: number;
  }): Promise<AuditLogPage> {
    const qb = this.entries
      .createQueryBuilder('e')
      .leftJoin('e.actor', 'actor')
      .addSelect(['actor.name'])
      .orderBy('e.occurredAt', 'DESC')
      .addOrderBy('e.id', 'DESC')
      .limit(filter.limit + 1);
    if (filter.actions?.length) qb.andWhere('e.action IN (:...actions)', { actions: filter.actions });
    if (filter.actorId) qb.andWhere('e.actorId = :actorId', { actorId: filter.actorId });
    if (filter.targetType) qb.andWhere('e.targetType = :targetType', { targetType: filter.targetType });
    if (filter.from) qb.andWhere('e.occurredAt >= :from', { from: filter.from });
    if (filter.before) qb.andWhere('e.occurredAt < :before', { before: filter.before });

    const rows = await qb.getMany();
    const page = rows.slice(0, filter.limit);
    const items: AuditLogItem[] = page.map((r) => ({
      id: r.id,
      occurredAt: r.occurredAt.toISOString(),
      actorType: r.actorType,
      actorName: r.actor?.name ?? null,
      action: r.action,
      targetType: r.targetType,
      targetId: r.targetId,
      changedFields: [...new Set([...Object.keys(r.oldValue ?? {}), ...Object.keys(r.newValue ?? {})])].sort(),
    }));
    const hasMore = rows.length > filter.limit;
    return { items, nextBefore: hasMore && items.length > 0 ? items[items.length - 1].occurredAt : null };
  }

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

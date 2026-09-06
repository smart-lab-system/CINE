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

  /**
   * `manager` ghi audit TRONG transaction của caller. Không truyền thì ghi
   * bằng repository riêng, đúng như trước.
   *
   * Cần thiết vì có hành động mà audit phải sống chết cùng nó: đổi kỳ hiện
   * hành đổi thứ MỌI giảng viên trong trường nhìn thấy, nên một dòng audit nói
   * về việc đã rollback còn tệ hơn không có dòng nào.
   *
   * Cả hai nhánh đều đi qua repository (`create` + `save`), không INSERT thô:
   * entity có PK phức hợp (occurred_at, id) trên bảng partition, và
   * `@BeforeInsert stampOccurredAt()` giữ cho JS Date và Postgres không lệch
   * độ chính xác. Insert thô ghi ra dòng không tìm lại được bằng chính khoá
   * của nó.
   */
  async recordUserAction(
    input: {
      actorId: string;
      action: string;
      targetType: string;
      targetId: string;
      oldValue?: Record<string, unknown>;
      newValue?: Record<string, unknown>;
    },
    manager?: EntityManager,
  ): Promise<void> {
    const repo = manager ? manager.getRepository(AuditLogEntity) : this.entries;
    await repo.save(
      repo.create({
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

import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../shared/base.entity';

/**
 * *"Tiêu chí này không có luật trừ"* (§4.2, T-FLOOR-6). Bảng riêng, vì `rubric_criterion` bị khoá
 * ngay khi rubric có kết quả chấm — đúng lúc giảng viên cần đánh dấu. Chỉ gỡ được, một lần.
 */
@Entity({ name: 'criterion_waiver' })
export class CriterionWaiverEntity extends BaseEntity {
  @Column({ name: 'rubric_id', type: 'uuid' })
  rubricId!: string;

  @Column({ name: 'criterion_key', type: 'text' })
  criterionKey!: string;

  @Column({ name: 'set_by', type: 'uuid' })
  setBy!: string;

  @Column({ name: 'set_at', type: 'timestamptz', default: () => 'now()' })
  setAt!: Date;

  @Column({ name: 'revoked_by', type: 'uuid', nullable: true })
  revokedBy!: string | null;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;
}

import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../shared/base.entity';

/**
 * Dòng áp dụng: lỗi `errorRuleId` nằm trong rubric `rubricName` (theo TÊN, qua mọi phiên bản) thuộc tiêu
 * chí `criterionKey` (spec §2.2). Không xoá dòng (`trg_rubric_error_no_delete`): gỡ là đặt `removedAt`.
 */
@Entity({ name: 'rubric_error' })
@Index('uq_rubric_error', ['teacherId', 'rubricName', 'errorRuleId'], { unique: true })
export class RubricErrorEntity extends BaseEntity {
  @Column({ name: 'teacher_id', type: 'uuid' })
  teacherId!: string;

  @Column({ name: 'rubric_name', type: 'text' })
  rubricName!: string;

  @Column({ name: 'error_rule_id', type: 'uuid' })
  errorRuleId!: string;

  @Column({ name: 'criterion_key', type: 'text' })
  criterionKey!: string;

  @Column({ name: 'removed_at', type: 'timestamptz', nullable: true })
  removedAt!: Date | null;
}

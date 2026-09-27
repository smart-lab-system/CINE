import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../shared/base.entity';
import { ERROR_RULE_ORIGINS, ERROR_RULE_STATES, ErrorRuleOrigin, ErrorRuleState } from '../grading-model.types';

/**
 * Một luật lỗi của MỘT giảng viên (§14.1). `proposed` = *luật còn thiếu* agent báo; `dismissed` =
 * *"không phải lỗi"*. Không xoá dòng nào (`trg_error_rule_no_delete`): hồ sơ trỏ vào nó vĩnh viễn.
 * Tên, mô tả, tiêu chí, điều kiện sống ở bản sửa (`error_rule_revision`), không ở đây.
 */
@Entity({ name: 'error_rule' })
@Index('uq_error_rule_teacher_key', ['teacherId', 'ruleKey'], { unique: true })
export class ErrorRuleEntity extends BaseEntity {
  @Column({ name: 'teacher_id', type: 'uuid' })
  teacherId!: string;

  @Column({ name: 'rule_key', type: 'text' })
  ruleKey!: string;

  @Column({ type: 'enum', enum: ERROR_RULE_STATES, enumName: 'error_rule_state', default: 'proposed' })
  state!: ErrorRuleState;

  @Column({ type: 'enum', enum: ERROR_RULE_ORIGINS, enumName: 'error_rule_origin' })
  origin!: ErrorRuleOrigin;

  @Column({ name: 'current_revision_id', type: 'uuid', nullable: true })
  currentRevisionId!: string | null;
}

import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../shared/base.entity';
import { AccountEntity } from '../../identity/entities/account.entity';
import { DeliverableType } from '../../exam-session/entities/required-deliverable.entity';

// Chỉ còn phạm vi TOÀN CỤC.
//
// Từng có thêm 'course', với `scopeId` là khoá ngoại tới một môn học. Đợt
// thu hẹp master data bỏ bảng `course`, nên phạm vi ấy không còn thứ gì để
// trỏ tới. `ContractMasterData` xoá các dòng mang nó (không có dòng nào)
// và siết CHECK còn global; nhãn enum 'course' vẫn nằm trong kiểu Postgres
// vì gỡ một nhãn khỏi enum đang dùng đòi dựng lại cả kiểu, không đáng cho
// một giá trị mà CHECK đã chặn.
export type GradingPipelineScope = 'global';

// Operationalizes CLAUDE.md's "model cascade" (cheap model first, escalate
// only the low-confidence remainder to a stronger model) as admin-editable
// config instead of a hardcoded constant.
@Entity({ name: 'grading_pipeline_config' })
@Index(
  'uq_grading_pipeline_config_scope_deliverable',
  ['scopeType', 'scopeId', 'deliverableType'],
  { unique: true },
)
@Check(
  'ck_grading_pipeline_config_scope',
  "scope_type = 'global' AND scope_id IS NULL",
)
export class GradingPipelineConfigEntity extends BaseEntity {
  @Column({
    name: 'scope_type',
    type: 'enum',
    // Nhãn 'course' còn trong kiểu Postgres nhưng CHECK ở trên không cho
    // ghi nó nữa — xem docblock đầu file.
    enum: ['global', 'course'],
    enumName: 'grading_pipeline_scope',
  })
  scopeType!: GradingPipelineScope;

  /** Luôn null: chỉ còn phạm vi toàn cục. Cột ở lại để không phải viết một
   *  migration đổi hình bảng cho một giá trị vốn đã luôn rỗng. */
  @Column({ name: 'scope_id', type: 'uuid', nullable: true })
  scopeId!: string | null;

  // Reuses required_deliverable's `deliverable_type` Postgres enum — same
  // set of values, one config row per deliverable type per scope.
  @Column({
    name: 'deliverable_type',
    type: 'enum',
    enum: ['document', 'code_project', 'image'],
    enumName: 'deliverable_type',
  })
  deliverableType!: DeliverableType;

  @Column({ name: 'primary_model', type: 'varchar', length: 100 })
  primaryModel!: string;

  @Column({ name: 'escalation_model', type: 'varchar', length: 100, nullable: true })
  escalationModel!: string | null;

  @Column({
    name: 'confidence_threshold',
    type: 'numeric',
    precision: 4,
    scale: 3,
    nullable: true,
  })
  confidenceThreshold!: string | null;

  @Column({ name: 'updated_by', type: 'uuid' })
  updatedBy!: string;

  @ManyToOne(() => AccountEntity, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'updated_by' })
  updatedByAccount!: AccountEntity;
}

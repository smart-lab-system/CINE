import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../shared/base.entity';
import { ExamSessionEntity } from './exam-session.entity';

export type DeliverableType = 'document' | 'code_project' | 'image';

// The single source of truth for submission identity, decided BEFORE the
// exam takes place — never guessed at collection time. A submitted file
// must match `requiredFilename` EXACTLY.
@Entity({ name: 'required_deliverable' })
@Index(
  'uq_required_deliverable_session_filename',
  ['examSessionId', 'requiredFilename'],
  { unique: true },
)
export class RequiredDeliverableEntity extends BaseEntity {
  @Column({ name: 'exam_session_id', type: 'uuid' })
  examSessionId!: string;

  @ManyToOne(() => ExamSessionEntity, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'exam_session_id' })
  examSession!: ExamSessionEntity;

  @Column({ name: 'required_filename', type: 'varchar', length: 255 })
  requiredFilename!: string;

  @Column({
    name: 'deliverable_type',
    type: 'enum',
    enum: ['document', 'code_project', 'image'],
    enumName: 'deliverable_type',
  })
  deliverableType!: DeliverableType;
}

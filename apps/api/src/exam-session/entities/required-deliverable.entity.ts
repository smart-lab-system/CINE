import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../shared/base.entity';
import { ExamSessionEntity } from './exam-session.entity';
import { DECLARED_LANGUAGES, DeclaredLanguage } from '../declared-language';

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

  /**
   * Null = chưa khai → bài đi đường `one_shot` (§14.1). Hệ thống không đoán ngôn ngữ từ đuôi
   * file. Ràng buộc `ck_required_deliverable_language`: chỉ bài `code_project` mang ngôn ngữ.
   */
  @Column({ type: 'enum', enum: DECLARED_LANGUAGES, enumName: 'sandbox_language', nullable: true })
  language!: DeclaredLanguage | null;
}

import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../shared/base.entity';

export type IdeExtensionJplagRunKind = 'vs_model' | 'vs_student';
export type IdeExtensionJplagRunStatus = 'pending' | 'running' | 'completed' | 'failed';
export type IdeExtensionJplagRunTrigger = 'scan' | 'submission' | 'manual';

@Entity({ name: 'ide_extension_jplag_run' })
@Index('idx_jplag_run_session', ['examSessionId'])
export class IdeExtensionJplagRunEntity extends BaseEntity {
  @Column({ name: 'exam_session_id', type: 'uuid' })
  examSessionId!: string;

  @Column({ name: 'extension_pk', type: 'uuid', nullable: true })
  extensionPk!: string | null;

  @Column({ name: 'version_id', type: 'uuid', nullable: true })
  versionId!: string | null;

  @Column({ name: 'extension_identifier', type: 'varchar', length: 200 })
  extensionIdentifier!: string;

  @Column({ name: 'extension_version', type: 'varchar', length: 50, nullable: true })
  extensionVersion!: string | null;

  @Column({
    type: 'enum',
    enum: ['vs_model', 'vs_student'],
    enumName: 'ide_extension_jplag_run_kind',
  })
  kind!: IdeExtensionJplagRunKind;

  @Column({
    type: 'enum',
    enum: ['pending', 'running', 'completed', 'failed'],
    enumName: 'ide_extension_jplag_run_status',
    default: 'pending',
  })
  status!: IdeExtensionJplagRunStatus;

  @Column({
    name: 'trigger',
    type: 'enum',
    enum: ['scan', 'submission', 'manual'],
    enumName: 'ide_extension_jplag_run_trigger',
  })
  trigger!: IdeExtensionJplagRunTrigger;

  @Column({ type: 'varchar', length: 32, nullable: true })
  language!: string | null;

  @Column({ name: 'student_mssv', type: 'varchar', length: 50, nullable: true })
  studentMssv!: string | null;

  @Column({ name: 'required_deliverable_id', type: 'uuid', nullable: true })
  requiredDeliverableId!: string | null;

  @Column({ name: 'submission_id', type: 'uuid', nullable: true })
  submissionId!: string | null;

  @Column({ name: 'similarity_text', type: 'double precision', nullable: true })
  similarityText!: number | null;

  @Column({ name: 'similarity_language', type: 'double precision', nullable: true })
  similarityLanguage!: number | null;

  @Column({ name: 'report_text_key', type: 'varchar', nullable: true })
  reportTextKey!: string | null;

  @Column({ name: 'report_language_key', type: 'varchar', nullable: true })
  reportLanguageKey!: string | null;

  @Column({ name: 'comparison_text_key', type: 'varchar', nullable: true })
  comparisonTextKey!: string | null;

  @Column({ name: 'comparison_language_key', type: 'varchar', nullable: true })
  comparisonLanguageKey!: string | null;

  @Column({ type: 'text', nullable: true })
  error!: string | null;
}

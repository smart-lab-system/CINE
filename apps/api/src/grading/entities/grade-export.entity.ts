import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../shared/base.entity';
import { AccountEntity } from '../../identity/entities/account.entity';
import { ExamSessionEntity } from '../../exam-session/entities/exam-session.entity';

// Writes scores back INTO the teacher's own gradebook template, not just a
// fresh export — mssv/score column are explicit teacher input per
// CLAUDE.md's "don't guess" principle, never inferred by scanning headers.
// `outputStorageKey` is nullable: the row is created when the export is
// requested, then filled in once the fill-template job finishes.
@Entity({ name: 'grade_export' })
export class GradeExportEntity extends BaseEntity {
  @Column({ name: 'exam_session_id', type: 'uuid' })
  examSessionId!: string;

  @ManyToOne(() => ExamSessionEntity, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'exam_session_id' })
  examSession!: ExamSessionEntity;

  @Column({ name: 'exported_by', type: 'uuid' })
  exportedBy!: string;

  @ManyToOne(() => AccountEntity, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'exported_by' })
  exportedByAccount!: AccountEntity;

  @Column({ name: 'template_storage_key', type: 'text' })
  templateStorageKey!: string;

  @Column({ name: 'output_storage_key', type: 'text', nullable: true })
  outputStorageKey!: string | null;

  @Column({ name: 'mssv_column', type: 'varchar', length: 20 })
  mssvColumn!: string;

  @Column({ name: 'score_column', type: 'varchar', length: 20 })
  scoreColumn!: string;

  @Column({ name: 'unmatched_mssv_count', type: 'int', default: 0 })
  unmatchedMssvCount!: number;

  @Column({ name: 'exported_at', type: 'timestamptz', nullable: true })
  exportedAt!: Date | null;
}

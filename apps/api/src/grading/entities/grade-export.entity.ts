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

  // ---- Ghi điểm vào sổ điểm (migration 1789530000000). Bản ghi của MỘT lượt xuất; chỉ-thêm.
  @Column({ name: 'sheet_name', type: 'varchar', length: 31, nullable: true })
  sheetName!: string | null;

  @Column({ name: 'first_data_row', type: 'int', nullable: true })
  firstDataRow!: number | null;

  @Column({ name: 'reason_column', type: 'varchar', length: 20, nullable: true })
  reasonColumn!: string | null;

  /** Null khi phiên chỉ có một yêu cầu nộp. */
  @Column({ name: 'required_deliverable_id', type: 'uuid', nullable: true })
  requiredDeliverableId!: string | null;

  /** Phần trăm điểm: 1 = không làm tròn, 10, 25, 50 (§13.1 luật 7). */
  @Column({ name: 'rounding_step_hundredths', type: 'int', default: 1 })
  roundingStepHundredths!: number;

  @Column({ name: 'rounding_mode', type: 'text', default: 'half_up' })
  roundingMode!: string;

  @Column({ name: 'written_count', type: 'int', default: 0 })
  writtenCount!: number;

  @Column({ name: 'blank_count', type: 'int', default: 0 })
  blankCount!: number;

  @Column({ name: 'overwrite_count', type: 'int', default: 0 })
  overwriteCount!: number;

  @Column({ name: 'decrease_count', type: 'int', default: 0 })
  decreaseCount!: number;

  /** Người xác nhận các bài bị giảm điểm (§13.1 luật 4). Null khi không có bài giảm. */
  @Column({ name: 'decrease_confirmed_by', type: 'uuid', nullable: true })
  decreaseConfirmedBy!: string | null;

  @Column({ name: 'template_file_name', type: 'varchar', length: 255, nullable: true })
  templateFileName!: string | null;

  @Column({ name: 'output_file_name', type: 'varchar', length: 255, nullable: true })
  outputFileName!: string | null;
}

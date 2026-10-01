import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { GradeExportEntity } from '../../grading/entities/grade-export.entity';
import { BLANK_REASONS, type BlankReason } from '../grade-export.types';

/**
 * Bản chụp MỘT sinh viên của một lượt xuất (parent §13.1 luật 2, §14.1). Chỉ thêm.
 * Hoặc đã ghi điểm (`written_hundredths`), hoặc để trống kèm lý do (`blank_reason`) — không bao giờ cả hai
 * hay không cái nào (`ck_grade_export_row_one_of`). `mssv` là MSSV CỦA PHIÊN, không phải chữ trong file.
 */
@Entity({ name: 'grade_export_row' })
@Index('uq_grade_export_row_mssv', ['gradeExportId', 'mssv'], { unique: true })
export class GradeExportRowEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'grade_export_id', type: 'uuid' })
  gradeExportId!: string;

  @ManyToOne(() => GradeExportEntity, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'grade_export_id' })
  gradeExport!: GradeExportEntity;

  @Column({ name: 'file_row', type: 'int' })
  fileRow!: number;

  @Column({ name: 'mssv', type: 'citext' })
  mssv!: string;

  @Column({ name: 'written_hundredths', type: 'int', nullable: true })
  writtenHundredths!: number | null;

  @Column({ name: 'blank_reason', type: 'enum', enum: BLANK_REASONS, enumName: 'grade_export_blank_reason', nullable: true })
  blankReason!: BlankReason | null;

  @Column({ name: 'score_computation_id', type: 'uuid', nullable: true })
  scoreComputationId!: string | null;
}

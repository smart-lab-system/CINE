import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** Nơi agent đã thấy một lỗi chưa có luật (spec D5). Nhật ký, không phải hồ sơ kiểm toán. */
@Entity({ name: 'error_rule_sighting' })
@Index('uq_sighting', ['errorRuleId', 'gradingResultId'], { unique: true })
export class ErrorRuleSightingEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'teacher_id', type: 'uuid' })
  teacherId!: string;

  @Column({ name: 'error_rule_id', type: 'uuid' })
  errorRuleId!: string;

  @Column({ name: 'grading_result_id', type: 'uuid' })
  gradingResultId!: string;

  @Column({ name: 'exam_session_id', type: 'uuid' })
  examSessionId!: string;

  @Column({ name: 'rubric_name', type: 'text' })
  rubricName!: string;
}

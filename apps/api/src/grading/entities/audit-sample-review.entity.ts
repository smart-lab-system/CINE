import { Column, Entity, PrimaryColumn } from 'typeorm';

/** Nhận xét kiểm mẫu (§8.1): ghi rồi thì khoá. Chỉ thêm. */
@Entity({ name: 'audit_sample_review' })
export class AuditSampleReviewEntity {
  @PrimaryColumn({ name: 'grading_result_id', type: 'uuid' })
  gradingResultId!: string;

  @Column({ name: 'teacher_id', type: 'uuid' })
  teacherId!: string;

  @Column({ name: 'picked_rule_ids', type: 'uuid', array: true, default: () => "'{}'" })
  pickedRuleIds!: string[];

  @Column({ name: 'extra_errors', type: 'text', array: true, default: () => "'{}'" })
  extraErrors!: string[];

  @Column({ name: 'recorded_at', type: 'timestamptz', default: () => 'now()' })
  recordedAt!: Date;
}

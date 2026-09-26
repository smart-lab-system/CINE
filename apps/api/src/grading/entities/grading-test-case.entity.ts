import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** Một ca của một phiên bản gói test. Chỉ thêm. */
@Entity({ name: 'grading_test_case' })
export class GradingTestCaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'bundle_id', type: 'uuid' })
  bundleId!: string;

  /** Tên ca của hợp đồng sandbox: chữ, số, "_", "-", tối đa 64 ký tự. */
  @Column({ name: 'case_key', type: 'text' })
  caseKey!: string;

  @Column({ name: 'group', type: 'text' })
  group!: string;

  @Column({ type: 'text' })
  input!: string;

  @Column({ name: 'expected_output', type: 'text' })
  expectedOutput!: string;

  /** Câu trong đề mà ca này dựa vào (§2.1) — null với ca giảng viên tự viết. */
  @Column({ name: 'constraint_quote', type: 'text', nullable: true })
  constraintQuote!: string | null;

  @Column({ name: 'auto_dropped_reason', type: 'text', nullable: true })
  autoDroppedReason!: string | null;
}

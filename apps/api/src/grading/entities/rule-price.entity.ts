import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

/** Một giá trong một phiên bản bảng giá. Null = chưa có giá (§2.1). Chỉ thêm. */
@Entity({ name: 'rule_price' })
export class RulePriceEntity {
  @PrimaryColumn({ name: 'price_table_version_id', type: 'uuid' })
  priceTableVersionId!: string;

  @PrimaryColumn({ name: 'error_rule_id', type: 'uuid' })
  errorRuleId!: string;

  /** Chỉ để hai khoá ngoại ghép chặn giá trỏ luật của người khác. */
  @Column({ name: 'teacher_id', type: 'uuid' })
  teacherId!: string;

  @Column({ type: 'numeric', precision: 6, scale: 2, nullable: true })
  deduction!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}

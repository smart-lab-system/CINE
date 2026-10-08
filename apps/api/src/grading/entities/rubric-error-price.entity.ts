import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

/** Giá của một dòng áp dụng trong một phiên bản bảng giá. Null = chưa có giá (§2.1). Chỉ thêm. */
@Entity({ name: 'rubric_error_price' })
export class RubricErrorPriceEntity {
  @PrimaryColumn({ name: 'price_table_version_id', type: 'uuid' })
  priceTableVersionId!: string;

  @PrimaryColumn({ name: 'rubric_error_id', type: 'uuid' })
  rubricErrorId!: string;

  /** Chỉ để hai khoá ngoại ghép chặn giá trỏ dòng của giảng viên khác. */
  @Column({ name: 'teacher_id', type: 'uuid' })
  teacherId!: string;

  @Column({ type: 'numeric', precision: 6, scale: 2, nullable: true })
  deduction!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}

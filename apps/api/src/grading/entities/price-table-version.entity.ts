import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** Mỗi lần sửa giá là một phiên bản mới của bảng giá của giảng viên đó (§2.2). Chỉ thêm. */
@Entity({ name: 'price_table_version' })
export class PriceTableVersionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'teacher_id', type: 'uuid' })
  teacherId!: string;

  @Column({ type: 'int' })
  version!: number;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy!: string;
}

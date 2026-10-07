import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../shared/base.entity';

export type NominalClassStatus = 'active' | 'inactive';

/**
 * Lớp danh nghĩa / hành chính — KHÁC `class` (lớp môn do giảng viên sở hữu).
 * Catalog độc lập; chưa gắn enrollment hay exam_session.
 */
@Entity({ name: 'nominal_class' })
export class NominalClassEntity extends BaseEntity {
  @Index('uq_nominal_class_code', { unique: true })
  @Column({ type: 'varchar', length: 50 })
  code!: string;

  @Column({ type: 'varchar', length: 150, nullable: true })
  name!: string | null;

  @Column({ name: 'cohort_year', type: 'int', nullable: true })
  cohortYear!: number | null;

  @Column({
    type: 'enum',
    enum: ['active', 'inactive'],
    enumName: 'nominal_class_status',
  })
  status!: NominalClassStatus;
}

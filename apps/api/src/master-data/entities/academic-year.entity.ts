import { Check, Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../shared/base.entity';

export type AcademicYearStatus = 'planned' | 'active' | 'closed';

@Entity({ name: 'academic_year' })
@Check('ck_academic_year_dates', '"end_date" > "start_date"')
export class AcademicYearEntity extends BaseEntity {
  @Index('uq_academic_year_code', { unique: true })
  @Column({ type: 'varchar', length: 20 })
  code!: string;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ name: 'start_date', type: 'date' })
  startDate!: string;

  @Column({ name: 'end_date', type: 'date' })
  endDate!: string;

  @Column({
    type: 'enum',
    enum: ['planned', 'active', 'closed'],
    enumName: 'academic_year_status',
  })
  status!: AcademicYearStatus;
}

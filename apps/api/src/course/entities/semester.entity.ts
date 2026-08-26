import { Check, Column, Entity } from 'typeorm';
import { BaseEntity } from '../../shared/base.entity';

@Entity({ name: 'semester' })
@Check('ck_semester_dates', 'end_date >= start_date')
export class SemesterEntity extends BaseEntity {
  @Column({ type: 'varchar', length: 150 })
  name!: string;

  @Column({ name: 'start_date', type: 'date' })
  startDate!: string;

  @Column({ name: 'end_date', type: 'date' })
  endDate!: string;
}

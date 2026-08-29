import { Check, Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../shared/base.entity';

@Entity({ name: 'semester' })
@Check('ck_semester_dates', 'end_date >= start_date')
export class SemesterEntity extends BaseEntity {
  // Unique because every Trưởng khoa can create terms in one shared
  // namespace; two "Học kỳ 1 2026-2027" rows would split one real term in
  // two, and nothing on screen would show it.
  @Index('uq_semester_name', { unique: true })
  @Column({ type: 'varchar', length: 150 })
  name!: string;

  @Column({ name: 'start_date', type: 'date' })
  startDate!: string;

  @Column({ name: 'end_date', type: 'date' })
  endDate!: string;
}

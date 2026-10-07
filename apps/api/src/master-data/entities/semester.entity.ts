import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../shared/base.entity';
import { AcademicYearEntity } from './academic-year.entity';

export type SemesterStatus = 'planned' | 'active' | 'closed';

@Entity({ name: 'semester' })
@Index('uq_semester_year_code', ['academicYearId', 'code'], { unique: true })
@Check('ck_semester_dates', '"end_date" > "start_date"')
export class SemesterEntity extends BaseEntity {
  @Column({ name: 'academic_year_id', type: 'uuid' })
  academicYearId!: string;

  @ManyToOne(() => AcademicYearEntity, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'academic_year_id' })
  academicYear!: AcademicYearEntity;

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
    enumName: 'semester_status',
  })
  status!: SemesterStatus;
}

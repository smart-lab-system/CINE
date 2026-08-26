import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../shared/base.entity';
import { SemesterEntity } from './semester.entity';

@Entity({ name: 'course' })
@Index('uq_course_semester_code', ['semesterId', 'code'], { unique: true })
export class CourseEntity extends BaseEntity {
  @Column({ type: 'citext' })
  code!: string;

  @Column({ type: 'varchar', length: 200 })
  name!: string;

  @Column({ name: 'semester_id', type: 'uuid' })
  semesterId!: string;

  @ManyToOne(() => SemesterEntity, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'semester_id' })
  semester!: SemesterEntity;
}

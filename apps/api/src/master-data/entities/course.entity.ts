import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../shared/base.entity';

export type CourseStatus = 'active' | 'inactive';

@Entity({ name: 'course' })
export class CourseEntity extends BaseEntity {
  @Index('uq_course_code', { unique: true })
  @Column({ type: 'varchar', length: 50 })
  code!: string;

  @Column({ type: 'varchar', length: 200 })
  name!: string;

  @Column({
    type: 'enum',
    enum: ['active', 'inactive'],
    enumName: 'course_status',
  })
  status!: CourseStatus;
}

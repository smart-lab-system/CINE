import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../shared/base.entity';
import { AccountEntity } from '../../identity/entities/account.entity';
import { CourseEntity } from './course.entity';

// "Lớp môn học" (course section) — not in CLAUDE.md's original schema sketch,
// which only had a loose `home_class_id` string on ClassRoster/Enrollment/
// Submission with no table behind it. Added here as the FK target those
// columns need to be a valid schema.
@Entity({ name: 'class' })
@Index('uq_class_course_name', ['courseId', 'name'], { unique: true })
export class ClassEntity extends BaseEntity {
  @Column({ name: 'course_id', type: 'uuid' })
  courseId!: string;

  @ManyToOne(() => CourseEntity, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'course_id' })
  course!: CourseEntity;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ name: 'teacher_id', type: 'uuid' })
  teacherId!: string;

  @ManyToOne(() => AccountEntity, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'teacher_id' })
  teacher!: AccountEntity;
}

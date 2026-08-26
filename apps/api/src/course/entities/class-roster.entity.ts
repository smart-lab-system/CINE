import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../shared/base.entity';
import { CourseEntity } from './course.entity';
import { ClassEntity } from './class.entity';

// Raw roster imported once from Excel per course — the source list, not
// itself used for session-join authentication (see EnrollmentEntity).
@Entity({ name: 'class_roster' })
@Index('uq_class_roster_course_student', ['courseId', 'studentMssv'], {
  unique: true,
})
@Check('ck_class_roster_mssv', "student_mssv ~ '^[A-Za-z0-9]{4,20}$'")
export class ClassRosterEntity extends BaseEntity {
  @Column({ name: 'course_id', type: 'uuid' })
  courseId!: string;

  @ManyToOne(() => CourseEntity, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'course_id' })
  course!: CourseEntity;

  @Column({ name: 'home_class_id', type: 'uuid' })
  homeClassId!: string;

  @ManyToOne(() => ClassEntity, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'home_class_id' })
  homeClass!: ClassEntity;

  @Column({ name: 'student_mssv', type: 'citext' })
  studentMssv!: string;

  @Column({ name: 'student_name', type: 'varchar', length: 150 })
  studentName!: string;
}

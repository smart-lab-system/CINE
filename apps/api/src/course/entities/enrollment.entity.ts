import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../shared/base.entity';
import { AccountEntity } from '../../identity/entities/account.entity';
import { CourseEntity } from './course.entity';
import { ClassEntity } from './class.entity';

// The authoritative join-session auth source, INDEPENDENT of which
// room/class a student physically sits in — this is what resolves the
// make-up-exam-in-a-different-class case. A leaked session code alone must
// never grant access; the API must always check the student has a valid
// Enrollment for the exact course_id (CLAUDE.md Security rule 1).
@Entity({ name: 'enrollment' })
@Index('uq_enrollment_course_student', ['courseId', 'studentMssv'], {
  unique: true,
})
@Check('ck_enrollment_mssv', "student_mssv ~ '^[A-Za-z0-9]{4,20}$'")
export class EnrollmentEntity extends BaseEntity {
  @Column({ name: 'student_mssv', type: 'citext' })
  studentMssv!: string;

  // Absorbed from class_roster, which carried the same natural key
  // (course_id, student_mssv) over the same rows from the same Excel file
  // and is dropped in a later phase. This is the authoritative spelling of
  // the student's name: agent:join answers with it rather than asking the
  // student to type their own name, so there is never a typed value to
  // reconcile against this one.
  @Column({ name: 'student_name', type: 'varchar', length: 150 })
  studentName!: string;

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

  @Column({ name: 'home_teacher_id', type: 'uuid' })
  homeTeacherId!: string;

  @ManyToOne(() => AccountEntity, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'home_teacher_id' })
  homeTeacher!: AccountEntity;
}

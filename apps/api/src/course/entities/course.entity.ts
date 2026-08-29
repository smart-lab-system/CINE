import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { AccountEntity } from '../../identity/entities/account.entity';
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

  /**
   * The Trưởng khoa who owns this course, and the whole of the department
   * scoping model — class, exam_session and enrollment all reach it through
   * course_id, so nothing else needs a scope column.
   *
   * Nullable means "no owner yet", not "belongs to everyone": an unowned
   * course is listed to no Trưởng khoa at all. Admin has a dedicated view of
   * these so they cannot go quiet.
   */
  @Index('idx_course_department_head')
  @Column({ name: 'department_head_id', type: 'uuid', nullable: true })
  departmentHeadId!: string | null;

  @ManyToOne(() => AccountEntity, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'department_head_id' })
  departmentHead!: AccountEntity | null;

  @ManyToOne(() => SemesterEntity, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'semester_id' })
  semester!: SemesterEntity;
}

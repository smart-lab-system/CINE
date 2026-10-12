import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../shared/base.entity';
import { AccountEntity } from '../../identity/entities/account.entity';
import { CourseEntity } from '../../master-data/entities/course.entity';
import { NominalClassEntity } from '../../master-data/entities/nominal-class.entity';
import { SemesterEntity } from '../../master-data/entities/semester.entity';

/**
 * Lớp học phần (course section).
 *
 * Sau đợt admin course-section: admin tạo lớp gắn catalog môn + kỳ, gắn
 * roster, rồi phân công `teacher_id`. NULL = chưa phân công — không hiện
 * ở「Lớp của tôi」, không mở được phiên từ lớp đó.
 *
 * `name` = mã lớp = `{course.code}{xxx}` (xxx = 001, 002… thứ tự lớp được
 * tạo trong học kỳ đó; được phép trùng giữa các học kỳ khác nhau).
 *
 * `course_name` vẫn là snapshot text (auth / thi bù / sibling roster).
 * Lớp mới: copy từ `course.name`. Lớp legacy: có thể còn hằng COURSE_NAME
 * và `course_id`/`semester_id` NULL.
 */
@Entity({ name: 'class' })
@Index('uq_class_semester_course_name', ['semesterId', 'courseId', 'name'], {
  unique: true,
})
export class ClassEntity extends BaseEntity {
  @Column({ name: 'course_name', type: 'varchar', length: 200 })
  courseName!: string;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  /**
   * Giảng viên được phân công. NULL = admin chưa gán — lớp chưa vào
   * `/classes/teaching`.
   */
  @Column({ name: 'teacher_id', type: 'uuid', nullable: true })
  teacherId!: string | null;

  @ManyToOne(() => AccountEntity, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'teacher_id' })
  teacher!: AccountEntity | null;

  @Column({ name: 'course_id', type: 'uuid', nullable: true })
  courseId!: string | null;

  @ManyToOne(() => CourseEntity, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'course_id' })
  course!: CourseEntity | null;

  @Column({ name: 'semester_id', type: 'uuid', nullable: true })
  semesterId!: string | null;

  @ManyToOne(() => SemesterEntity, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'semester_id' })
  semester!: SemesterEntity | null;

  /** Lớp danh nghĩa catalog — tuỳ chọn; lớp legacy có thể NULL. */
  @Column({ name: 'nominal_class_id', type: 'uuid', nullable: true })
  nominalClassId!: string | null;

  @ManyToOne(() => NominalClassEntity, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'nominal_class_id' })
  nominalClass!: NominalClassEntity | null;
}

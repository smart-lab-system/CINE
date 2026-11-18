import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../shared/base.entity';
import { AccountEntity } from '../../identity/entities/account.entity';
import { CourseEntity } from '../../master-data/entities/course.entity';

// Versioned — editing mid-stream must create a new version (`version`
// increments); existing GradingResult rows keep the exact version they
// were graded against (CLAUDE.md Security rule 7). Once any GradingResult
// references a version, that version's criteria become immutable — see
// the guard trigger added in the hand-written migration (not expressible
// as an entity decorator).
@Entity({ name: 'rubric' })
@Index('uq_rubric_teacher_name_version', ['teacherId', 'name', 'version'], { unique: true })
@Index('idx_rubric_course', ['courseId'])
export class RubricEntity extends BaseEntity {
  /**
   * CHỦ SỞ HỮU LÀ GIẢNG VIÊN (`teacher_id`). `course_id` chỉ neo ngân hàng
   * tiêu chí theo môn (admin hub) — không thay quyền sửa/xóa.
   */
  @Column({ name: 'teacher_id', type: 'uuid' })
  teacherId!: string;

  @ManyToOne(() => AccountEntity, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'teacher_id' })
  teacher!: AccountEntity;

  /**
   * Môn mà rubric thuộc ngân hàng tiêu chí. Nullable cho legacy; create mới
   * bắt buộc ở API (spec 2026-11-18 course hub).
   */
  @Column({ name: 'course_id', type: 'uuid', nullable: true })
  courseId!: string | null;

  @ManyToOne(() => CourseEntity, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'course_id' })
  course!: CourseEntity | null;

  /** Tên do giảng viên đặt, ví dụ "Giữa kỳ CTDL". */
  @Column({ type: 'varchar', length: 200 })
  name!: string;

  @Column({ type: 'int', default: 1 })
  version!: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  /**
   * `qa` = tiêu chí phẳng tái sử dụng (mặc định, hành vi cũ).
   * `qs` = checklist theo câu, nhiều hướng — xem spec 2026-11-18.
   */
  @Column({ type: 'varchar', length: 8, default: 'qa' })
  kind!: 'qa' | 'qs';
}

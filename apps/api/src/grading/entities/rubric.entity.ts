import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../shared/base.entity';
import { CourseEntity } from '../../course/entities/course.entity';
import { AccountEntity } from '../../identity/entities/account.entity';

// Versioned — editing mid-stream must create a new version (`version`
// increments); existing GradingResult rows keep the exact version they
// were graded against (CLAUDE.md Security rule 7). Once any GradingResult
// references a version, that version's criteria become immutable — see
// the guard trigger added in the hand-written migration (not expressible
// as an entity decorator).
@Entity({ name: 'rubric' })
@Index('uq_rubric_course_version', ['courseId', 'version'], { unique: true })
export class RubricEntity extends BaseEntity {
  /**
   * CHỦ SỞ HỮU LÀ GIẢNG VIÊN, không phải môn học. Đây là mục đích thật của
   * cả đợt thu hẹp master data.
   *
   * Trước đây quyền động vào rubric được suy ra bằng cách ĐẾM DÒNG TRONG
   * BẢNG `class` (`rubric.service.ts` `assertTeachesCourse`), tức hiện vật
   * trung tâm của phần chấm điểm bị dữ liệu nền giam. Giờ quyền là một
   * phép so sánh: `rubric.teacherId === req.user.sub`.
   */
  @Column({ name: 'teacher_id', type: 'uuid' })
  teacherId!: string;

  @ManyToOne(() => AccountEntity, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'teacher_id' })
  teacher!: AccountEntity;

  /** Tên do giảng viên đặt, ví dụ "Giữa kỳ CTDL". Thay vai trò định danh
   * mà `course_id` từng giữ. */
  @Column({ type: 'varchar', length: 200 })
  name!: string;

  /**
   * Chủ sở hữu CŨ, đang trên đường ra.
   *
   * Nới thành nullable ở `RelaxRubricCourseId` để đường ghi chuyển sang
   * `teacher_id` mà không phải bịa ra một môn học. Không còn ai ĐỌC nó —
   * cột ở lại chỉ để lượt triển khai này quay ngược được, và biến mất ở
   * `ContractMasterData`. Đừng viết caller mới dựa vào nó.
   */
  @Column({ name: 'course_id', type: 'uuid', nullable: true })
  courseId!: string | null;

  @ManyToOne(() => CourseEntity, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'course_id' })
  course!: CourseEntity | null;

  @Column({ type: 'int', default: 1 })
  version!: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;
}

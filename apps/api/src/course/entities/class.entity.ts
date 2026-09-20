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

  /**
   * Tên môn học dạng VĂN BẢN, thay cho khoá ngoại tới bảng `course`.
   *
   * Hệ thống không quản lý dữ liệu nền của trường nữa — nó chỉ ghi lại thứ
   * giảng viên khai. Đổi lại: hai giảng viên gõ "CTDL&GT" và "Cấu trúc dữ
   * liệu" là hai môn độc lập, và không gom thống kê theo môn được nữa. Đánh
   * đổi có ý thức, ghi ở spec thu hẹp master data §7.
   *
   * Trong giai đoạn expand/contract, cột này sống CẠNH `course_id`. Khoá
   * ngoại kia biến mất ở `ContractMasterData`.
   */
  @Column({ name: 'course_name', type: 'varchar', length: 200 })
  courseName!: string;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ name: 'teacher_id', type: 'uuid' })
  teacherId!: string;

  @ManyToOne(() => AccountEntity, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'teacher_id' })
  teacher!: AccountEntity;
}

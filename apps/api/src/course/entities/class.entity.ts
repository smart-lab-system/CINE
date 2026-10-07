import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../shared/base.entity';
import { AccountEntity } from '../../identity/entities/account.entity';
import { SemesterEntity } from './semester.entity';
import { AdministrativeClassEntity } from './administrative-class.entity';

// "Lớp môn học" (course section) — not in CLAUDE.md's original schema sketch,
// which only had a loose `home_class_id` string on ClassRoster/Enrollment/
// Submission with no table behind it. Added here as the FK target those
// columns need to be a valid schema.
@Entity({ name: 'class' })
// Khoá duy nhất: một lớp học phần là (học kỳ, lớp danh nghĩa, nhóm). `group_name`
// là '' chứ không NULL — NULL làm khoá này mất tác dụng (xem migration). Ở DB chỉ mục nằm trên
// `lower(group_name)` (hoa-thường của tên nhóm không tạo ra một lớp khác); TypeORM không biểu
// diễn được chỉ mục biểu thức nên decorator chỉ nêu các cột — migration là nguồn thật.
@Index('uq_class_semester_admin_group', ['semesterId', 'administrativeClassId', 'groupName'], {
  unique: true,
})
@Check(
  'ck_class_group_name',
  `"group_name" = btrim("group_name") AND "group_name" !~ '\\s{2,}' AND "group_name" !~ '[[:cntrl:]]'`,
)
export class ClassEntity extends BaseEntity {
  /**
   * Tên môn học dạng VĂN BẢN, thay cho khoá ngoại tới bảng `course` đã bỏ.
   *
   * HẰNG SỐ, không phải dữ liệu người dùng nhập: hệ thống phục vụ đúng một
   * môn, server điền `COURSE_NAME` (common/course-name.ts) và không đường
   * ghi nào khác chạm tới cột này. `NormalizeCourseNameToSingleSubject` đã
   * kéo mọi dòng cũ về cùng chuỗi ấy.
   *
   * Vì thế cột này không phân biệt được gì, và mọi vị từ còn dùng nó đều
   * đúng một cách hiển nhiên. Nó ở lại tới đợt dựng lại chấm điểm — xem mục
   * "Nợ mang sang từ đợt chốt MỘT MÔN" trong spec agent điều tra. Bỏ nó bây
   * giờ đồng nghĩa với sửa logic định tuyến bài thi bù, việc đáng có test
   * riêng chứ không đi kèm một đợt dọn giao diện.
   */
  @Column({ name: 'course_name', type: 'varchar', length: 200 })
  courseName!: string;

  /**
   * Tên lớp KHÔNG phải một cột: nó là biểu thức (mã danh nghĩa + nhóm), đọc qua view `class_label` (spec §2.5). Cột `name` cũ và chỉ mục
   * `uq_class_teacher_course_name` đã bị bỏ ở migration thu hẹp.
   */

  /** Học kỳ của lớp (spec §2.3). */
  @Column({ name: 'semester_id', type: 'uuid' })
  semesterId!: string;

  @ManyToOne(() => SemesterEntity, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'semester_id' })
  semester!: SemesterEntity;

  @Column({ name: 'administrative_class_id', type: 'uuid' })
  administrativeClassId!: string;

  @ManyToOne(() => AdministrativeClassEntity, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'administrative_class_id' })
  administrativeClass!: AdministrativeClassEntity;

  /** `''` khi không tách nhóm (KHÔNG phải NULL: xem `uq_class_semester_admin_group`). */
  @Column({ name: 'group_name', type: 'varchar', length: 50, default: '' })
  groupName!: string;

  @Column({ name: 'teacher_id', type: 'uuid' })
  teacherId!: string;

  @ManyToOne(() => AccountEntity, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'teacher_id' })
  teacher!: AccountEntity;
}

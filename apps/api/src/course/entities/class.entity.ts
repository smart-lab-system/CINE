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
// Khoá duy nhất viết lại quanh chủ sở hữu mới. Trước đây là
// (course_id, name) — một môn không có hai lớp trùng tên. Giờ một giảng
// viên không có hai lớp trùng tên, còn hai giảng viên thì không đụng nhau.
//
// `course_name` mang cùng một chuỗi ở mọi dòng (xem common/course-name.ts),
// nên trên thực tế khoá này là (teacher_id, name). Nó ở lại đúng hình dạng
// cũ để khỏi phải viết một migration đổi chỉ mục chỉ vì đổi ý — và để nếu
// ràng buộc một môn có ngày được nới ra thì không phải dựng lại.
@Index('uq_class_teacher_course_name', ['teacherId', 'courseName', 'name'], { unique: true })
// Khoá duy nhất MỚI: một lớp học phần là (học kỳ, lớp danh nghĩa, nhóm). `group_name`
// là '' chứ không NULL — NULL làm khoá này mất tác dụng (xem migration).
@Index('uq_class_semester_admin_group', ['semesterId', 'administrativeClassId', 'groupName'], {
  unique: true,
})
@Check('ck_class_group_name', '"group_name" = btrim("group_name")')
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
   * @deprecated TÊN CŨ, đang chờ gỡ. Từ đợt khôi phục master data tên lớp là biểu
   * thức (mã danh nghĩa + nhóm) — đọc qua view `class_label`, KHÔNG đọc cột này.
   * Cột nullable từ migration `ExpandMasterDataEntities` để code mới không phải
   * ghi nó; migration thu hẹp (plan H) bỏ hẳn cột và chỉ mục
   * `uq_class_teacher_course_name`.
   */
  @Column({ type: 'varchar', length: 100, nullable: true })
  name!: string | null;

  /** Học kỳ của lớp (spec §2.3). NOT NULL từ migration thu hẹp; hôm nay nullable để code cũ còn chạy. */
  @Column({ name: 'semester_id', type: 'uuid', nullable: true })
  semesterId!: string | null;

  @ManyToOne(() => SemesterEntity, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'semester_id' })
  semester!: SemesterEntity | null;

  @Column({ name: 'administrative_class_id', type: 'uuid', nullable: true })
  administrativeClassId!: string | null;

  @ManyToOne(() => AdministrativeClassEntity, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'administrative_class_id' })
  administrativeClass!: AdministrativeClassEntity | null;

  /** `''` khi không tách nhóm (KHÔNG phải NULL: xem `uq_class_semester_admin_group`). */
  @Column({ name: 'group_name', type: 'varchar', length: 50, default: '' })
  groupName!: string;

  @Column({ name: 'teacher_id', type: 'uuid' })
  teacherId!: string;

  @ManyToOne(() => AccountEntity, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'teacher_id' })
  teacher!: AccountEntity;
}

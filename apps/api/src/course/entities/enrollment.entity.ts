import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../shared/base.entity';
import { AccountEntity } from '../../identity/entities/account.entity';
import { ClassEntity } from './class.entity';

// Ai thuộc lớp nào, và qua ảnh chốt của phiên, ai được ngồi buổi thi nào.
//
// Trước đợt thu hẹp master data bảng này khoá theo MÔN, cố ý: một mã phiên
// bị lộ không được cấp quyền, và một sinh viên thi bù ở lớp khác cùng môn
// vẫn vào được mà không cần ca đặc biệt (CLAUDE.md Security rule 1). Bảng
// `course` không còn, nên khoá tụt xuống LỚP — và ca thi bù chuyển sang
// luồng xin phép, nơi một giám thị ghi lý do và lớp gốc của em.
@Entity({ name: 'enrollment' })
@Index('uq_enrollment_class_student', ['homeClassId', 'studentMssv'], {
  unique: true,
})
@Check('ck_enrollment_mssv', "student_mssv ~ '^[A-Za-z0-9]{4,20}$'")
export class EnrollmentEntity extends BaseEntity {
  @Column({ name: 'student_mssv', type: 'citext' })
  studentMssv!: string;

  /**
   * @deprecated TÊN CŨ, đang chờ gỡ. Tên sinh viên nằm ở MỘT chỗ: bảng `student`
   * (spec §2.6). Không đọc, không ghi cột này ở code mới; nullable từ migration
   * `ExpandMasterDataEntities` và bị bỏ ở migration thu hẹp (plan H).
   */
  @Column({ name: 'student_name', type: 'varchar', length: 150, nullable: true })
  studentName!: string | null;

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

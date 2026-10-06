import { Check, Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../shared/base.entity';

/**
 * Sinh viên — MSSV và họ tên ở MỘT chỗ duy nhất (spec §2.6), để giảng viên gõ
 * MSSV là hiện tên và để một sinh viên nối qua nhiều học kỳ mà không có hai bản
 * tên. Chỉ được ghi qua danh sách lớp của giảng viên; không có trang quản lý.
 *
 * `student` không bao giờ bị xoá tự động.
 */
@Entity({ name: 'student' })
@Index('uq_student_mssv', ['mssv'], { unique: true })
@Check('ck_student_mssv', `"mssv" ~ '^[A-Za-z0-9]{4,20}$'`)
@Check('ck_student_full_name', `btrim("full_name") <> ''`)
export class StudentEntity extends BaseEntity {
  @Column({ type: 'citext' })
  mssv!: string;

  @Column({ name: 'full_name', type: 'varchar', length: 150 })
  fullName!: string;
}

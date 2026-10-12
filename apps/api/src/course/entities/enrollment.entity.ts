import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../shared/base.entity';
import { AccountEntity } from '../../identity/entities/account.entity';
import { ClassEntity } from './class.entity';
import { StudentEntity } from '../../master-data/entities/student.entity';

/**
 * Ai thuộc lớp nào — nguồn auth `agent:join` và định tuyến bài nộp.
 *
 * `home_teacher_id` nullable khi lớp chưa phân công GV; lúc assign admin
 * backfill toàn bộ enrollment của lớp. Snapshot mssv/tên không cascade từ
 * catalog `student`.
 */
@Entity({ name: 'enrollment' })
@Index('uq_enrollment_class_student', ['homeClassId', 'studentMssv'], {
  unique: true,
})
@Check('ck_enrollment_mssv', "student_mssv ~ '^[A-Za-z0-9]{4,20}$'")
export class EnrollmentEntity extends BaseEntity {
  @Column({ name: 'student_mssv', type: 'citext' })
  studentMssv!: string;

  @Column({ name: 'student_name', type: 'varchar', length: 150 })
  studentName!: string;

  @Column({ name: 'home_class_id', type: 'uuid' })
  homeClassId!: string;

  @ManyToOne(() => ClassEntity, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'home_class_id' })
  homeClass!: ClassEntity;

  @Column({ name: 'home_teacher_id', type: 'uuid', nullable: true })
  homeTeacherId!: string | null;

  @ManyToOne(() => AccountEntity, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'home_teacher_id' })
  homeTeacher!: AccountEntity | null;

  @Column({ name: 'student_id', type: 'uuid', nullable: true })
  studentId!: string | null;

  @ManyToOne(() => StudentEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'student_id' })
  student!: StudentEntity | null;
}

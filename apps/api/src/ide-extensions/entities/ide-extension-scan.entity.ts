import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../shared/base.entity';
import { AccountEntity } from '../../identity/entities/account.entity';
import { CourseEntity } from '../../master-data/entities/course.entity';
import { ExamSessionEntity } from '../../exam-session/entities/exam-session.entity';
import { LabMgmtSessionEntity } from './lab-mgmt-session.entity';

export type IdeExtensionScanReportedBy = 'teacher_hub';
export type IdeExtensionScanStatus = 'clean' | 'has_violations';

@Entity({ name: 'ide_extension_scan' })
export class IdeExtensionScanEntity extends BaseEntity {
  @Column({ name: 'exam_session_id', type: 'uuid', nullable: true })
  examSessionId!: string | null;

  @ManyToOne(() => ExamSessionEntity, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'exam_session_id' })
  examSession!: ExamSessionEntity | null;

  @Column({ name: 'course_id', type: 'uuid', nullable: true })
  courseId!: string | null;

  @ManyToOne(() => CourseEntity, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'course_id' })
  course!: CourseEntity | null;

  @Column({ name: 'lab_mgmt_session_id', type: 'uuid', nullable: true })
  labMgmtSessionId!: string | null;

  @ManyToOne(() => LabMgmtSessionEntity, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'lab_mgmt_session_id' })
  labMgmtSession!: LabMgmtSessionEntity | null;

  @Column({ name: 'student_mssv', type: 'citext' })
  studentMssv!: string;

  @Column({ name: 'machine_id', type: 'varchar', length: 100 })
  machineId!: string;

  @Column({ name: 'machine_name', type: 'varchar', length: 200, nullable: true })
  machineName!: string | null;

  @Column({ name: 'scanned_at', type: 'timestamptz' })
  scannedAt!: Date;

  @Column({
    name: 'reported_by',
    type: 'enum',
    enum: ['teacher_hub'],
    enumName: 'ide_extension_scan_reported_by',
    default: 'teacher_hub',
  })
  reportedBy!: IdeExtensionScanReportedBy;

  @Column({ name: 'teacher_account_id', type: 'uuid', nullable: true })
  teacherAccountId!: string | null;

  @ManyToOne(() => AccountEntity, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'teacher_account_id' })
  teacherAccount!: AccountEntity | null;

  @Column({ name: 'vscode_version', type: 'varchar', length: 50, nullable: true })
  vscodeVersion!: string | null;

  @Column({ name: 'extension_count', type: 'int', default: 0 })
  extensionCount!: number;

  @Column({ name: 'violation_count', type: 'int', default: 0 })
  violationCount!: number;

  @Column({
    type: 'enum',
    enum: ['clean', 'has_violations'],
    enumName: 'ide_extension_scan_status',
  })
  status!: IdeExtensionScanStatus;
}

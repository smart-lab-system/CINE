import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AccountEntity } from '../../identity/entities/account.entity';
import { CourseEntity } from '../../master-data/entities/course.entity';
import { ExamSessionEntity } from '../../exam-session/entities/exam-session.entity';

/** id do Teacher Hub sinh (uuid) — không dùng PrimaryGeneratedColumn. */
@Entity({ name: 'lab_mgmt_session' })
export class LabMgmtSessionEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @Column({ name: 'teacher_account_id', type: 'uuid' })
  teacherAccountId!: string;

  @ManyToOne(() => AccountEntity, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'teacher_account_id' })
  teacherAccount!: AccountEntity;

  @Column({ name: 'room_hint', type: 'varchar', length: 200, nullable: true })
  roomHint!: string | null;

  @Column({ name: 'course_id', type: 'uuid', nullable: true })
  courseId!: string | null;

  @ManyToOne(() => CourseEntity, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'course_id' })
  course!: CourseEntity | null;

  @Column({ name: 'exam_session_id', type: 'uuid', nullable: true })
  examSessionId!: string | null;

  @ManyToOne(() => ExamSessionEntity, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'exam_session_id' })
  examSession!: ExamSessionEntity | null;

  @Column({ name: 'started_at', type: 'timestamptz', default: () => 'now()' })
  startedAt!: Date;

  @Column({ name: 'ended_at', type: 'timestamptz', nullable: true })
  endedAt!: Date | null;
}

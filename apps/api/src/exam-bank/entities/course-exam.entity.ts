import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseEntity } from '../../shared/base.entity';
import { CourseEntity } from '../../master-data/entities/course.entity';
import { AccountEntity } from '../../identity/entities/account.entity';
import { CourseExamQuestionEntity } from './course-exam-question.entity';

export type CourseExamStatus = 'draft' | 'ready';
export type CourseExamType = 'TK' | 'GK' | 'CK';

@Entity({ name: 'course_exam' })
export class CourseExamEntity extends BaseEntity {
  @Index('idx_course_exam_course')
  @Column({ name: 'course_id', type: 'uuid' })
  courseId!: string;

  @ManyToOne(() => CourseEntity, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'course_id' })
  course!: CourseEntity;

  /**
   * Luôn dạng `Đề thi {thường|giữa|cuối} kỳ — {tên môn}` (server dựng từ examType + course).
   */
  @Column({ type: 'varchar', length: 200 })
  title!: string;

  /**
   * Mô tả / hướng dẫn dùng chung cho toàn đề (áp dụng mọi câu). Tuỳ chọn.
   */
  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'exam_type', type: 'varchar', length: 8 })
  examType!: CourseExamType;

  @Column({ type: 'varchar', length: 16, default: 'draft' })
  status!: CourseExamStatus;

  /** Playground language / project stack (c, cpp, java, python, static, …). */
  @Column({ type: 'varchar', length: 32 })
  language!: string;

  /**
   * Tổng điểm đề (trần). Tổng điểm các câu không được vượt quá giá trị này.
   * Đơn vị hundredths (10 điểm = 1000).
   */
  @Column({ name: 'total_points_hundredths', type: 'int' })
  totalPointsHundredths!: number;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy!: string;

  @ManyToOne(() => AccountEntity, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'created_by' })
  creator!: AccountEntity;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy!: string | null;

  @OneToMany(() => CourseExamQuestionEntity, (q) => q.exam)
  questions!: CourseExamQuestionEntity[];
}

import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../shared/base.entity';
import { CourseExamEntity } from './course-exam.entity';

@Entity({ name: 'course_exam_question' })
@Index('uq_course_exam_question_ordinal', ['courseExamId', 'ordinal'], { unique: true })
export class CourseExamQuestionEntity extends BaseEntity {
  @Index('idx_course_exam_question_exam')
  @Column({ name: 'course_exam_id', type: 'uuid' })
  courseExamId!: string;

  @ManyToOne(() => CourseExamEntity, (e) => e.questions, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'course_exam_id' })
  exam!: CourseExamEntity;

  @Column({ type: 'int' })
  ordinal!: number;

  @Column({ type: 'text', nullable: true })
  title!: string | null;

  @Column({ type: 'text' })
  statement!: string;

  @Column({ name: 'points_hundredths', type: 'int' })
  pointsHundredths!: number;
}

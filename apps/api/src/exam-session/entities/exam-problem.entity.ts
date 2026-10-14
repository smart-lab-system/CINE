import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { ExamSessionEntity } from './exam-session.entity';

/** Một câu của phiên (P1a). Phiên hiện có đúng một câu mặc định (ordinal = 1). */
@Entity({ name: 'exam_problem' })
@Index('uq_exam_problem_session_ordinal', ['examSessionId', 'ordinal'], { unique: true })
export class ExamProblemEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'exam_session_id', type: 'uuid' })
  examSessionId!: string;

  @ManyToOne(() => ExamSessionEntity, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'exam_session_id' })
  session?: ExamSessionEntity;

  @Column({ type: 'int' })
  ordinal!: number;

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Column({ name: 'points_hundredths', type: 'int' })
  pointsHundredths!: number;

  @Column({ name: 'required_deliverable_id', type: 'uuid', nullable: true })
  requiredDeliverableId!: string | null;

  @Column({ name: 'entry_name', type: 'text', nullable: true })
  entryName!: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  language!: string | null;

  @Column({ type: 'text', nullable: true })
  statement!: string | null;

  @Column({ name: 'statement_quote', type: 'text', nullable: true })
  statementQuote!: string | null;

  @Column({ name: 'rubric_id', type: 'uuid', nullable: true })
  rubricId!: string | null;

  @Column({ name: 'test_bundle_id', type: 'uuid', nullable: true })
  testBundleId!: string | null;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;

  @Column({ name: 'updated_at', type: 'timestamptz', default: () => 'now()' })
  updatedAt!: Date;
}

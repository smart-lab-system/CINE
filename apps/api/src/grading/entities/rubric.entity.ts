import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../shared/base.entity';
import { CourseEntity } from '../../course/entities/course.entity';

// Versioned — editing mid-stream must create a new version (`version`
// increments); existing GradingResult rows keep the exact version they
// were graded against (CLAUDE.md Security rule 7). Once any GradingResult
// references a version, that version's criteria become immutable — see
// the guard trigger added in the hand-written migration (not expressible
// as an entity decorator).
@Entity({ name: 'rubric' })
@Index('uq_rubric_course_version', ['courseId', 'version'], { unique: true })
export class RubricEntity extends BaseEntity {
  @Column({ name: 'course_id', type: 'uuid' })
  courseId!: string;

  @ManyToOne(() => CourseEntity, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'course_id' })
  course!: CourseEntity;

  @Column({ type: 'int', default: 1 })
  version!: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;
}

import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { RubricEntity } from './entities/rubric.entity';
import { RubricCriterionEntity } from './entities/rubric-criterion.entity';
import { GradingResultEntity } from './entities/grading-result.entity';
import { ClassEntity } from '../course/entities/class.entity';
import { SaveRubricDto } from './dto/rubric.dto';

export interface RubricView {
  id: string;
  courseId: string;
  version: number;
  isActive: boolean;
  totalPoints: number;
  criteria: { id: string; description: string; maxPoints: number }[];
}

/**
 * Rubrics, and the versioning that CLAUDE.md Security rule 7 requires.
 *
 * A rubric is never edited in place once anything has been graded against
 * it. Editing produces a NEW version; the old one stays exactly as it was,
 * because every GradingResult points at the version it was graded against
 * and a calibration run that compared results against a rubric that had
 * since changed would be comparing nothing.
 *
 * The database enforces the second half of this independently — a trigger
 * makes a version's criteria immutable once a GradingResult references it —
 * so a future caller that tries to edit around this service still fails.
 */
@Injectable()
export class RubricService {
  constructor(
    @InjectRepository(RubricEntity)
    private readonly rubrics: Repository<RubricEntity>,
    @InjectRepository(RubricCriterionEntity)
    private readonly criteria: Repository<RubricCriterionEntity>,
    @InjectRepository(GradingResultEntity)
    private readonly results: Repository<GradingResultEntity>,
    @InjectRepository(ClassEntity)
    private readonly classes: Repository<ClassEntity>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  /**
   * A lecturer may work on the rubric of a course they teach a class in.
   *
   * Scope comes from `class.teacher_id`, the same column every other
   * lecturer-facing check uses. A rubric belongs to the COURSE — two
   * lecturers teaching two classes of one course share it, which is the
   * point of grading them against the same criteria.
   */
  private async assertTeachesCourse(courseId: string, teacherId: string): Promise<void> {
    const count = await this.classes.count({ where: { courseId, teacherId } });
    if (count === 0) {
      throw new ForbiddenException('You do not teach any class of this course');
    }
  }

  /** Every version, newest first — the history rule 7 exists to preserve. */
  async listForCourse(courseId: string, teacherId: string): Promise<RubricView[]> {
    await this.assertTeachesCourse(courseId, teacherId);
    const rows = await this.rubrics.find({
      where: { courseId },
      order: { version: 'DESC' },
    });
    return Promise.all(rows.map((row) => this.toView(row)));
  }

  /**
   * The version to offer as the default when CREATING a session — not the
   * version a grading run will use. A grading run reads the rubric the
   * session pinned (`exam_session.rubric_id`), decided when the paper was
   * written.
   *
   * The old name was `findActive`, and it meant the second thing. Renamed
   * rather than kept, so that meaning cannot creep back through a new
   * caller: a rubric edited between two exams of one course must not change
   * how the earlier exam is graded.
   */
  async findDefaultForCourse(courseId: string): Promise<RubricEntity | null> {
    return this.rubrics.findOne({ where: { courseId, isActive: true } });
  }

  /**
   * One version by id, with no scope check.
   *
   * Deliberate: every caller has already established scope by other means —
   * the session was owner-checked, and `rubric_id` can only have been
   * written by a path that already forced `rubric.courseId ===
   * session.courseId`. Re-checking here would only obscure where the rule
   * is actually enforced.
   */
  async findById(rubricId: string): Promise<RubricEntity | null> {
    return this.rubrics.findOne({ where: { id: rubricId } });
  }

  /**
   * Saves a rubric as a NEW version, always.
   *
   * There is deliberately no update path. "Edit" and "create version two"
   * are the same act here, and offering both would mean offering a way to
   * change criteria that results already point at — the exact thing rule 7
   * forbids. The cost is a version number that climbs during authoring; the
   * alternative is a rubric whose history silently rewrites itself.
   *
   * One transaction: a version whose criteria failed to insert would be an
   * empty rubric marked active, and the next grading run would score every
   * submission zero out of zero.
   */
  async saveNewVersion(
    courseId: string,
    teacherId: string,
    dto: SaveRubricDto,
  ): Promise<RubricView> {
    await this.assertTeachesCourse(courseId, teacherId);

    return this.dataSource.transaction(async (manager) => {
      const latest = await manager
        .getRepository(RubricEntity)
        .findOne({ where: { courseId }, order: { version: 'DESC' } });
      const version = (latest?.version ?? 0) + 1;

      // Exactly one active version per course. `isActive` no longer decides
      // how anything is GRADED — a session pins its own rubric — but it is
      // still what `findDefaultForCourse` offers as the pre-selected choice
      // when a lecturer creates a session, and two actives would make that
      // choice a matter of row order.
      await manager
        .getRepository(RubricEntity)
        .update({ courseId, isActive: true }, { isActive: false });

      const rubric = await manager.save(
        manager.create(RubricEntity, { courseId, version, isActive: true }),
      );

      await manager.save(
        RubricCriterionEntity,
        dto.criteria.map((criterion) =>
          manager.create(RubricCriterionEntity, {
            rubricId: rubric.id,
            description: criterion.description,
            maxPoints: String(criterion.maxPoints),
          }),
        ),
      );

      return this.toView(rubric, manager.getRepository(RubricCriterionEntity));
    });
  }

  /** One version with its criteria, for a lecturer who teaches the course. */
  async findOneForTeacher(rubricId: string, teacherId: string): Promise<RubricView> {
    const rubric = await this.rubrics.findOne({ where: { id: rubricId } });
    if (!rubric) {
      throw new NotFoundException('Rubric not found');
    }
    await this.assertTeachesCourse(rubric.courseId, teacherId);
    return this.toView(rubric);
  }

  /** Whether anything has been graded against this exact version. */
  async hasResults(rubricId: string): Promise<boolean> {
    return (await this.results.count({ where: { rubricIdVersion: rubricId } })) > 0;
  }

  private async toView(
    rubric: RubricEntity,
    repo: Repository<RubricCriterionEntity> = this.criteria,
  ): Promise<RubricView> {
    const criteria = await repo.find({
      where: { rubricId: rubric.id },
      order: { createdAt: 'ASC' },
    });
    return {
      id: rubric.id,
      courseId: rubric.courseId,
      version: rubric.version,
      isActive: rubric.isActive,
      totalPoints:
        Math.round(criteria.reduce((sum, c) => sum + Number(c.maxPoints), 0) * 100) / 100,
      criteria: criteria.map((c) => ({
        id: c.id,
        description: c.description,
        maxPoints: Number(c.maxPoints),
      })),
    };
  }
}

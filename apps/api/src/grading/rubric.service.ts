import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  assignCriterionKeys,
  assignQsStepKeys,
  DuplicateCriterionKeyError,
} from './criterion-key';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { RubricEntity } from './entities/rubric.entity';
import { RubricCriterionEntity } from './entities/rubric-criterion.entity';
import { RubricApproachEntity } from './entities/rubric-approach.entity';
import { GradingResultEntity } from './entities/grading-result.entity';
import { SaveRubricDto } from './dto/rubric.dto';
import type { QsApproach } from './qs';

export interface RubricView {
  id: string;
  teacherId: string;
  /** Neo ngân hàng môn — null với legacy chưa gán. */
  courseId: string | null;
  name: string;
  version: number;
  isActive: boolean;
  /** Soft-deactivate admin — độc lập versioning. */
  isArchived: boolean;
  kind: 'qa' | 'qs';
  totalPoints: number;
  /** Thời điểm tạo bản này (ISO 8601) — để suy ra "bản tạo gần nhất" giữa các bộ rubric khác tên (G1 §5). */
  createdAt: string;
  updatedAt: string;
  criteria: {
    id: string;
    key: string;
    description: string;
    maxPoints: number;
    approachKey: string | null;
  }[];
  approaches: {
    key: string;
    name: string;
    maxPoints: number;
    steps: { key: string; description: string; maxPoints: number }[];
  }[];
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
 *
 * **CHỦ SỞ HỮU LÀ GIẢNG VIÊN.** Trước đợt thu hẹp master data, quyền động
 * vào rubric được suy ra bằng cách ĐẾM DÒNG trong bảng `class`: "bạn có dạy
 * lớp nào của môn này không". Rubric thuộc về MÔN, nên hai giảng viên dạy
 * hai lớp cùng môn dùng chung một rubric và sửa được của nhau. Giờ quyền là
 * một phép so sánh — `rubric.teacherId === teacherId` — và hiện vật trung
 * tâm của phần chấm điểm không còn bị dữ liệu nền giam.
 *
 * **kind:** `qa` (mặc định) = tiêu chí phẳng như trước; `qs` = nhiều hướng
 * checklist (DSA). Rubric QA không có approach — đường chấm cũ không đổi.
 */
@Injectable()
export class RubricService {
  constructor(
    @InjectRepository(RubricEntity)
    private readonly rubrics: Repository<RubricEntity>,
    @InjectRepository(RubricCriterionEntity)
    private readonly criteria: Repository<RubricCriterionEntity>,
    @InjectRepository(RubricApproachEntity)
    private readonly approaches: Repository<RubricApproachEntity>,
    @InjectRepository(GradingResultEntity)
    private readonly results: Repository<GradingResultEntity>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  private assertOwned(rubric: RubricEntity, teacherId: string): void {
    if (rubric.teacherId !== teacherId) {
      throw new ForbiddenException('Rubric này không thuộc về bạn');
    }
  }

  async listForTeacher(teacherId: string): Promise<RubricView[]> {
    const rows = await this.rubrics.find({
      where: { teacherId },
      order: { name: 'ASC', version: 'DESC' },
    });
    return Promise.all(rows.map((row) => this.toView(row)));
  }

  /** Admin hub: mọi rubric neo môn (mọi GV). */
  async listByCourse(courseId: string): Promise<RubricView[]> {
    const rows = await this.rubrics.find({
      where: { courseId },
      order: { name: 'ASC', version: 'DESC' },
    });
    return Promise.all(rows.map((row) => this.toView(row)));
  }

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
   *
   * Phiên bản được đếm theo (giảng viên, TÊN), không còn theo môn. Lưu lại
   * cùng một tên là tạo bản kế tiếp; đổi tên là bắt đầu một rubric mới ở
   * bản 1. `uq_rubric_teacher_name_version` ép đúng điều đó ở tầng DB.
   */
  async saveNewVersion(teacherId: string, dto: SaveRubricDto): Promise<RubricView> {
    const kind = dto.kind ?? 'qa';
    if (kind === 'qa') {
      if (!dto.criteria?.length) {
        throw new BadRequestException('Rubric QA cần ít nhất một tiêu chí.');
      }
      if (dto.approaches?.length) {
        throw new BadRequestException('Rubric QA không nhận approaches — dùng kind "qs".');
      }
    } else {
      if (!dto.approaches?.length) {
        throw new BadRequestException('Rubric QS cần ít nhất một cách giải (approaches).');
      }
      if (dto.criteria?.length) {
        throw new BadRequestException('Rubric QS không nhận criteria phẳng — khai bước trong approaches.');
      }
    }

    return this.dataSource.transaction(async (manager) => {
      const latest = await manager
        .getRepository(RubricEntity)
        .findOne({ where: { teacherId, name: dto.name }, order: { version: 'DESC' } });
      const version = (latest?.version ?? 0) + 1;

      const courseId = await this.resolveCourseIdForSave(manager, dto.courseId, latest);
      if (!courseId) {
        throw new BadRequestException('Chọn môn học khi tạo rubric.');
      }
      await this.assertCourseExists(manager, courseId);

      await manager
        .getRepository(RubricEntity)
        .update({ teacherId, name: dto.name, isActive: true }, { isActive: false });

      const rubric = await manager.save(
        manager.create(RubricEntity, {
          teacherId,
          courseId,
          name: dto.name,
          version,
          isActive: true,
          kind,
        }),
      );

      if (kind === 'qa') {
        await this.insertQaCriteria(manager, rubric.id, dto.criteria!);
      } else {
        await this.insertQsApproaches(manager, rubric.id, dto.approaches!);
      }

      if (latest && kind === 'qa') {
        await manager.query(
          `INSERT INTO examcollect.criterion_waiver (rubric_id, criterion_key, set_by, set_at)
           SELECT $1, w.criterion_key, w.set_by, w.set_at
             FROM examcollect.criterion_waiver w
            WHERE w.rubric_id = $2 AND w.revoked_at IS NULL
              AND EXISTS (SELECT 1 FROM examcollect.rubric_criterion rc WHERE rc.rubric_id = $1 AND rc.key = w.criterion_key)`,
          [rubric.id, latest.id],
        );
      }

      return this.toView(rubric, manager.getRepository(RubricCriterionEntity), manager.getRepository(RubricApproachEntity));
    });
  }

  private async insertQaCriteria(
    manager: EntityManager,
    rubricId: string,
    criteria: NonNullable<SaveRubricDto['criteria']>,
  ): Promise<void> {
    let keys: string[];
    try {
      keys = assignCriterionKeys(criteria);
    } catch (error) {
      if (error instanceof DuplicateCriterionKeyError) {
        throw new BadRequestException(`Hai tiêu chí cùng khai key "${error.key}".`);
      }
      throw error;
    }

    await manager.save(
      RubricCriterionEntity,
      criteria.map((criterion, index) =>
        manager.create(RubricCriterionEntity, {
          rubricId,
          description: criterion.description,
          maxPoints: String(criterion.maxPoints),
          sortOrder: index,
          key: keys[index],
          approachId: null,
        }),
      ),
    );
  }

  private async insertQsApproaches(
    manager: EntityManager,
    rubricId: string,
    approaches: NonNullable<SaveRubricDto['approaches']>,
  ): Promise<void> {
    let approachKeys: string[];
    try {
      approachKeys = assignCriterionKeys(approaches.map((a) => ({ description: a.name, key: a.key })));
    } catch (error) {
      if (error instanceof DuplicateCriterionKeyError) {
        throw new BadRequestException(`Hai cách giải cùng khai key "${error.key}".`);
      }
      throw error;
    }

    for (let ai = 0; ai < approaches.length; ai++) {
      const approachDto = approaches[ai];
      const approachKey = approachKeys[ai];
      const approach = await manager.save(
        manager.create(RubricApproachEntity, {
          rubricId,
          key: approachKey,
          name: approachDto.name,
          sortOrder: ai,
        }),
      );

      // QS: luôn `{approachKey}_s{n}` — không dùng mô tả / key client.
      const stepKeys = assignQsStepKeys(approachKey, approachDto.steps.length, ai);

      await manager.save(
        RubricCriterionEntity,
        approachDto.steps.map((step, index) =>
          manager.create(RubricCriterionEntity, {
            rubricId,
            description: step.description,
            maxPoints: String(step.maxPoints),
            sortOrder: index,
            key: stepKeys[index],
            approachId: approach.id,
          }),
        ),
      );
    }
  }

  async findOneForTeacher(rubricId: string, teacherId: string): Promise<RubricView> {
    const rubric = await this.rubrics.findOne({ where: { id: rubricId } });
    if (!rubric) {
      throw new NotFoundException('Rubric not found');
    }
    this.assertOwned(rubric, teacherId);
    return this.toView(rubric);
  }

  async hasResults(rubricId: string): Promise<boolean> {
    return (await this.results.count({ where: { rubricIdVersion: rubricId } })) > 0;
  }

  /** Đọc cấu trúc QS thuần để resolve hướng / scoreQs — null nếu rubric QA hoặc không có. */
  async loadQsApproaches(rubricId: string): Promise<QsApproach[] | null> {
    const rubric = await this.rubrics.findOne({ where: { id: rubricId } });
    if (!rubric || rubric.kind !== 'qs') return null;
    const view = await this.toView(rubric);
    return view.approaches.map((a) => ({
      key: a.key,
      name: a.name,
      steps: a.steps,
    }));
  }

  /**
   * Create tên mới → bắt buộc dto.courseId.
   * Version tiếp → dto.courseId nếu gửi, không thì kế thừa latest (kể cả null → vẫn lỗi nếu không gửi).
   */
  private async resolveCourseIdForSave(
    manager: EntityManager,
    dtoCourseId: string | undefined,
    latest: RubricEntity | null,
  ): Promise<string | null> {
    if (dtoCourseId) return dtoCourseId;
    if (latest?.courseId) return latest.courseId;
    return null;
  }

  private async assertCourseExists(manager: EntityManager, courseId: string): Promise<void> {
    const rows: { id: string }[] = await manager.query(
      `SELECT id FROM examcollect.course WHERE id = $1 LIMIT 1`,
      [courseId],
    );
    if (rows.length === 0) {
      throw new BadRequestException('Môn học không tồn tại.');
    }
  }

  private async toView(
    rubric: RubricEntity,
    criteriaRepo: Repository<RubricCriterionEntity> = this.criteria,
    approachRepo: Repository<RubricApproachEntity> = this.approaches,
  ): Promise<RubricView> {
    const kind = rubric.kind ?? 'qa';
    const criteria = await criteriaRepo.find({
      where: { rubricId: rubric.id },
      order: { sortOrder: 'ASC', createdAt: 'ASC', key: 'ASC' },
    });
    const approachRows =
      kind === 'qs'
        ? await approachRepo.find({
            where: { rubricId: rubric.id },
            order: { sortOrder: 'ASC', createdAt: 'ASC' },
          })
        : [];

    const approachKeyById = new Map(approachRows.map((a) => [a.id, a.key]));
    const approaches = approachRows.map((a) => {
      const steps = criteria
        .filter((c) => c.approachId === a.id)
        .map((c) => ({
          key: c.key,
          description: c.description,
          maxPoints: Number(c.maxPoints),
        }));
      return {
        key: a.key,
        name: a.name,
        maxPoints: Math.round(steps.reduce((s, st) => s + st.maxPoints, 0) * 100) / 100,
        steps,
      };
    });

    const totalPoints =
      kind === 'qs' && approaches.length > 0
        ? Math.max(...approaches.map((a) => a.maxPoints))
        : Math.round(criteria.reduce((sum, c) => sum + Number(c.maxPoints), 0) * 100) / 100;

    return {
      id: rubric.id,
      teacherId: rubric.teacherId,
      courseId: rubric.courseId ?? null,
      name: rubric.name,
      version: rubric.version,
      isActive: rubric.isActive,
      isArchived: rubric.isArchived === true,
      kind,
      createdAt: rubric.createdAt.toISOString(),
      updatedAt: rubric.updatedAt.toISOString(),
      totalPoints,
      criteria: criteria.map((c) => ({
        id: c.id,
        key: c.key,
        description: c.description,
        maxPoints: Number(c.maxPoints),
        approachKey: c.approachId ? approachKeyById.get(c.approachId) ?? null : null,
      })),
      approaches,
    };
  }
}

import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { RubricEntity } from './entities/rubric.entity';
import { RubricCriterionEntity } from './entities/rubric-criterion.entity';
import { GradingResultEntity } from './entities/grading-result.entity';
import { SaveRubricDto } from './dto/rubric.dto';

export interface RubricView {
  id: string;
  teacherId: string;
  name: string;
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
 *
 * **CHỦ SỞ HỮU LÀ GIẢNG VIÊN.** Trước đợt thu hẹp master data, quyền động
 * vào rubric được suy ra bằng cách ĐẾM DÒNG trong bảng `class`: "bạn có dạy
 * lớp nào của môn này không". Rubric thuộc về MÔN, nên hai giảng viên dạy
 * hai lớp cùng môn dùng chung một rubric và sửa được của nhau. Giờ quyền là
 * một phép so sánh — `rubric.teacherId === teacherId` — và hiện vật trung
 * tâm của phần chấm điểm không còn bị dữ liệu nền giam.
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
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  /**
   * Khuôn kiểm sở hữu, giống hệt `class.service.ts`: so chủ sở hữu, ném
   * Forbidden. Một hàm chứ không phải một điều kiện lặp lại ở bốn chỗ —
   * bỏ sót một chỗ là một giảng viên đọc được rubric của người khác.
   */
  private assertOwned(rubric: RubricEntity, teacherId: string): void {
    if (rubric.teacherId !== teacherId) {
      throw new ForbiddenException('Rubric này không thuộc về bạn');
    }
  }

  /**
   * Mọi rubric của một giảng viên, mọi phiên bản, mới nhất trước.
   *
   * Không lọc `isActive`: lịch sử phiên bản là thứ rule 7 tồn tại để giữ,
   * và giao diện cần thấy nó để nói "phiên thi này chấm bằng bản 2".
   */
  async listForTeacher(teacherId: string): Promise<RubricView[]> {
    const rows = await this.rubrics.find({
      where: { teacherId },
      order: { name: 'ASC', version: 'DESC' },
    });
    return Promise.all(rows.map((row) => this.toView(row)));
  }

  /**
   * One version by id, with no scope check.
   *
   * Deliberate: every caller has already established scope by other means —
   * the session was owner-checked, and `rubric_id` can only have been
   * written by a path that already forced the rubric's owner to be the
   * session's lecturer. Re-checking here would only obscure where the rule
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
   *
   * Phiên bản được đếm theo (giảng viên, TÊN), không còn theo môn. Lưu lại
   * cùng một tên là tạo bản kế tiếp; đổi tên là bắt đầu một rubric mới ở
   * bản 1. `uq_rubric_teacher_name_version` ép đúng điều đó ở tầng DB.
   */
  async saveNewVersion(teacherId: string, dto: SaveRubricDto): Promise<RubricView> {
    return this.dataSource.transaction(async (manager) => {
      const latest = await manager
        .getRepository(RubricEntity)
        .findOne({ where: { teacherId, name: dto.name }, order: { version: 'DESC' } });
      const version = (latest?.version ?? 0) + 1;

      // Exactly one active version per (teacher, name). `isActive` no
      // longer decides how anything is GRADED — a session pins its own
      // rubric — but it is still what the form pre-selects when a lecturer
      // creates a session, and two actives would make that choice a matter
      // of row order.
      await manager
        .getRepository(RubricEntity)
        .update({ teacherId, name: dto.name, isActive: true }, { isActive: false });

      const rubric = await manager.save(
        manager.create(RubricEntity, {
          teacherId,
          name: dto.name,
          version,
          isActive: true,
        }),
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

  /** One version with its criteria, for the lecturer who owns it. */
  async findOneForTeacher(rubricId: string, teacherId: string): Promise<RubricView> {
    const rubric = await this.rubrics.findOne({ where: { id: rubricId } });
    if (!rubric) {
      throw new NotFoundException('Rubric not found');
    }
    this.assertOwned(rubric, teacherId);
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
      teacherId: rubric.teacherId,
      name: rubric.name,
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

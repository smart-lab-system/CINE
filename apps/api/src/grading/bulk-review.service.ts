import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In } from 'typeorm';
import { ExamSessionEntity } from '../exam-session/entities/exam-session.entity';
import { RubricCriterionEntity } from './entities/rubric-criterion.entity';
import { GradingResultEntity } from './entities/grading-result.entity';
import { TeacherReviewEntity } from './entities/teacher-review.entity';
import { TeacherReviewService } from './teacher-review.service';
import { applyRule, type BulkRule, type RuleCriterion } from './bulk-rules';
import { BulkReviewDto } from './dto/bulk-review.dto';
import type { CriterionResult } from './ai-provider/ai-grading-provider';

export type SkipReason = 'not_reviewable' | 'no_advocate' | 'unchanged';

export interface BulkReviewOutcome {
  applied: number;
  skipped: { resultId: string; reason: SkipReason }[];
  /** Bài đã công bố — mỗi bài một dòng nhật ký. */
  audited: number;
}

/**
 * Áp một luật cho nhiều bài, trong MỘT giao dịch.
 *
 * File riêng khỏi `TeacherReviewService` theo đúng tiền lệ `GradingRunService`
 * tách khỏi `GradingService`: điều phối một lô là trách nhiệm khác với duyệt
 * một bài. Nhưng máy móc duyệt thì DÙNG LẠI — `reviewWithin` — chứ không
 * viết lại.
 */
@Injectable()
export class BulkReviewService {
  // KHÔNG `@InjectRepository`: mọi truy vấn ở đây chạy TRONG giao dịch, nên
  // chúng đi qua `manager`. Tiêm một repository rồi không dùng là mời người
  // sau dùng nhầm — và một câu đọc ngoài giao dịch ở giữa lô sẽ không thấy
  // những gì chính lô đó vừa ghi.
  constructor(
    private readonly teacherReviews: TeacherReviewService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async bulkReview(
    session: ExamSessionEntity,
    teacherId: string,
    dto: BulkReviewDto,
  ): Promise<BulkReviewOutcome> {
    const rule = this.narrowRule(dto);

    return this.dataSource.transaction(async (manager) => {
      const rows = await manager
        .createQueryBuilder(GradingResultEntity, 'g')
        .innerJoin('submission', 's', 's.id = g.submission_id')
        .where('s.exam_session_id = :sessionId', { sessionId: session.id })
        .andWhere('g.id IN (:...ids)', { ids: dto.resultIds })
        // Thứ tự khoá hàng phải XÁC ĐỊNH, cùng `ORDER BY g.id` mà
        // `finalizeGrades` dùng. Hai giao dịch chạm cùng tập hàng theo hai
        // thứ tự khác nhau sẽ ôm chết nhau, và "duyệt cả nhóm rồi bấm chốt
        // ngay sau" là chuyện rất thật.
        .orderBy('g.id')
        .getMany();

      // Id không thuộc phiên → 400 và KHÔNG làm gì. Đây là bug hoặc tấn
      // công, không phải tình huống vận hành — khác hẳn trạng thái không
      // duyệt được, thứ chỉ bị bỏ qua.
      if (rows.length !== dto.resultIds.length) {
        throw new BadRequestException('Có bài không thuộc phiên thi này — không áp gì cả.');
      }

      const rubricCriteria = await this.rubricCriteriaOf(rows, manager);
      if (
        (rule.kind === 'criterion_full_marks' || rule.kind === 'criterion_bonus') &&
        !rubricCriteria.some((c) => c.id === rule.criterionId)
      ) {
        throw new BadRequestException('Tiêu chí được chọn không thuộc rubric của phiên này.');
      }

      const skipped: { resultId: string; reason: SkipReason }[] = [];
      let applied = 0;
      let audited = 0;

      for (const result of rows) {
        // Hỏi `TeacherReviewService`, không giữ bản sao danh sách trạng thái:
        // bản sao thứ hai là bản sẽ trôi, và trôi ở đây nghĩa là bài đã chốt
        // âm thầm bị bỏ qua thay vì được ghi audit.
        if (!this.teacherReviews.isReviewable(result)) {
          skipped.push({ resultId: result.id, reason: 'not_reviewable' });
          continue;
        }

        const outcome = applyRule(rule, {
          rubricCriteria,
          criterionResults: (result.criterionResults ?? []) as CriterionResult[],
          advocateOpinion: result.advocateOpinion,
        });
        if (!outcome.ok) {
          skipped.push({ resultId: result.id, reason: outcome.reason });
          continue;
        }

        if (await this.isUnchanged(result, outcome.criteria, dto.privateNote, manager)) {
          skipped.push({ resultId: result.id, reason: 'unchanged' });
          continue;
        }

        const written = await this.teacherReviews.reviewWithin(
          manager,
          result,
          teacherId,
          { criteria: outcome.criteria, privateNote: dto.privateNote },
          rule,
        );
        applied += 1;
        if (written.audited) audited += 1;
      }

      return { applied, skipped, audited };
    });
  }

  /**
   * Áp luật này có đổi gì so với lần duyệt MỚI NHẤT không.
   *
   * Giảng viên bấm "áp cho cả nhóm", mạng chậm, bấm lại. Mô hình append-only
   * nên lần hai sẽ ghi thêm 45 dòng (điểm vẫn đúng — dòng mới nhất thắng) và
   * nếu bài đã chốt thì thêm 45 dòng audit — 90 dòng sổ cho một ý định. Bỏ
   * qua ở đây biến một lần ghi trùng âm thầm thành một câu trả lời.
   *
   * So sánh gồm CẢ `privateNote`: cùng điểm nhưng ghi chú mới thì đó là thay
   * đổi có thật, và dòng mới phải được ghi.
   */
  private async isUnchanged(
    result: GradingResultEntity,
    criteria: RuleCriterion[],
    privateNote: string | undefined,
    manager: EntityManager,
  ): Promise<boolean> {
    const latest = await manager.getRepository(TeacherReviewEntity).findOne({
      where: { gradingResultId: result.id },
      order: { reviewedAt: 'DESC' },
    });
    if (!latest) return false;

    const before = latest.editedCriteria as unknown as RuleCriterion[];
    if (!Array.isArray(before) || before.length !== criteria.length) return false;

    const byId = new Map(before.map((row) => [row.criterionId, row]));
    const sameCriteria = criteria.every((row) => {
      const was = byId.get(row.criterionId);
      return was !== undefined && was.points === row.points && was.verdict === row.verdict;
    });

    return sameCriteria && (latest.privateNote ?? null) === (privateNote ?? null);
  }

  /**
   * Tiêu chí của rubric mà phiên này đã chấm bằng.
   *
   * Kiểm MỘT lần cho cả phiên, không từng bài: mọi kết quả trong một phiên
   * dùng chung một `rubric_id_version` (`startGrading` đóng băng rubric một
   * lần, `setSessionRubric` từ chối khi đã có kết quả). Bất biến đó được một
   * test e2e riêng khẳng định — xem `bulk-review.e2e-spec.ts`.
   */
  private async rubricCriteriaOf(
    rows: GradingResultEntity[],
    manager: EntityManager,
  ): Promise<{ id: string; maxPoints: number }[]> {
    const versions = new Set(rows.map((row) => row.rubricIdVersion));
    if (versions.size !== 1) {
      throw new BadRequestException(
        'Các bài trong phiên đang dùng nhiều phiên bản rubric khác nhau — không áp hàng loạt được.',
      );
    }

    const found = await manager.getRepository(RubricCriterionEntity).find({
      where: { rubricId: In([...versions]) },
    });
    // `max_points` là cột `numeric`, nên TypeORM trao về CHUỖI. Quên `Number`
    // ở đây thì `Math.min(aiPoints + 1, '4')` cho ra `NaN` lặng lẽ, và
    // `validateAndTotal` từ chối cả lô với một thông báo nói về chuyện khác.
    return found.map((row) => ({ id: row.id, maxPoints: Number(row.maxPoints) }));
  }

  /** DTO phẳng → union đã thu hẹp. Decorator không diễn đạt được union rời rạc. */
  private narrowRule(dto: BulkReviewDto): BulkRule {
    const { kind, criterionId, points } = dto.rule;
    if (kind === 'keep_ai' || kind === 'apply_advocate') {
      return { kind };
    }
    if (!criterionId) {
      throw new BadRequestException(`Luật "${kind}" cần chỉ rõ tiêu chí.`);
    }
    if (kind === 'criterion_full_marks') {
      return { kind, criterionId };
    }
    if (points === undefined) {
      throw new BadRequestException('Cộng bù cần số điểm cộng thêm.');
    }
    return { kind: 'criterion_bonus', criterionId, points };
  }
}

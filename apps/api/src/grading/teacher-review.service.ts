import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  GradingResultEntity,
  GradingResultStatus,
} from './entities/grading-result.entity';
import { RubricCriterionEntity } from './entities/rubric-criterion.entity';
import { TeacherReviewEntity } from './entities/teacher-review.entity';
import { SubmitReviewDto } from './dto/submit-review.dto';

/**
 * The statuses a result CAN be reviewed in.
 *
 * Checked explicitly, BEFORE anything is written — never inferred from what
 * `advance()` returns. The first draft of the spec did infer it, and that
 * collapsed two unrelated situations into one silent path: "already reviewed,
 * this is a second edit" (correct) and "the AI is still grading" (wrong). At
 * `ai_grading` both `ai_total_score` and `criterion_results` are still NULL,
 * so the row written there is a human judgement about an empty result — and
 * since the status is not `finalized`, the audit branch does not fire either.
 */
const REVIEWABLE: GradingResultStatus[] = [
  'auto_approved',
  'flagged_for_review',
  'teacher_reviewed',
  'finalized',
  'exported',
];

export interface ReviewOutcome {
  finalScore: number;
}

@Injectable()
export class TeacherReviewService {
  constructor(
    @InjectRepository(GradingResultEntity)
    private readonly results: Repository<GradingResultEntity>,
    @InjectRepository(RubricCriterionEntity)
    private readonly criteria: Repository<RubricCriterionEntity>,
    @InjectRepository(TeacherReviewEntity)
    private readonly reviews: Repository<TeacherReviewEntity>,
  ) {}

  /**
   * Records one review. The caller has already proved ownership
   * (`GradingService.findResultForOwner`).
   */
  async review(
    result: GradingResultEntity,
    teacherId: string,
    dto: SubmitReviewDto,
  ): Promise<ReviewOutcome> {
    if (!REVIEWABLE.includes(result.status)) {
      throw new ConflictException(
        'Bài này chưa chấm xong — chưa duyệt được. Hãy đợi AI chấm xong.',
      );
    }

    const finalScore = await this.validateAndTotal(result, dto);

    await this.reviews.save(
      this.reviews.create({
        gradingResultId: result.id,
        teacherId,
        finalScore: String(finalScore),
        // Stored as sent, not as a diff against the AI. A review row has to be
        // readable on its own; reconstructing a score from a chain of diffs is
        // exactly what makes an edit history useless at the moment it matters.
        editedCriteria: dto.criteria as unknown as Record<string, unknown>,
      }),
    );

    // `false` now carries exactly ONE meaning here: already past
    // teacher_reviewed, so this is a second edit. The other meaning was
    // removed by the status gate above.
    await this.advance(
      result.id,
      ['auto_approved', 'flagged_for_review'],
      'teacher_reviewed',
    );

    return { finalScore };
  }

  /**
   * The ONLY method allowed to change `grading_result.status`.
   *
   * Mirrors `ExamSessionService.finalizeExamSession`: an optimistic
   * `WHERE status IN (...)`, where `affected === 0` means the row was not in
   * the expected state. It deliberately does NOT restate the transition map
   * from `validate_grading_result_lifecycle` — restating it is how the
   * `findClash` / `EXCLUDE` pair had to be handled, with an exact mirror and a
   * comment explaining why. The trigger stays the place the map is DEFINED.
   */
  async advance(
    resultId: string,
    from: GradingResultStatus[],
    to: GradingResultStatus,
  ): Promise<boolean> {
    const updated = await this.results
      .createQueryBuilder()
      .update(GradingResultEntity)
      .set({ status: to })
      .where('id = :id', { id: resultId })
      .andWhere('status IN (:...from)', { from })
      .execute();
    return (updated.affected ?? 0) > 0;
  }

  /** A result's current score: the newest review row, or the AI's own. */
  async currentFinalScore(result: GradingResultEntity): Promise<number | null> {
    const latest = await this.reviews.findOne({
      where: { gradingResultId: result.id },
      order: { reviewedAt: 'DESC' },
    });
    if (latest) {
      return Number(latest.finalScore);
    }
    return result.aiTotalScore === null ? null : Number(result.aiTotalScore);
  }

  /**
   * Checks the payload against THIS result's rubric and returns the total.
   *
   * Every criterion must be present: omitting one silently shrinks the total
   * and nobody notices. A graded rubric's criteria are immutable at the
   * database level (`trg_rubric_criterion_guard_immutable` raises once any
   * GradingResult cites that version), so this check has no race.
   */
  private async validateAndTotal(
    result: GradingResultEntity,
    dto: SubmitReviewDto,
  ): Promise<number> {
    const criteria = await this.criteria.find({
      where: { rubricId: result.rubricIdVersion },
    });
    const byId = new Map(criteria.map((c) => [c.id, Number(c.maxPoints)]));

    const seen = new Set<string>();
    let total = 0;
    for (const entry of dto.criteria) {
      const maxPoints = byId.get(entry.criterionId);
      if (maxPoints === undefined) {
        throw new BadRequestException(
          'Có tiêu chí không thuộc rubric đã dùng để chấm bài này.',
        );
      }
      if (seen.has(entry.criterionId)) {
        throw new BadRequestException('Một tiêu chí bị khai hai lần.');
      }
      if (entry.points > maxPoints) {
        throw new BadRequestException(
          `Điểm của một tiêu chí vượt quá điểm tối đa (${maxPoints}).`,
        );
      }
      seen.add(entry.criterionId);
      total += entry.points;
    }

    if (seen.size !== criteria.length) {
      throw new BadRequestException(
        'Phải chấm đủ mọi tiêu chí của rubric — thiếu một tiêu chí là tổng bị tính hụt.',
      );
    }

    return Math.round(total * 100) / 100;
  }
}

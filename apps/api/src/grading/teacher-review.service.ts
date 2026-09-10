import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import {
  GradingResultEntity,
  GradingResultStatus,
} from './entities/grading-result.entity';
import { RubricCriterionEntity } from './entities/rubric-criterion.entity';
import { TeacherReviewEntity } from './entities/teacher-review.entity';
import { SubmitReviewDto } from './dto/submit-review.dto';
import { AuditLogService } from '../admin/audit-log.service';

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

/**
 * Scores that have been PUBLISHED. From here on, every edit leaves a trace.
 *
 * The narrowness is the point. An edit made while marking is still in progress
 * is ordinary work — logging those would bury the log in noise and it would
 * stop answering the one question it exists for: who changed a score after the
 * class was told what it was.
 */
const PUBLISHED: GradingResultStatus[] = ['finalized', 'exported'];

/** Statuses that block finalising: the AI is still working, or it said it was unsure. */
const BLOCKS_FINALIZE: GradingResultStatus[] = [
  'ai_grading',
  'ai_graded',
  'flagged_for_review',
];

export interface ReviewOutcome {
  finalScore: number;
}

export interface FinalizeGradesOutcome {
  reviewedByHand: number;
  acceptedAsProposed: number;
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
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly auditLog: AuditLogService,
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

    // One transaction, for the same reason `finalizeGrades` is one, and a
    // sharper one: Security rule 4 says there is no path to a score edit that
    // skips the log. With the review row and the log entry committing on
    // separate connections there WAS such a path — the row lands, the log
    // write fails, and a published score has changed with nobody's name on
    // it, looking entirely ordinary in the table.
    return this.dataSource.transaction(async (manager) => {
      const finalScore = await this.validateAndTotal(result, dto, manager);

      // Read BEFORE the new row is written, or `currentFinalScore` returns the
      // score just saved and the audit entry says 10 became 10.
      const published = PUBLISHED.includes(result.status);
      const previousScore = published
        ? await this.currentFinalScore(result, manager)
        : null;

      const reviews = manager.getRepository(TeacherReviewEntity);
      await reviews.save(
        reviews.create({
          gradingResultId: result.id,
          teacherId,
          finalScore: String(finalScore),
          // Stored as sent, not as a diff against the AI. A review row has to
          // be readable on its own; reconstructing a score from a chain of
          // diffs is exactly what makes an edit history useless at the moment
          // it matters.
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
        manager,
      );

      if (published) {
        // Security rule 4. The status does not move — the lifecycle has no
        // exit from `finalized`, and it needs none: the current score is the
        // newest review row, and this is now it.
        await this.auditLog.recordUserAction(
          {
            actorId: teacherId,
            action: 'grading_result.score_edited_after_finalize',
            targetType: 'grading_result',
            targetId: result.id,
            oldValue: { finalScore: previousScore },
            newValue: { finalScore },
          },
          manager,
        );
      }

      return { finalScore };
    });
  }

  /**
   * Publishes a whole session's grades.
   *
   * Named apart from `finalize` on purpose — that one closes COLLECTION, this
   * one closes GRADING. Sharing a name would blur the two pipelines CLAUDE.md
   * exists to keep apart.
   *
   * Idempotent by design: a second call finds nothing left to do, returns
   * {0, 0}, and does not throw. Pressing a button twice is ordinary, and the
   * second press is harmless.
   *
   * One transaction. A half-finalised session leaves some results `finalized`
   * and others `teacher_reviewed`, and no screen can describe that state.
   */
  async finalizeGrades(
    examSessionId: string,
    teacherId: string,
  ): Promise<FinalizeGradesOutcome> {
    return this.dataSource.transaction(async (manager) => {
      const all = await manager
        .createQueryBuilder(GradingResultEntity, 'g')
        .innerJoin('submission', 's', 's.id = g.submission_id')
        .where('s.exam_session_id = :id', { id: examSessionId })
        // Thứ tự khoá hàng phải XÁC ĐỊNH. Không có ORDER BY thì thứ tự chỉ
        // đúng do tình cờ (heap scan), và hai giao dịch chốt cùng một phiên
        // — một cú double-click là đủ — có thể khoá các hàng theo hai thứ tự
        // khác nhau và ôm chết nhau. Không tốn gì: 50 hàng đã ở trong bộ nhớ.
        .orderBy('g.id')
        .getMany();

      if (all.length === 0) {
        throw new BadRequestException(
          'Phiên thi này chưa chấm bài nào — chưa có điểm để chốt.',
        );
      }

      const blocking = all.filter((result) => BLOCKS_FINALIZE.includes(result.status));
      if (blocking.length > 0) {
        throw new ConflictException(
          `Còn ${blocking.length} bài chưa duyệt xong — hãy duyệt hết trước khi chốt điểm.`,
        );
      }

      // Every write below goes through THIS manager. A `this.reviews` or a
      // bare `this.advance` here would take its own connection from the pool
      // and commit outside the open transaction, so a rollback would leave
      // exactly the half-finalised session the transaction exists to prevent.
      const reviews = manager.getRepository(TeacherReviewEntity);
      let reviewedByHand = 0;
      let acceptedAsProposed = 0;

      for (const result of all) {
        if (result.status === 'auto_approved') {
          // A bulk-accepted result still gets a REAL review row carrying the
          // name of whoever pressed the button. Jumping straight to finalized
          // would leave a published score with nobody's name on it.
          await reviews.save(
            reviews.create({
              gradingResultId: result.id,
              teacherId,
              finalScore: String(result.aiTotalScore ?? 0),
              editedCriteria: (result.criterionResults ?? []) as unknown as Record<
                string,
                unknown
              >,
            }),
          );
          if (
            !(await this.advance(
              result.id,
              ['auto_approved'],
              'teacher_reviewed',
              manager,
            ))
          ) {
            throw new ConflictException(
              'Một bài vừa đổi trạng thái — hãy tải lại và chốt lại.',
            );
          }
          acceptedAsProposed++;
        } else if (result.status === 'teacher_reviewed') {
          reviewedByHand++;
        } else {
          // finalized / exported: already published. This is the branch that
          // makes a second call harmless.
          continue;
        }

        if (
          !(await this.advance(result.id, ['teacher_reviewed'], 'finalized', manager))
        ) {
          throw new ConflictException(
            'Một bài vừa đổi trạng thái — hãy tải lại và chốt lại.',
          );
        }
      }

      return { reviewedByHand, acceptedAsProposed };
    });
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
    // Both current callers — `review()` and `finalizeGrades()` — pass their
    // transaction manager, and must: without it these UPDATEs run on a
    // different connection and survive the rollback that was supposed to undo
    // them. The default is for a caller that genuinely needs no transaction,
    // and there is none today.
    manager: EntityManager = this.results.manager,
  ): Promise<boolean> {
    const updated = await manager
      .createQueryBuilder()
      .update(GradingResultEntity)
      .set({ status: to })
      .where('id = :id', { id: resultId })
      .andWhere('status IN (:...from)', { from })
      .execute();
    return (updated.affected ?? 0) > 0;
  }

  /** A result's current score: the newest review row, or the AI's own. */
  async currentFinalScore(
    result: GradingResultEntity,
    manager: EntityManager = this.reviews.manager,
  ): Promise<number | null> {
    const latest = await manager.getRepository(TeacherReviewEntity).findOne({
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
    manager: EntityManager = this.criteria.manager,
  ): Promise<number> {
    const criteria = await manager.getRepository(RubricCriterionEntity).find({
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

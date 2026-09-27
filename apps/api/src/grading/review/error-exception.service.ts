import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { GradingResultStatus } from '../entities/grading-result.entity';
import { TeacherReviewEntity } from '../entities/teacher-review.entity';
import type { ExceptionDirection } from '../grading-model.types';
import { GradingService } from '../grading.service';
import { advanceStatus } from '../lifecycle/advance';
import { ErrorRuleService } from '../rules/error-rule.service';
import { formatHundredths, parseHundredths } from '../scoring/hundredths';
import { latestComputationRow, lockTeacherScoring } from '../scoring/score-inputs';
import { ScoreService } from '../scoring/score.service';

/**
 * Trạng thái mà giảng viên sửa được một bài lẻ. `audit_pending` KHÔNG ở đây: bài đang kiểm mẫu đi
 * đường nhận xét kiểm mẫu (§8.1 — xem bài trước, xem kết luận sau), không đi đường sửa điểm.
 */
const EDITABLE: GradingResultStatus[] = ['auto_approved', 'flagged_for_review', 'teacher_reviewed'];

/**
 * Ngoại lệ hai cấp của §2.2 — cả hai là MỘT dòng `teacher_review` (Security rule 6), không sinh
 * luật nào (T-POL-6). Thao tác trên MỘT bài nên bài sang `teacher_reviewed`, kể cả khi lượt tính
 * ngay sau thoả công thức tự quyết: có người đã nhìn bài đó (§14.3, T-REVIEW-1).
 */
@Injectable()
export class ErrorExceptionService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly grading: GradingService,
    private readonly rules: ErrorRuleService,
    private readonly scores: ScoreService,
  ) {}

  /** *Bỏ lỗi này cho riêng bài này* (`exclude`) hay gỡ việc đó (`include`). Mọi lượt tính lại giữ nó. */
  async setErrorException(
    teacherId: string,
    resultId: string,
    ruleId: string,
    direction: ExceptionDirection,
  ): Promise<{ scoreHundredths: number | null; status: GradingResultStatus }> {
    await this.grading.findResultForOwner(resultId, teacherId);
    return this.ds.transaction(async (m) => {
      await this.rules.owned(m, teacherId, ruleId);
      const row = await this.lockEditable(m, teacherId, resultId);
      if (row.pipeline !== 'investigator') {
        throw new ConflictException('Chỉ bài chấm theo bảng lỗi mới bỏ hay giữ được một lỗi');
      }
      const last = await latestComputationRow(m, resultId);
      if (!last || !last.breakdown.errors.some((e) => e.ruleId === ruleId)) {
        throw new BadRequestException('Lỗi này không có trong lượt tính mới nhất của bài');
      }
      await this.writeReview(m, {
        gradingResultId: resultId,
        teacherId,
        kind: 'error_exception',
        finalScore: null,
        errorRuleId: ruleId,
        direction,
      });
      const out = await this.scores.recomputeOne(m, resultId, 'error_exception', teacherId);
      await advanceStatus(m, resultId, ['auto_approved', 'flagged_for_review'], 'teacher_reviewed', { flagForReview: false });
      return { scoreHundredths: out.scoreHundredths, status: 'teacher_reviewed' };
    });
  }

  /**
   * *Chấm tay* — giảng viên đặt điểm cả bài. Từ đó không lượt tính lại nào đổi điểm bài này (§2.2).
   * Dùng được cho cả hai đường, và cho bài không chấm được lớp `submission`.
   */
  async setManualScore(
    teacherId: string,
    resultId: string,
    score: unknown,
  ): Promise<{ score: string; status: GradingResultStatus }> {
    const hundredths = readScore(score);
    await this.grading.findResultForOwner(resultId, teacherId);
    return this.ds.transaction(async (m) => {
      const row = await this.lockEditable(m, teacherId, resultId);
      const [{ max }] = await m.query(
        `SELECT COALESCE(sum(max_points), 0)::text AS max FROM examcollect.rubric_criterion WHERE rubric_id = $1`,
        [row.rubric_id_version],
      );
      if (hundredths > parseHundredths(max)) {
        throw new BadRequestException(`Điểm vượt trần của rubric (${formatHundredths(parseHundredths(max))})`);
      }
      const formatted = formatHundredths(hundredths);
      await this.writeReview(m, {
        gradingResultId: resultId,
        teacherId,
        kind: 'manual_score',
        finalScore: formatted,
        errorRuleId: null,
        direction: null,
      });
      await advanceStatus(m, resultId, ['auto_approved', 'flagged_for_review'], 'teacher_reviewed', { flagForReview: false });
      return { score: formatted, status: 'teacher_reviewed' };
    });
  }

  /** Khoá giảng viên (không lượt tính lại nào chen giữa) rồi khoá dòng, và đòi trạng thái sửa được. */
  private async lockEditable(
    m: EntityManager,
    teacherId: string,
    resultId: string,
  ): Promise<{ pipeline: string; status: GradingResultStatus; rubric_id_version: string }> {
    await lockTeacherScoring(m, teacherId);
    const [row] = await m.query(
      `SELECT pipeline, status, rubric_id_version FROM examcollect.grading_result WHERE id = $1 FOR UPDATE`,
      [resultId],
    );
    if (!EDITABLE.includes(row.status)) {
      throw new ConflictException(
        row.status === 'audit_pending'
          ? 'Bài đang trong mẫu kiểm — hãy ghi nhận xét kiểm mẫu trước'
          : `Bài đang ở trạng thái ${row.status} — không sửa điểm được ở đây`,
      );
    }
    return row;
  }

  private async writeReview(
    m: EntityManager,
    row: Pick<TeacherReviewEntity, 'gradingResultId' | 'teacherId' | 'kind' | 'finalScore' | 'errorRuleId' | 'direction'>,
  ): Promise<void> {
    // `edited_criteria = []`: dòng này không sửa verdict tiêu chí nào — calibration chỉ đọc mảng.
    // `reviewed_at = clock_timestamp()`: "ngoại lệ MỚI NHẤT thắng" phải theo thứ tự khoá, không
    // theo lúc transaction bắt đầu (`now()`, review C1).
    await m.query(
      `INSERT INTO examcollect.teacher_review
         (grading_result_id, teacher_id, final_score, kind, error_rule_id, direction, edited_criteria, reviewed_at)
       VALUES ($1, $2, $3, $4, $5, $6, '[]'::jsonb, clock_timestamp())`,
      [row.gradingResultId, row.teacherId, row.finalScore, row.kind, row.errorRuleId, row.direction],
    );
  }
}

function readScore(score: unknown): number {
  if (typeof score !== 'string') throw new BadRequestException('Điểm: chuỗi thập phân tối đa hai chữ số lẻ');
  try {
    return parseHundredths(score);
  } catch {
    throw new BadRequestException('Điểm: chuỗi thập phân tối đa hai chữ số lẻ, không âm');
  }
}

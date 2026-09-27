import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { readAutoThreshold } from '../decision/threshold';
import { GradingResultEntity } from '../entities/grading-result.entity';
import { ScoreComputationEntity } from '../entities/score-computation.entity';
import type { ScoreComputationReason } from '../grading-model.types';
import { advanceStatus } from '../lifecycle/advance';
import { formatHundredths } from './hundredths';
import { computeScore, RuleSnapshot, ScoreCoreOutput } from './score-core';
import {
  currentPriceVersion,
  latestComputationRow,
  loadRuleSnapshots,
  loadScoreContext,
  loadSessionModelRules,
  lockTeacherScoring,
  ScoreContext,
  teacherOfResult,
} from './score-inputs';

export interface RecomputeSummary {
  recomputed: number;
  promoted: number;
  demoted: number;
  /** Lượt tính lại ra dưới sàn — không ghi được dòng (điểm NOT NULL), bài tự quyết về gắn cờ. */
  belowFloor: number;
}

type Computed = ScoreCoreOutput & { priceVersionId: string | null };

/**
 * Chỗ DUY NHẤT ghi `score_computation` (§2.2 *"dòng tính lại"*) và dời trạng thái sau một lượt
 * tính. Mọi dịch vụ khác — giá, luật, ngoại lệ, đánh dấu, chốt — gọi vào đây, trong transaction
 * của chính nó, nên thay đổi và mọi lượt tính lại nó gây ra commit cùng nhau.
 */
@Injectable()
export class ScoreService {
  private readonly theta = readAutoThreshold(process.env).theta;

  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  readonly latestComputation = latestComputationRow;

  /**
   * Lượt tính đầu của một bài đường điều tra có lượt chấm `graded`. Dưới sàn thì NÉM: lượt chấm
   * bất biến từ lúc có kết cục, nên người gọi (3d) phải quyết kết cục TRƯỚC khi ghi `graded`.
   */
  async computeInitial(
    resultId: string,
  ): Promise<{ outcome: 'auto' | 'flagged'; computationId: string; scoreHundredths: number }> {
    return this.ds.transaction(async (m) => {
      await lockTeacherScoring(m, await teacherOfResult(m, resultId));
      // Đọc SAU khoá: một lượt đánh dấu tiêu chí hay sửa giá vừa commit phải được thấy.
      const ctx = await loadScoreContext(m, resultId);
      if (ctx.pipeline !== 'investigator' || ctx.status !== 'ai_grading' || !ctx.stored) {
        throw new Error(
          `kết quả ${resultId} không tính đầu được (đường ${ctx.pipeline}, ${ctx.status}, ` +
            `lượt chấm ${ctx.stored ? 'graded' : 'chưa graded'})`,
        );
      }
      const out = await this.compute(m, ctx);
      if (out.outcome === 'ungradable' || out.scoreHundredths === null) {
        throw new Error(
          `lượt tính đầu của ${resultId} ra dưới sàn (${out.ungradable?.reason}) — người gọi phải quyết kết cục lượt chấm trước`,
        );
      }
      const computationId = await this.insertComputation(m, ctx, 'initial', null, out);
      // `ai_total_score` = điểm của lượt tính đầu, dưới trigger bất biến (§14.2): ghi CÙNG UPDATE
      // với các cột AI khác, vì guard đóng băng chúng ngay khi `ai_total_score` có.
      // `criterion_results` giữ `[]`: khuôn cột đó là của one_shot và calibration đọc nó; khung trừ
      // điểm của đường điều tra nằm ở `breakdown`.
      const wrote = await m
        .createQueryBuilder()
        .update(GradingResultEntity)
        .set({
          status: 'ai_graded',
          aiTotalScore: formatHundredths(out.scoreHundredths),
          confidence: out.breakdown.confidence === null ? null : out.breakdown.confidence.toFixed(3),
          modelUsed: ctx.stored.result.investigation.modelsUsed.join('+').slice(0, 100) || null,
        })
        .where('id = :id', { id: resultId })
        .andWhere("status = 'ai_grading'")
        .execute();
      if ((wrote.affected ?? 0) === 0) throw new Error(`kết quả ${resultId} đã rời ai_grading`);
      const to = out.outcome === 'auto' ? 'auto_approved' : 'flagged_for_review';
      await advanceStatus(m, resultId, ['ai_graded'], to, { flagForReview: to === 'flagged_for_review' });
      return { outcome: out.outcome, computationId, scoreHundredths: out.scoreHundredths };
    });
  }

  /**
   * Lượt tính lại TẦNG LUẬT cho mọi bài chưa chốt của một giảng viên, trong transaction của người
   * gọi. `ruleId` → chỉ bài mà lượt tính mới nhất có lỗi của luật đó; `rubricId` → chỉ bài của
   * rubric đó. Bài chấm tay không bao giờ tính lại (§2.2).
   */
  async recomputeForTeacher(
    m: EntityManager,
    teacherId: string,
    reason: ScoreComputationReason,
    actorId: string | null,
    scope: { ruleId?: string; rubricId?: string } = {},
  ): Promise<RecomputeSummary> {
    await lockTeacherScoring(m, teacherId);
    const ids: { id: string }[] = await m.query(
      `SELECT g.id
         FROM examcollect.grading_result g
         JOIN examcollect.submission s ON s.id = g.submission_id
         JOIN examcollect.exam_session es ON es.id = s.exam_session_id
         JOIN examcollect.grading_attempt a ON a.id = g.current_attempt_id AND a.outcome = 'graded'
        WHERE es.teacher_id = $1
          AND g.pipeline = 'investigator'
          AND g.status IN ('auto_approved', 'audit_pending', 'flagged_for_review', 'teacher_reviewed')
          AND NOT EXISTS (SELECT 1 FROM examcollect.teacher_review t
                           WHERE t.grading_result_id = g.id AND t.kind = 'manual_score')
          AND ($2::uuid IS NULL OR g.rubric_id_version = $2)
          AND ($3::uuid IS NULL OR EXISTS (
                SELECT 1 FROM (SELECT c.breakdown FROM examcollect.score_computation c
                                WHERE c.grading_result_id = g.id ORDER BY c.created_at DESC LIMIT 1) last
                 WHERE last.breakdown -> 'errors' @> jsonb_build_array(jsonb_build_object('ruleId', $3::text))))
        ORDER BY g.id
        FOR UPDATE OF g`,
      [teacherId, scope.rubricId ?? null, scope.ruleId ?? null],
    );
    const sum: RecomputeSummary = { recomputed: 0, promoted: 0, demoted: 0, belowFloor: 0 };
    for (const { id } of ids) {
      const out = await this.recomputeOne(m, id, reason, actorId);
      sum.recomputed++;
      if (out.scoreHundredths === null) sum.belowFloor++;
      const moved = await this.ruleLayerTransition(m, id, out);
      if (moved === 'promoted') sum.promoted++;
      if (moved === 'demoted') sum.demoted++;
    }
    return sum;
  }

  /** Tính và ghi cho MỘT bài; KHÔNG dời trạng thái. Người gọi đã khoá giảng viên. */
  async recomputeOne(
    m: EntityManager,
    resultId: string,
    reason: ScoreComputationReason,
    actorId: string | null,
  ): Promise<ScoreCoreOutput> {
    const ctx = await loadScoreContext(m, resultId);
    const out = await this.compute(m, ctx);
    if (out.scoreHundredths !== null) await this.insertComputation(m, ctx, reason, actorId, out);
    return out;
  }

  /** Như lượt tính, KHÔNG ghi — xem trước tác động của một giá hay một luật (T-POL-5). */
  async preview(resultId: string, transform: (rules: RuleSnapshot[]) => RuleSnapshot[]): Promise<ScoreCoreOutput> {
    const ctx = await loadScoreContext(this.ds.manager, resultId);
    return this.compute(this.ds.manager, ctx, transform);
  }

  /** Lượt tính theo bảng giá HIỆN HÀNH của giảng viên (phiên chưa chốt đi theo giá hiện hành, §2.2). */
  private async compute(
    m: EntityManager,
    ctx: ScoreContext,
    transform?: (rules: RuleSnapshot[]) => RuleSnapshot[],
  ): Promise<Computed> {
    if (!ctx.stored) throw new Error(`kết quả ${ctx.resultId} không có lượt chấm graded`);
    const price = await currentPriceVersion(m, ctx.teacherId);
    const rules = await loadRuleSnapshots(m, ctx.teacherId, price?.id ?? null);
    const out = computeScore({
      stored: ctx.stored,
      bundleCases: ctx.bundleCases,
      rubric: ctx.rubric,
      rules: transform ? transform(rules) : rules,
      sessionModelRules: await loadSessionModelRules(m, ctx.sessionId),
      waivedCriteria: ctx.waivedCriteria,
      exceptions: ctx.exceptions,
      theta: this.theta,
    });
    return { ...out, priceVersionId: price?.id ?? null };
  }

  private async insertComputation(
    m: EntityManager,
    ctx: ScoreContext,
    reason: ScoreComputationReason,
    actorId: string | null,
    out: Computed,
  ): Promise<string> {
    const repo = m.getRepository(ScoreComputationEntity);
    const row = await repo.save(
      repo.create({
        gradingResultId: ctx.resultId,
        attemptId: ctx.attemptId!,
        priceTableVersionId: out.priceVersionId,
        rubricIdVersion: ctx.rubricId,
        testBundleId: ctx.bundleId,
        reason,
        score: formatHundredths(out.scoreHundredths!),
        breakdown: out.breakdown as unknown as Record<string, unknown>,
        createdBy: actorId,
      }),
    );
    return row.id;
  }

  /** §14.3 — chỉ lượt tính TẦNG LUẬT mới được đưa bài flagged ⇄ auto_approved. */
  private async ruleLayerTransition(
    m: EntityManager,
    resultId: string,
    out: ScoreCoreOutput,
  ): Promise<'promoted' | 'demoted' | null> {
    if (out.outcome === 'auto') {
      const [r] = await m.query(`SELECT ungradable_class FROM examcollect.grading_result WHERE id = $1`, [resultId]);
      if (r.ungradable_class !== null) return null;
      const promoted = await advanceStatus(m, resultId, ['flagged_for_review'], 'auto_approved', { flagForReview: false });
      return promoted ? 'promoted' : null;
    }
    if (await advanceStatus(m, resultId, ['auto_approved'], 'flagged_for_review', { flagForReview: true })) return 'demoted';
    // Bài đang kiểm mẫu bị huỷ khỏi mẫu (§14.3): cờ rút mẫu tắt cùng bước chuyển.
    const unsampled = await advanceStatus(m, resultId, ['audit_pending'], 'flagged_for_review', {
      flagForReview: true,
      auditSampled: false,
      auditSampledAt: null,
    });
    return unsampled ? 'demoted' : null;
  }
}

import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { AuditLogService } from '../../admin/audit-log.service';
import { readAutoThreshold } from '../decision/threshold';
import { GradingResultEntity } from '../entities/grading-result.entity';
import type { ScoreComputationReason } from '../grading-model.types';
import { advanceStatus } from '../lifecycle/advance';
import { formatHundredths, parseHundredths } from './hundredths';
import { computeScore, RuleSnapshot, ScoreBreakdown, ScoreCoreOutput } from './score-core';
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

/** Luật mà mức trừ (hay việc được tính) đổi giữa lượt tính đã chốt và lượt tính mới — cho audit. */
function changedRules(
  before: ScoreBreakdown | null,
  after: ScoreBreakdown,
): { ruleId: string; ruleKey: string; oldDeduction: string | null; newDeduction: string | null }[] {
  const fmt = (n: number | null | undefined) => (n === null || n === undefined ? null : formatHundredths(n));
  const old = new Map((before?.errors ?? []).map((e) => [e.ruleId, e]));
  const next = new Map(after.errors.map((e) => [e.ruleId, e]));
  const out: { ruleId: string; ruleKey: string; oldDeduction: string | null; newDeduction: string | null }[] = [];
  for (const e of after.errors) {
    const o = old.get(e.ruleId);
    if (!o || o.deductionHundredths !== e.deductionHundredths || o.counted !== e.counted) {
      out.push({ ruleId: e.ruleId, ruleKey: e.ruleKey, oldDeduction: fmt(o?.deductionHundredths), newDeduction: fmt(e.deductionHundredths) });
    }
  }
  for (const o of before?.errors ?? []) {
    if (!next.has(o.ruleId)) out.push({ ruleId: o.ruleId, ruleKey: o.ruleKey, oldDeduction: fmt(o.deductionHundredths), newDeduction: null });
  }
  return out;
}

/**
 * Chỗ DUY NHẤT ghi `score_computation` (§2.2 *"dòng tính lại"*) và dời trạng thái sau một lượt
 * tính. Mọi dịch vụ khác — giá, luật, ngoại lệ, đánh dấu, chốt — gọi vào đây, trong transaction
 * của chính nó, nên thay đổi và mọi lượt tính lại nó gây ra commit cùng nhau.
 */
@Injectable()
export class ScoreService {
  private readonly theta = readAutoThreshold(process.env).theta;

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    // Sửa điểm đã công bố phải để lại dấu vết — Security rule 4, do service chịu (không trigger).
    private readonly audit: AuditLogService,
  ) {}

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
                                WHERE c.grading_result_id = g.id ORDER BY c.created_at DESC, c.id DESC LIMIT 1) last
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

  /**
   * *"Áp giá mới cho phiên này"* — đường DUY NHẤT đổi điểm của phiên đã chốt theo bảng giá hiện
   * hành (§2.2). Mỗi bài bị đổi điểm có một dòng `audit_log`: người bấm, luật, giá cũ, giá mới,
   * điểm cũ, điểm mới. Rồi phiên ghim bản giá hiện hành. Bấm lại khi không còn gì khác → 0.
   */
  async reapplyFinalizedSession(sessionId: string, teacherId: string): Promise<{ changed: number }> {
    return this.ds.transaction(async (m) => {
      const [session] = await m.query(`SELECT teacher_id FROM examcollect.exam_session WHERE id = $1`, [sessionId]);
      if (!session || session.teacher_id !== teacherId) throw new NotFoundException('Không tìm thấy phiên thi');
      await lockTeacherScoring(m, teacherId);
      const [state] = await m.query(
        `SELECT count(*)::int AS total,
                count(*) FILTER (WHERE g.status IN ('finalized', 'exported'))::int AS published
           FROM examcollect.grading_result g
           JOIN examcollect.submission s ON s.id = g.submission_id
          WHERE s.exam_session_id = $1`,
        [sessionId],
      );
      if (state.total === 0 || state.published !== state.total) {
        throw new ConflictException('Phiên chưa chốt — giá mới đã tự áp cho phiên chưa chốt');
      }
      const rows: { id: string; score: string | null; computation_id: string | null; price_id: string | null; breakdown: ScoreBreakdown | null }[] =
        await m.query(
          `SELECT g.id, fc.score, fc.id AS computation_id, fc.price_table_version_id AS price_id, fc.breakdown
             FROM examcollect.grading_result g
             JOIN examcollect.submission s ON s.id = g.submission_id
             JOIN examcollect.grading_attempt a ON a.id = g.current_attempt_id AND a.outcome = 'graded'
             LEFT JOIN examcollect.score_computation fc ON fc.id = g.finalized_computation_id
            WHERE s.exam_session_id = $1 AND g.pipeline = 'investigator'
              AND NOT EXISTS (SELECT 1 FROM examcollect.teacher_review t
                               WHERE t.grading_result_id = g.id AND t.kind = 'manual_score')
            ORDER BY g.id
            FOR UPDATE OF g`,
          [sessionId],
        );
      let changed = 0;
      for (const r of rows) {
        const ctx = await loadScoreContext(m, r.id);
        const out = await this.compute(m, ctx);
        // Dưới sàn thì không có điểm mới nào để công bố — giữ điểm đã chốt.
        if (out.scoreHundredths === null) continue;
        const score = formatHundredths(out.scoreHundredths);
        if (r.score !== null && formatHundredths(parseHundredths(r.score)) === score) continue;
        const computationId = await this.insertComputation(m, ctx, 'finalized_reapply', teacherId, out);
        await m.update(GradingResultEntity, r.id, { finalizedComputationId: computationId });
        await this.audit.recordUserAction(
          {
            actorId: teacherId,
            action: 'grading_result.score_reapplied_after_finalize',
            targetType: 'grading_result',
            targetId: r.id,
            oldValue: { score: r.score, priceTableVersionId: r.price_id, computationId: r.computation_id },
            newValue: {
              score,
              priceTableVersionId: out.priceVersionId,
              computationId,
              changedRules: changedRules(r.breakdown, out.breakdown),
            },
          },
          m,
        );
        changed++;
      }
      const price = await currentPriceVersion(m, teacherId);
      await m.query(`UPDATE examcollect.exam_session SET pinned_price_version_id = $2 WHERE id = $1`, [sessionId, price?.id ?? null]);
      return { changed };
    });
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
    // `created_at = clock_timestamp()`, KHÔNG mặc định `now()`: `now()` là lúc transaction BẮT
    // ĐẦU, nên một lượt sửa giá mở trước nhưng tính lại sau (review C1) sẽ ghi dòng "cũ hơn" dòng
    // nó vừa thay. Mọi dòng ở đây ghi SAU khoá theo giảng viên, nên đồng hồ thật tăng đúng theo thứ
    // tự khoá — và "lượt tính mới nhất" là lượt tính sau cùng.
    const [row] = await m.query(
      `INSERT INTO examcollect.score_computation
         (grading_result_id, attempt_id, price_table_version_id, rubric_id_version, test_bundle_id,
          reason, score, breakdown, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, clock_timestamp())
       RETURNING id`,
      [
        ctx.resultId,
        ctx.attemptId!,
        out.priceVersionId,
        ctx.rubricId,
        ctx.bundleId,
        reason,
        formatHundredths(out.scoreHundredths!),
        JSON.stringify(out.breakdown),
        actorId,
      ],
    );
    return row.id as string;
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

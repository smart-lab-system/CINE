import type { UsageByModel } from '../investigator/usage-sink';
import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { AuditLogService } from '../../admin/audit-log.service';
import { isNoErrorBreakerOpen, loadOpenBreakerRuleKeys } from '../auto-breaker/breaker-queries';
import { readAutoBlockedRules, readAutoNoError, readAutoThreshold } from '../decision/threshold';
import { drawnForStudentAudit, ensureSessionMinimum, readAuditMinPerSession, readAuditSampling } from '../audit-sampling';
import { GradingResultEntity } from '../entities/grading-result.entity';
import type { ScoreComputationReason } from '../grading-model.types';
import { advanceStatus } from '../lifecycle/advance';
import { formatHundredths, parseHundredths } from './hundredths';
import { computeScore, repriceBreakdown, RuleSnapshot, ScoreBreakdown, ScoreCoreOutput } from './score-core';
import {
  currentPriceVersion,
  latestComputationRow,
  loadRuleSnapshots,
  loadScoreContext,
  lockTeacherScoring,
  ScoreContext,
  teacherOfResult,
} from './score-inputs';
import { recordMissingRules } from '../rules/missing-rules';
import type { StoredInvestigation } from './stored-investigation';

/** Phần đo đạc của một lượt chấm, ghi vào dòng `grading_attempt` cùng lúc với kết cục. */
export interface AttemptMeta {
  modelUsed: string | null;
  tokensIn: number;
  tokensOut: number;
  sandboxHost: object | null;
  /** P0 đo nền — mọi trường tuỳ chọn; không khai thì ghi NULL (hành vi cũ). */
  promptVersion?: string | null;
  usageByModel?: { investigation: UsageByModel; challenge: UsageByModel } | null;
  costUsd?: number | null;
}

export type FinishOutcome =
  | { kind: 'scored'; outcome: 'auto' | 'flagged'; scoreHundredths: number; computationId: string }
  | { kind: 'ungradable'; class: 'system' | 'submission'; reason: string };

export interface RecomputeSummary {
  recomputed: number;
  promoted: number;
  demoted: number;
  /** Lượt tính lại ra dưới sàn — không ghi được dòng (điểm NOT NULL), bài tự quyết về gắn cờ. */
  belowFloor: number;
}

type Computed = ScoreCoreOutput & { priceVersionId: string | null };

/** Kế hoạch của *"áp giá mới cho phiên này"* — xem trước trả đúng thứ này. */
export interface ReapplyPlan {
  changes: {
    resultId: string;
    oldScore: string;
    newScore: string;
    changedRules: { ruleId: string; ruleKey: string; oldDeduction: string | null; newDeduction: string | null }[];
  }[];
  /** Bài không áp được: luật lúc chốt có giá nay chưa có — lượt áp thật từ chối khi danh sách này khác rỗng. */
  skipped: { resultId: string; reason: 'unpriced'; ruleKeys: string[] }[];
}

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
  /** Tỉ lệ kiểm mẫu — đọc lúc khởi tạo như `theta`. Tên khác `audit`: field đó là `AuditLogService`. */
  private readonly sampling = readAuditSampling(process.env);
  private readonly auditMinPerSession = readAuditMinPerSession(process.env);
  /**
   * Cờ tự chốt từ env (§5.2) — đọc lúc khởi tạo như `theta`, không đọc lại mỗi lượt tính. Công tắc khẩn cấp áp cho
   * mọi giảng viên; cầu dao DB của từng giảng viên (§5.3) hợp thêm vào đúng chỗ truyền ở `compute()`.
   */
  private readonly autoBlocked = readAutoBlockedRules(process.env);
  private readonly autoNoError = readAutoNoError(process.env);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    // Sửa điểm đã công bố phải để lại dấu vết — Security rule 4, do service chịu (không trigger).
    private readonly audit: AuditLogService,
  ) {
    if (this.sampling.warning) new Logger(ScoreService.name).warn(this.sampling.warning);
    if (this.autoBlocked.warning) new Logger(ScoreService.name).warn(this.autoBlocked.warning);
    if (this.autoNoError.warning) new Logger(ScoreService.name).warn(this.autoNoError.warning);
  }

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
      return this.writeInitial(m, ctx, ctx.stored, { ...out, scoreHundredths: out.scoreHundredths });
    });
  }

  /**
   * Kết thúc MỘT lượt chấm điều tra đang chạy (3d), trong MỘT transaction: quyết kết cục bằng đúng
   * lõi `computeScore()` trên hồ sơ vừa có, RỒI mới ghi — lượt chấm bất biến từ lúc có kết cục
   * (§14.4), nên không có đường "ghi graded rồi phát hiện dưới sàn". Ra điểm → lượt `graded` + lượt
   * tính đầu; không chấm được → lượt `ungradable` + bài gắn cờ đúng lớp (§4.4). Luật còn thiếu agent
   * báo thành dòng `proposed` ở cả hai nhánh (§2.1).
   */
  async finishAttempt(resultId: string, attemptId: string, stored: StoredInvestigation, meta: AttemptMeta): Promise<FinishOutcome> {
    return this.ds.transaction(async (m) => {
      const ctx = await this.lockRunning(m, resultId, attemptId, stored);
      if (stored.result.verdict?.missingRules?.length) {
        await recordMissingRules(m, ctx.teacherId, stored.result.verdict.missingRules, {
          resultId,
          sessionId: ctx.sessionId,
          rubricName: ctx.rubricName,
        });
      }
      let ungradable: { class: 'system' | 'submission'; reason: string } | null = null;
      let out: Computed | null = null;
      if (stored.result.kind === 'ungradable') {
        ungradable = stored.result.ungradable ?? { class: 'system', reason: 'cuộc điều tra không có kết luận' };
      } else {
        out = await this.compute(m, ctx);
        if (out.outcome === 'ungradable' || out.scoreHundredths === null) {
          ungradable = out.ungradable ?? { class: 'system', reason: 'lượt tính ra dưới sàn' };
        }
      }
      if (ungradable) {
        await this.closeUngradable(m, resultId, attemptId, ungradable, stored, meta);
        return { kind: 'ungradable', ...ungradable };
      }
      await m.query(
        `UPDATE examcollect.grading_attempt
            SET outcome = 'graded', investigation = $2, model_used = $3, tokens_in = $4, tokens_out = $5,
                sandbox_host = $6, prompt_version = $7, usage_by_model = $8, cost_usd = $9,
                finished_at = clock_timestamp()
          WHERE id = $1 AND outcome IS NULL`,
        [
          attemptId,
          JSON.stringify(stored),
          meta.modelUsed,
          meta.tokensIn,
          meta.tokensOut,
          meta.sandboxHost === null ? null : JSON.stringify(meta.sandboxHost),
          meta.promptVersion ?? null,
          meta.usageByModel == null ? null : JSON.stringify(meta.usageByModel),
          meta.costUsd ?? null,
        ],
      );
      const scored = await this.writeInitial(m, ctx, stored, { ...out!, scoreHundredths: out!.scoreHundredths! });
      return { kind: 'scored', ...scored };
    });
  }

  /** Hỏng TRƯỚC khi điều tra (thiếu thước, thiếu đề chữ, bài nộp không đọc được, chưa cấu hình): đóng lượt đang chạy. */
  async finishUngradable(resultId: string, attemptId: string, u: { class: 'system' | 'submission'; reason: string }): Promise<void> {
    await this.ds.transaction(async (m) => {
      await this.lockRunning(m, resultId, attemptId);
      await this.closeUngradable(m, resultId, attemptId, u, null, null);
    });
  }

  /** Khoá giảng viên rồi dòng kết quả; đòi đúng lượt đang chạy là lượt hiện hành — không thì job cũ. */
  private async lockRunning(m: EntityManager, resultId: string, attemptId: string, stored?: StoredInvestigation): Promise<ScoreContext> {
    await lockTeacherScoring(m, await teacherOfResult(m, resultId));
    const [row] = await m.query(
      `SELECT g.pipeline, g.status, g.current_attempt_id, a.outcome
         FROM examcollect.grading_result g
         LEFT JOIN examcollect.grading_attempt a ON a.id = $2
        WHERE g.id = $1
        FOR UPDATE OF g`,
      [resultId, attemptId],
    );
    if (!row || row.pipeline !== 'investigator' || row.status !== 'ai_grading' || row.current_attempt_id !== attemptId || row.outcome !== null) {
      throw new Error(`lượt chấm ${attemptId} của kết quả ${resultId} không còn là lượt đang chạy — bỏ`);
    }
    return loadScoreContext(m, resultId, stored);
  }

  private async closeUngradable(
    m: EntityManager,
    resultId: string,
    attemptId: string,
    u: { class: 'system' | 'submission'; reason: string },
    stored: StoredInvestigation | null,
    meta: AttemptMeta | null,
  ): Promise<void> {
    await m.query(
      `UPDATE examcollect.grading_attempt
          SET outcome = 'ungradable', ungradable_class = $2, ungradable_reason = $3, investigation = $4,
              model_used = $5, tokens_in = $6, tokens_out = $7, sandbox_host = $8,
              prompt_version = $9, usage_by_model = $10, cost_usd = $11, finished_at = clock_timestamp()
        WHERE id = $1 AND outcome IS NULL`,
      [
        attemptId,
        u.class,
        u.reason,
        stored === null ? null : JSON.stringify(stored),
        meta?.modelUsed ?? null,
        meta?.tokensIn ?? null,
        meta?.tokensOut ?? null,
        meta?.sandboxHost == null ? null : JSON.stringify(meta.sandboxHost),
        meta?.promptVersion ?? null,
        meta?.usageByModel == null ? null : JSON.stringify(meta.usageByModel),
        meta?.costUsd ?? null,
      ],
    );
    const updated = await m
      .createQueryBuilder()
      .update(GradingResultEntity)
      .set({ status: 'flagged_for_review', flagForReview: true, confidence: '0', ungradableClass: u.class, ungradableReason: u.reason })
      .where('id = :id', { id: resultId })
      .andWhere("status = 'ai_grading'")
      .execute();
    if ((updated.affected ?? 0) === 0) throw new Error(`kết quả ${resultId} đã rời ai_grading`);
  }

  /** Nửa sau chung của lượt tính đầu: dòng `initial`, cột AI và bước chuyển trạng thái. */
  private async writeInitial(
    m: EntityManager,
    ctx: ScoreContext,
    stored: StoredInvestigation,
    out: Computed & { scoreHundredths: number },
  ): Promise<{ outcome: 'auto' | 'flagged'; computationId: string; scoreHundredths: number }> {
    const computationId = await this.insertComputation(m, ctx, 'initial', null, out);
    // `ai_total_score` = điểm của lượt tính đầu, dưới trigger bất biến (§14.2): ghi CÙNG UPDATE
    // với các cột AI khác, vì guard đóng băng chúng ngay khi `ai_total_score` có.
    // `criterion_results` giữ `[]`: khuôn cột đó là của one_shot và calibration đọc nó; khung trừ
    // điểm của đường điều tra nằm ở `breakdown`. Lớp lý do xoá: bài được chấm lại (§2.3) giờ đã có
    // điểm, và `ck_grading_result_ungradable` cấm mang cả hai.
    const wrote = await m
      .createQueryBuilder()
      .update(GradingResultEntity)
      .set({
        status: 'ai_graded',
        aiTotalScore: formatHundredths(out.scoreHundredths),
        confidence: out.breakdown.confidence === null ? null : out.breakdown.confidence.toFixed(3),
        modelUsed: stored.result.investigation.modelsUsed.join('+').slice(0, 100) || null,
        ungradableClass: null,
        ungradableReason: null,
      })
      .where('id = :id', { id: ctx.resultId })
      .andWhere("status = 'ai_grading'")
      .execute();
    if ((wrote.affected ?? 0) === 0) throw new Error(`kết quả ${ctx.resultId} đã rời ai_grading`);
    const outcome = out.outcome === 'auto' ? 'auto' : 'flagged';
    const to = outcome === 'auto' ? 'auto_approved' : 'flagged_for_review';
    await advanceStatus(m, ctx.resultId, ['ai_graded'], to, { flagForReview: to === 'flagged_for_review' });

    // §8.1 — rút mẫu kiểm ở QUYẾT ĐỊNH ĐẦU TIÊN, và chỉ ở đây. `writeInitial` là lượt tính đầu (cả
    // `computeInitial` lẫn `finishAttempt` đều qua nó), nên bài nào tới đây với `auto_approved` là bài hệ thống
    // tự tin ngay từ đầu. Bài thành tự quyết SAU khi gắn cờ (`ruleLayerTransition`) không đi qua đây → không
    // bao giờ vào khung (T-SAMP-5). Trigger không có cặp `ai_graded → audit_pending`, nên là HAI bước trong
    // cùng transaction; hai cột cờ đổi trong MỘT câu lệnh vì `ck_grading_result_audit_sampled_at`.
    if (to === 'auto_approved' && (await this.drawnForAudit(m, ctx))) {
      await advanceStatus(m, ctx.resultId, ['auto_approved'], 'audit_pending', {
        auditSampled: true,
        auditSampledAt: new Date(),
      });
    }

    // §5.6 — số mẫu tối thiểu theo phiên: chỉ có nghĩa khi không còn bài nào của phiên đang chấm.
    await this.topUpSessionAudit(m, ctx);

    return { outcome, computationId, scoreHundredths: out.scoreHundredths };
  }

  /**
   * Lượt tính lại TẦNG LUẬT cho mọi bài chưa chốt của một giảng viên, trong transaction của người
   * gọi. `ruleId` → chỉ bài mà lượt tính mới nhất có lỗi của luật đó; `rubricId` → chỉ bài của
   * rubric đó; `rubricName` → chỉ bài của mọi phiên bản rubric mang tên đó; `noErrors` → chỉ bài mà
   * lượt tính mới nhất có `breakdown.errors` rỗng (lớp bài không lỗi của cầu dao, spec 2026-10-21 §5.3).
   * Bài chấm tay không bao giờ tính lại (§2.2).
   */
  async recomputeForTeacher(
    m: EntityManager,
    teacherId: string,
    reason: ScoreComputationReason,
    actorId: string | null,
    scope: {
      ruleId?: string;
      rubricId?: string;
      rubricName?: string;
      sessionId?: string;
      exceptResultId?: string;
      noErrors?: boolean;
    } = {},
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
          AND ($4::uuid IS NULL OR s.exam_session_id = $4)
          AND ($5::uuid IS NULL OR g.id <> $5)
          AND ($6::text IS NULL OR g.rubric_id_version IN (
                SELECT id FROM examcollect.rubric WHERE teacher_id = $1 AND name = $6))
          AND ($3::uuid IS NULL OR EXISTS (
                SELECT 1 FROM (SELECT c.breakdown FROM examcollect.score_computation c
                                WHERE c.grading_result_id = g.id ORDER BY c.created_at DESC, c.id DESC LIMIT 1) last
                 WHERE last.breakdown -> 'errors' @> jsonb_build_array(jsonb_build_object('ruleId', $3::text))))
          AND (NOT $7::boolean OR EXISTS (
                SELECT 1 FROM (SELECT c.breakdown FROM examcollect.score_computation c
                                WHERE c.grading_result_id = g.id ORDER BY c.created_at DESC, c.id DESC LIMIT 1) last
                 WHERE jsonb_array_length(last.breakdown -> 'errors') = 0))
        ORDER BY g.id
        FOR UPDATE OF g`,
      [
        teacherId,
        scope.rubricId ?? null,
        scope.ruleId ?? null,
        scope.sessionId ?? null,
        scope.exceptResultId ?? null,
        scope.rubricName ?? null,
        scope.noErrors === true,
      ],
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
    // Dưới sàn cũng là một dòng (điểm null, review I2): không có nó thì lượt tính cũ — theo bảng lỗi
    // đã đổi — vẫn là điểm hiện tại và bị chốt.
    await this.insertComputation(m, ctx, reason, actorId, out);
    return out;
  }

  /**
   * Xem trước *"áp giá mới cho phiên này"* — KHÔNG ghi gì (spec UI nguyên tắc 4: thao tác ảnh hưởng
   * nhiều bài phải xem trước tác động). Cùng kế hoạch mà lượt áp thật sẽ chạy.
   */
  async previewReapply(sessionId: string, teacherId: string): Promise<ReapplyPlan> {
    return this.ds.transaction(async (m) => {
      const plan = await this.planReapply(m, sessionId, teacherId, false);
      return {
        changes: plan.items.map(({ resultId, oldScore, newScore, changedRules: rules }) => ({ resultId, oldScore, newScore, changedRules: rules })),
        skipped: plan.skipped,
      };
    });
  }

  /**
   * *"Áp giá mới cho phiên này"* — đường DUY NHẤT đổi điểm của phiên đã chốt theo bảng giá hiện
   * hành (§2.2), và nó đổi GIÁ, không gì khác (review I3): cùng tập lỗi của lượt tính đã chốt, mức
   * trừ theo bảng hiện hành. Mỗi bài bị đổi điểm có một dòng `audit_log`: người bấm, luật, giá cũ,
   * giá mới, điểm cũ, điểm mới. Rồi phiên ghim bản giá hiện hành. Bấm lại khi không còn gì → 0.
   *
   * Có bài mà một luật lúc chốt có giá nay về chưa giá → TỪ CHỐI cả lượt: công bố nó là công bố một
   * lỗi miễn phí (§2.1), còn áp một phần thì phiên đứng trên hai bảng giá — trái nghĩa của ghim.
   */
  async reapplyFinalizedSession(sessionId: string, teacherId: string): Promise<{ changed: number }> {
    return this.ds.transaction(async (m) => {
      const plan = await this.planReapply(m, sessionId, teacherId, true);
      if (plan.skipped.length > 0) {
        throw new ConflictException(
          `${plan.skipped.length} bài dính luật lúc chốt có giá mà nay chưa có giá — đặt giá trước khi áp cho phiên đã chốt.`,
        );
      }
      for (const it of plan.items) {
        const computationId = await this.insertComputation(m, it.ctx, 'finalized_reapply', teacherId, {
          outcome: 'flagged',
          ungradable: null,
          scoreHundredths: it.scoreHundredths,
          breakdown: it.breakdown,
          priceVersionId: plan.priceVersionId,
        });
        await m.update(GradingResultEntity, it.resultId, { finalizedComputationId: computationId });
        await this.audit.recordUserAction(
          {
            actorId: teacherId,
            action: 'grading_result.score_reapplied_after_finalize',
            targetType: 'grading_result',
            targetId: it.resultId,
            oldValue: { score: it.oldScore, priceTableVersionId: it.oldPriceId, computationId: it.oldComputationId },
            newValue: { score: it.newScore, priceTableVersionId: plan.priceVersionId, computationId, changedRules: it.changedRules },
          },
          m,
        );
      }
      await m.query(`UPDATE examcollect.exam_session SET pinned_price_version_id = $2 WHERE id = $1`, [
        sessionId,
        plan.priceVersionId,
      ]);
      return { changed: plan.items.length };
    });
  }

  /** Kế hoạch chung của xem trước và áp thật: bài nào đổi điểm, bài nào không áp được. */
  private async planReapply(m: EntityManager, sessionId: string, teacherId: string, lockRows: boolean) {
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
    const price = await currentPriceVersion(m, teacherId);
    // Giá theo rubric CỦA TỪNG KẾT QUẢ (§3.4 rules-by-rubric), không theo rubric của phiên: một phiên có thể có bài
    // chấm theo rubric khác. Lấy tên rubric của các kết quả trong phiên, rồi các luật và giá của những rubric đó.
    const priceRows: { rubric_name: string; error_rule_id: string; deduction: string | null }[] = price
      ? await m.query(
          `SELECT used.name AS rubric_name, re.error_rule_id, p.deduction
             FROM (SELECT DISTINCT rb.name
                     FROM examcollect.grading_result g
                     JOIN examcollect.submission s ON s.id = g.submission_id
                     JOIN examcollect.rubric rb ON rb.id = g.rubric_id_version
                    WHERE s.exam_session_id = $1) used
             JOIN examcollect.rubric_error re ON re.teacher_id = $3 AND re.rubric_name = used.name AND re.removed_at IS NULL
             JOIN examcollect.rubric_error_price p ON p.rubric_error_id = re.id AND p.price_table_version_id = $2`,
          [sessionId, price.id, teacherId],
        )
      : [];
    // Khoá theo rubric trước, rồi theo luật: `error_rule_id` dùng chung giữa các rubric, nên một bảng phẳng sẽ để
    // giá của rubric này đè giá của rubric kia (đã thấy trong bài kiểm bẫy 8).
    const pricesByRubric = new Map<string, Map<string, number | null>>();
    for (const p of priceRows) {
      const byRule = pricesByRubric.get(p.rubric_name) ?? new Map<string, number | null>();
      byRule.set(p.error_rule_id, p.deduction === null ? null : parseHundredths(p.deduction));
      pricesByRubric.set(p.rubric_name, byRule);
    }
    const rows: { id: string; score: string; computation_id: string; price_id: string | null; breakdown: ScoreBreakdown }[] =
      await m.query(
        `SELECT g.id, fc.score, fc.id AS computation_id, fc.price_table_version_id AS price_id, fc.breakdown
           FROM examcollect.grading_result g
           JOIN examcollect.submission s ON s.id = g.submission_id
           JOIN examcollect.score_computation fc ON fc.id = g.finalized_computation_id AND fc.score IS NOT NULL
          WHERE s.exam_session_id = $1 AND g.pipeline = 'investigator'
            AND NOT EXISTS (SELECT 1 FROM examcollect.teacher_review t
                             WHERE t.grading_result_id = g.id AND t.kind = 'manual_score')
          ORDER BY g.id
          ${lockRows ? 'FOR UPDATE OF g' : ''}`,
        [sessionId],
      );
    const items: {
      resultId: string;
      oldScore: string;
      newScore: string;
      changedRules: ReturnType<typeof changedRules>;
      ctx: ScoreContext;
      breakdown: ScoreBreakdown;
      scoreHundredths: number;
      oldComputationId: string;
      oldPriceId: string | null;
    }[] = [];
    const skipped: ReapplyPlan['skipped'] = [];
    for (const r of rows) {
      const ctx = await loadScoreContext(m, r.id);
      const re = repriceBreakdown(r.breakdown, ctx.rubric, pricesByRubric.get(ctx.rubricName) ?? new Map());
      if (re.newlyUnpriced.length > 0) {
        skipped.push({ resultId: r.id, reason: 'unpriced', ruleKeys: re.newlyUnpriced.map((u) => u.ruleKey) });
        continue;
      }
      const oldScore = formatHundredths(parseHundredths(r.score));
      const newScore = formatHundredths(re.scoreHundredths);
      if (oldScore === newScore) continue;
      items.push({
        resultId: r.id,
        oldScore,
        newScore,
        changedRules: changedRules(r.breakdown, re.breakdown),
        ctx,
        breakdown: re.breakdown,
        scoreHundredths: re.scoreHundredths,
        oldComputationId: r.computation_id,
        oldPriceId: r.price_id,
      });
    }
    return { items, skipped, priceVersionId: price?.id ?? null };
  }

  /** Như lượt tính, KHÔNG ghi — xem trước tác động của một giá hay một luật (T-POL-5). */
  async preview(resultId: string, transform: (rules: RuleSnapshot[]) => RuleSnapshot[]): Promise<ScoreCoreOutput> {
    const ctx = await loadScoreContext(this.ds.manager, resultId);
    return this.compute(this.ds.manager, ctx, transform);
  }

  /**
   * Lượt tính theo bảng giá HIỆN HÀNH của giảng viên (phiên chưa chốt đi theo giá hiện hành, §2.2).
   *
   * Cờ tự chốt (spec 2026-10-21 §5.2): tập chặn = env ∪ cầu dao luật đang mở của giảng viên, dựng thành Set MỚI mỗi
   * lượt (tập env dùng chung cho mọi lượt, không được sửa); tự chốt bài không lỗi = env VÀ cầu dao lớp không mở. Đọc
   * cầu dao bằng chính `m`: cầu dao vừa tắt trong giao dịch ghi nhãn phải chặn ngay lượt tính lại cùng giao dịch.
   */
  private async compute(
    m: EntityManager,
    ctx: ScoreContext,
    transform?: (rules: RuleSnapshot[]) => RuleSnapshot[],
  ): Promise<Computed> {
    if (!ctx.stored) throw new Error(`kết quả ${ctx.resultId} không có lượt chấm graded`);
    const price = await currentPriceVersion(m, ctx.teacherId);
    const rules = await loadRuleSnapshots(m, ctx.teacherId, ctx.rubricName, price?.id ?? null);
    const breakerKeys = await loadOpenBreakerRuleKeys(m, ctx.teacherId);
    const noErrorBreakerOpen = await isNoErrorBreakerOpen(m, ctx.teacherId);
    const out = computeScore({
      stored: ctx.stored,
      bundleCases: ctx.bundleCases,
      rubric: ctx.rubric,
      rules: transform ? transform(rules) : rules,
      waivedCriteria: ctx.waivedCriteria,
      exceptions: ctx.exceptions,
      theta: this.theta,
      rulerTrust: ctx.rulerTrust,
      autoBlockedRuleKeys: new Set([...this.autoBlocked.keys, ...breakerKeys]),
      autoNoErrorEnabled: this.autoNoError.enabled && !noErrorBreakerOpen,
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
        out.scoreHundredths === null ? null : formatHundredths(out.scoreHundredths),
        JSON.stringify(out.breakdown),
        actorId,
      ],
    );
    return row.id as string;
  }

  /**
   * Số mẫu tối thiểu theo phiên (spec §5.6). Khi không còn bài nào của phiên ở `ai_grading`/`ai_graded`, bảo đảm có đủ
   * sinh viên có bài trong mẫu kiểm. Chỉ bổ sung các bài `auto_approved`, và rút theo sinh viên (P1b): mọi bài của một
   * sinh viên được bổ sung cùng nhau. Dưới khoá theo giảng viên của transaction này.
   */
  private async topUpSessionAudit(m: EntityManager, ctx: ScoreContext): Promise<void> {
    if (!this.sampling.enabled || this.auditMinPerSession === 0) return;
    await lockTeacherScoring(m, ctx.teacherId);
    const [busy] = await m.query(
      `SELECT COUNT(*)::int AS n
         FROM examcollect.grading_result g
         JOIN examcollect.submission s ON s.id = g.submission_id
        WHERE s.exam_session_id = $1 AND g.status IN ('ai_grading', 'ai_graded')`,
      [ctx.sessionId],
    );
    if (Number(busy.n) > 0) return;
    // `audit_pending` cũng đếm: bài vừa rút ở chính lượt này đã sang đó, và sinh viên của nó phải được tính là đã có mẫu.
    const rows: { result_id: string; mssv: string; status: string; audit_sampled: boolean }[] = await m.query(
      `SELECT g.id AS result_id, s.student_mssv AS mssv, g.status AS status, g.audit_sampled AS audit_sampled
         FROM examcollect.grading_result g
         JOIN examcollect.submission s ON s.id = g.submission_id
        WHERE s.exam_session_id = $1 AND g.status IN ('auto_approved', 'audit_pending')`,
      [ctx.sessionId],
    );
    const students = rows.map((r) => r.mssv);
    const sampled = rows.filter((r) => r.audit_sampled).map((r) => r.mssv);
    const sampledLower = new Set(sampled.map((x) => x.toLowerCase()));
    const wanted = new Set(ensureSessionMinimum(sampled, students, this.auditMinPerSession).map((x) => x.toLowerCase()));
    for (const row of rows) {
      const key = row.mssv.toLowerCase();
      if (row.status !== 'auto_approved' || sampledLower.has(key) || !wanted.has(key)) continue;
      await advanceStatus(m, row.result_id, ['auto_approved'], 'audit_pending', {
        auditSampled: true,
        auditSampledAt: new Date(),
      });
    }
  }

  /**
   * Bài này có được rút vào mẫu kiểm không — chỉ phụ thuộc seed của phiên và MSSV của sinh viên (P1b §8): mọi câu tự
   * duyệt của một sinh viên được rút cùng nhau, nên không thể rút một câu mà bỏ câu kia.
   */
  private async drawnForAudit(m: EntityManager, ctx: ScoreContext): Promise<boolean> {
    if (!this.sampling.enabled) return false;
    const [row] = await m.query(
      `SELECT es.grading_seed, s.student_mssv
         FROM examcollect.grading_result g
         JOIN examcollect.submission s ON s.id = g.submission_id
         JOIN examcollect.exam_session es ON es.id = s.exam_session_id
        WHERE g.id = $1`,
      [ctx.resultId],
    );
    return row !== undefined && drawnForStudentAudit(row.grading_seed as string, row.student_mssv as string, this.sampling.percent);
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

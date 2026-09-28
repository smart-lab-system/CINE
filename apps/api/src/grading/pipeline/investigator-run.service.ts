import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { runCaseLens } from '../investigator/case-lens';
import { challenge } from '../investigator/challenge';
import type { StoredChallenge } from '../investigator/challenge';
import { investigate } from '../investigator/investigate';
import type { InvestigationContext, InvestigationResult, Verdict } from '../investigator/types';
import { lockTeacherScoring, teacherOfResult } from '../scoring/score-inputs';
import { ScoreService } from '../scoring/score.service';
import type { StoredInvestigation } from '../scoring/stored-investigation';
import { InvestigationContextService } from './investigation-context.service';
import { INVESTIGATOR_DEPS, InvestigatorDeps } from './investigator-deps';

function hostOf(result: InvestigationResult): object | null {
  for (const s of Object.values(result.investigation.structuredResults)) if (s.host) return s.host;
  return null;
}

/**
 * Nhánh `investigator` của worker chấm (3d): mở — hay nối lại — MỘT lượt chấm, dựng ngữ cảnh, điều
 * tra, rồi giao hồ sơ cho `ScoreService.finishAttempt` quyết và ghi trong một transaction. Mọi
 * đường hỏng đã biết đều kết thúc lượt bằng một kết cục có lớp (§4.4); chỉ lỗi bất ngờ mới NÉM để
 * BullMQ thử lại — và lần thử lại nối vào đúng lượt đang chạy, không mở lượt thứ hai.
 */
@Injectable()
export class InvestigatorRunService {
  private readonly logger = new Logger(InvestigatorRunService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly contexts: InvestigationContextService,
    private readonly scores: ScoreService,
    @Inject(INVESTIGATOR_DEPS) private readonly deps: InvestigatorDeps,
  ) {}

  async run(resultId: string): Promise<void> {
    const attemptId = await this.startAttempt(resultId);
    if (!attemptId) return;

    const missing = [
      this.deps.sandbox === null ? 'sandbox (SANDBOX_REDIS_URL)' : null,
      this.deps.models.length === 0 ? 'bậc model (GRADING_TIER*)' : null,
    ].filter((x): x is string => x !== null);
    if (missing.length > 0) {
      await this.scores.finishUngradable(resultId, attemptId, {
        class: 'system',
        reason: `đường chấm điều tra chưa cấu hình ${missing.join(' và ')} — chấm lại khi cấu hình xong`,
      });
      return;
    }

    const built = await this.contexts.build(resultId);
    if (built.kind === 'ungradable') {
      await this.scores.finishUngradable(resultId, attemptId, { class: built.class, reason: built.reason });
      return;
    }

    const result = await investigate(built.ctx, { models: this.deps.models, sandbox: this.deps.sandbox! });
    const challengeResult = await this.runChallenge(result, built.ctx);
    const stored: StoredInvestigation = {
      version: 1,
      result,
      // Chưa có phép truy hồi §2.1: model được xem đủ bảng.
      rulesSeen: built.ruleTable,
      ruleTable: built.ruleTable,
      modelCeiling: Math.min(1, ...result.investigation.modelsUsed.map((m) => this.deps.ceilingOf(m))),
      challenge: challengeResult,
    };
    const out = await this.scores.finishAttempt(resultId, attemptId, stored, {
      modelUsed: result.investigation.modelsUsed.join('+').slice(0, 200) || null,
      tokensIn: result.usage.inputTokens,
      tokensOut: result.usage.outputTokens,
      sandboxHost: hostOf(result),
    });
    if (out.kind === 'ungradable') this.logger.warn(`kết quả ${resultId}: không chấm được (${out.class}) — ${out.reason}`);
  }

  /**
   * Lượt chấm của lần chạy này. Bài đã rời `ai_grading` → null (job cũ, thoát). Lượt hiện hành chưa
   * có kết cục → job trước chết giữa chừng, nối vào nó (§2.3 luật 2: một lượt một dòng). Không thì
   * mở lượt mới. Khoá giảng viên TRƯỚC khoá hàng — thứ tự khoá của 3c.
   */
  private async startAttempt(resultId: string): Promise<string | null> {
    return this.ds.transaction(async (m) => {
      await lockTeacherScoring(m, await teacherOfResult(m, resultId));
      const [row] = await m.query(
        `SELECT g.status, g.current_attempt_id, g.grading_triggered_by, a.outcome AS current_outcome
           FROM examcollect.grading_result g
           LEFT JOIN examcollect.grading_attempt a ON a.id = g.current_attempt_id
          WHERE g.id = $1
          FOR UPDATE OF g`,
        [resultId],
      );
      if (!row || row.status !== 'ai_grading') return null;
      if (row.current_attempt_id && row.current_outcome === null) return row.current_attempt_id as string;
      const [a] = await m.query(
        `INSERT INTO examcollect.grading_attempt (grading_result_id, attempt_no, triggered_by, started_at)
         SELECT $1, COALESCE(MAX(attempt_no), 0) + 1, $2, clock_timestamp()
           FROM examcollect.grading_attempt WHERE grading_result_id = $1
         RETURNING id`,
        [resultId, row.grading_triggered_by],
      );
      await m.query(`UPDATE examcollect.grading_result SET current_attempt_id = $2 WHERE id = $1`, [resultId, a.id]);
      return a.id as string;
    });
  }

  /**
   * Bốn lăng kính (§6) — chạy SONG SONG, một lăng kính hỏng không được làm hỏng cả lượt chấm
   * (cùng triết lý Advocate cũ: "không có ý kiến nào tốt hơn một ý kiến bịa ra"). `challenge()`
   * đã tự bọc lỗi của TỪNG Challenger thành `unverified`; `runCaseLens()` tự bọc thành
   * `suspected:false` — nên `Promise.all` ở đây không cần try/catch riêng cho từng lăng kính.
   *
   * Lỗi luật MÁY QUYẾT (`checkedBy: 'machine'`) không được gửi cho Challenger — sửa sau review
   * cuối (finding C2, §4.1: "Code đánh giá predicate. Model không tham gia"). Một lỗi máy quyết
   * là SỰ THẬT đo được từ kết quả chạy thật, không phải một ý kiến để lăng kính LLM tranh luận;
   * gửi nó đi vẫn có thể làm mất một mức trừ có bằng chứng máy đo, chỉ vì một lăng kính LLM nói
   * "refuted" mà không hề hiểu nó đang bác cái gì. CaseLens (Bỏ sót, Gian lận) không đổi điểm nên
   * vẫn nhận verdict ĐẦY ĐỦ, không lọc — chúng cần thấy MỌI lỗi đã tìm để đánh giá cả bài.
   */
  private async runChallenge(result: InvestigationResult, ctx: InvestigationContext): Promise<StoredChallenge | null> {
    if (!result.verdict || this.deps.challengers.length === 0) return null;
    const verdict = result.verdict;
    const toolCalls = result.investigation.toolCalls;
    const machineRuleKeys = new Set(ctx.rules.filter((r) => r.checkedBy === 'machine').map((r) => r.ruleKey));
    const challengeableVerdict: Verdict = { ...verdict, errors: verdict.errors.filter((e) => !machineRuleKeys.has(e.ruleKey)) };
    const [perError, caseNotes] = await Promise.all([
      Promise.all(this.deps.challengers.map((c) => challenge(challengeableVerdict, ctx, toolCalls, c))),
      Promise.all(this.deps.caseLenses.map((l) => runCaseLens(ctx, verdict, toolCalls, l))),
    ]);
    return { perError, caseNotes };
  }
}

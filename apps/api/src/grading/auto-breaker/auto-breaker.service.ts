import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import type { AuditReveal } from '../audit/audit-review.service';
import { latestComputationRow } from '../scoring/score-inputs';
import { ScoreService } from '../scoring/score.service';
import {
  countNoErrorLabelsSinceReset,
  countRuleLabelsSinceReset,
  isNoErrorBreakerOpen,
  isRuleBreakerOpen,
} from './breaker-queries';
import { BREAKER_ALPHA, BREAKER_P0, breakerVerdict, type BreakerVerdict } from './breaker-verdict';

export const AUTO_BREAKER_MESSAGES = {
  notFound: 'Không tìm thấy cầu dao tự chốt.',
  alreadyReset: 'Cầu dao này đã được bật lại.',
} as const;

/** Một cầu dao đang mở, như `GET auto-breakers` trả. `n`, `disagreements` là bằng chứng LÚC TẮT. */
export interface OpenAutoBreaker {
  id: string;
  scope: 'rule' | 'no_error';
  ruleId: string | null;
  ruleKey: string | null;
  trippedAt: Date;
  n: number;
  disagreements: number;
}

/**
 * Cầu dao tự chốt (spec duyệt nhanh 2026-10-21 §5.3): nhãn kiểm mẫu mù theo luật và theo lớp bài không lỗi, quy tắc
 * tắt (`breakerVerdict`, Task 5), hạ bậc khi tắt, và bật lại bởi người. Cầu dao là CHỐT: tắt rồi chỉ người bật lại.
 */
@Injectable()
export class AutoBreakerService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly scores: ScoreService,
  ) {}

  /**
   * Gọi từ `AuditReviewService.record`, trong CÙNG giao dịch `m` (đã giữ `lockTeacherScoring`), sau khi bài sang
   * `teacher_reviewed` và đã có bản tiết lộ. Lỗi ở bất kỳ bước nào lùi cả nhận xét kiểm mẫu lẫn nhãn và cầu dao.
   *
   * Thứ tự: ghi MỌI nhãn trước, rồi mới xét từng phạm vi. Mỗi phạm vi tắt thì chèn dòng cầu dao TRƯỚC khi tính lại,
   * để `compute()` (đọc bằng cùng `m`) thấy phạm vi đã bị chặn và hạ bài `auto_approved` về duyệt. Bài vừa được kiểm
   * mẫu được trừ ra khỏi lượt tính lại (`exceptResultId`). Trả id các dòng cầu dao vừa tắt.
   */
  async recordLabelsAndEvaluate(
    m: EntityManager,
    teacherId: string,
    resultId: string,
    reveal: AuditReveal,
  ): Promise<{ tripped: string[] }> {
    // Lớp bài không lỗi = lượt tính mới nhất có `breakdown.errors` rỗng (§5.3) — cùng lớp mà cổng
    // `no_error_auto_disabled` của `decide()` và phạm vi `noErrors` chặn. KHÔNG dùng `reveal.systemErrors`: nó bỏ lỗi
    // bị bác/bị loại, nên bài chỉ có lỗi bị bác sẽ lọt vào lớp mà cầu dao của lớp đó không chặn.
    const latest = await latestComputationRow(m, resultId);
    const noErrorClass = latest !== null && latest.breakdown.errors.length === 0;

    if (reveal.perRule.length > 0) {
      await m.query(
        `INSERT INTO examcollect.audit_rule_label (grading_result_id, rule_id, verdict)
         SELECT $1, t.rule_id, t.verdict FROM unnest($2::uuid[], $3::text[]) AS t(rule_id, verdict)`,
        [resultId, reveal.perRule.map((r) => r.ruleId), reveal.perRule.map((r) => r.verdict)],
      );
    }
    if (noErrorClass) {
      // Bài không lỗi: `agreement === 'full'` ⇔ giảng viên không chọn luật nào và không ghi lỗi khác (§5.3).
      await m.query(`INSERT INTO examcollect.audit_no_error_label (grading_result_id, teacher_id, agree) VALUES ($1, $2, $3)`, [
        resultId,
        teacherId,
        reveal.summary.agreement === 'full',
      ]);
    }

    const tripped: string[] = [];
    for (const { ruleId } of reveal.perRule) {
      if (await isRuleBreakerOpen(m, teacherId, ruleId)) continue;
      const counts = await countRuleLabelsSinceReset(m, ruleId);
      const verdict = breakerVerdict(counts);
      if (!verdict.trip) continue;
      tripped.push(await this.trip(m, teacherId, 'rule', ruleId, counts, verdict));
      await this.scores.recomputeForTeacher(m, teacherId, 'auto_rule_tripped', null, { ruleId, exceptResultId: resultId });
    }
    if (noErrorClass && !(await isNoErrorBreakerOpen(m, teacherId))) {
      const counts = await countNoErrorLabelsSinceReset(m, teacherId);
      const verdict = breakerVerdict(counts);
      if (verdict.trip) {
        tripped.push(await this.trip(m, teacherId, 'no_error', null, counts, verdict));
        await this.scores.recomputeForTeacher(m, teacherId, 'auto_rule_tripped', null, { noErrors: true, exceptResultId: resultId });
      }
    }
    return { tripped };
  }

  /** Cầu dao đang mở của giảng viên (phạm vi, luật, n, d, lúc tắt). */
  async listOpen(teacherId: string): Promise<OpenAutoBreaker[]> {
    const rows: {
      id: string;
      scope: 'rule' | 'no_error';
      rule_id: string | null;
      rule_key: string | null;
      tripped_at: Date;
      evidence: { n: number; disagreements: number };
    }[] = await this.ds.query(
      `SELECT b.id, b.scope, b.rule_id, r.rule_key, b.tripped_at, b.evidence
         FROM examcollect.auto_rule_breaker b
         LEFT JOIN examcollect.error_rule r ON r.id = b.rule_id
        WHERE b.teacher_id = $1 AND b.reset_at IS NULL
        ORDER BY b.tripped_at, b.id`,
      [teacherId],
    );
    return rows.map((r) => ({
      id: r.id,
      scope: r.scope,
      ruleId: r.rule_id,
      ruleKey: r.rule_key,
      trippedAt: r.tripped_at,
      n: Number(r.evidence.n),
      disagreements: Number(r.evidence.disagreements),
    }));
  }

  /**
   * Bật lại: chỉ giảng viên của dòng cầu dao (không phải chủ → 404, như mọi tài nguyên của người khác). Không tính
   * lại bài — bài đã về duyệt giữ nguyên tới khi được tính lại hay được duyệt. Nhãn trước lần bật lại không còn đếm.
   *
   * MỘT câu lệnh tự commit, không bọc giao dịch: `now()` là lúc chính câu lệnh bắt đầu, nên muộn hơn `tripped_at` của
   * mọi dòng nó thấy được — `ck_auto_rule_breaker_reset_after_trip` không bao giờ từ chối một lần bật lại hợp lệ. Đồng
   * hồ của DB, không phải của app.
   */
  async reset(teacherId: string, breakerId: string, actorId: string): Promise<void> {
    const res = await this.ds.query(
      `UPDATE examcollect.auto_rule_breaker SET reset_at = now(), reset_by = $3
        WHERE id = $1 AND teacher_id = $2 AND reset_at IS NULL
        RETURNING id`,
      [breakerId, teacherId, actorId],
    );
    // Driver Postgres của TypeORM trả `[rows, rowCount]` cho UPDATE … RETURNING.
    const updated: unknown[] = Array.isArray(res[0]) ? res[0] : res;
    if (updated.length > 0) return;
    const [row] = await this.ds.query(`SELECT 1 FROM examcollect.auto_rule_breaker WHERE id = $1 AND teacher_id = $2`, [
      breakerId,
      teacherId,
    ]);
    if (!row) throw new NotFoundException(AUTO_BREAKER_MESSAGES.notFound);
    throw new ConflictException(AUTO_BREAKER_MESSAGES.alreadyReset);
  }

  private async trip(
    m: EntityManager,
    teacherId: string,
    scope: 'rule' | 'no_error',
    ruleId: string | null,
    counts: { n: number; disagreements: number },
    verdict: BreakerVerdict,
  ): Promise<string> {
    const [row] = await m.query(
      `INSERT INTO examcollect.auto_rule_breaker (teacher_id, scope, rule_id, evidence) VALUES ($1, $2, $3, $4) RETURNING id`,
      [
        teacherId,
        scope,
        ruleId,
        JSON.stringify({ n: counts.n, disagreements: counts.disagreements, pValue: verdict.pValue, p0: BREAKER_P0, alpha: BREAKER_ALPHA }),
      ],
    );
    return row.id as string;
  }
}

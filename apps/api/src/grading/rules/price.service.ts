import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { parseHundredths } from '../scoring/hundredths';
import { RecomputeSummary, ScoreService } from '../scoring/score.service';
import { ErrorRuleService } from './error-rule.service';

/** Khối *"Lưu thì điều gì xảy ra"* của spec UI 3.1. */
export interface PricePreview {
  openSessions: { sessionId: string; name: string; affected: number; autoAfter: number; blockedByOtherUnpriced: number }[];
  /** Phiên đã chốt KHÔNG đổi theo (bảng giá ghim lúc chốt, §2.2) — chỉ "áp giá mới cho phiên đã chốt" mới đổi. */
  finalizedSessions: { sessionId: string; name: string; affected: number }[];
}

@Injectable()
export class PriceService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly rules: ErrorRuleService,
    private readonly scores: ScoreService,
  ) {}

  /**
   * Một phiên bản bảng giá MỚI, chép cả bảng + giá đổi (§2.2) — không sửa giá tại chỗ. Tính lại
   * mọi bài chưa chốt dính luật đó trong CÙNG transaction: giá lưu mà bài chưa tính lại là một
   * trạng thái không màn nào tả được.
   */
  async setPrice(
    teacherId: string,
    ruleId: string,
    deduction: string | null,
    actorId: string,
  ): Promise<{ versionId: string; recompute: RecomputeSummary }> {
    return this.ds.transaction(async (m) => {
      await this.rules.owned(m, teacherId, ruleId);
      const [{ next }] = await m.query(
        `SELECT COALESCE(MAX(version), 0) + 1 AS next FROM examcollect.price_table_version WHERE teacher_id = $1`,
        [teacherId],
      );
      const [v] = await m.query(
        `INSERT INTO examcollect.price_table_version (teacher_id, version, created_by) VALUES ($1, $2, $3) RETURNING id`,
        [teacherId, next, actorId],
      );
      await m.query(
        `INSERT INTO examcollect.rule_price (price_table_version_id, error_rule_id, teacher_id, deduction)
         SELECT $1, p.error_rule_id, p.teacher_id, p.deduction
           FROM examcollect.rule_price p
           JOIN examcollect.price_table_version pv ON pv.id = p.price_table_version_id
          WHERE pv.teacher_id = $2 AND pv.version = $3 AND p.error_rule_id <> $4`,
        [v.id, teacherId, next - 1, ruleId],
      );
      await m.query(
        `INSERT INTO examcollect.rule_price (price_table_version_id, error_rule_id, teacher_id, deduction) VALUES ($1, $2, $3, $4)`,
        [v.id, ruleId, teacherId, deduction],
      );
      const recompute = await this.scores.recomputeForTeacher(m, teacherId, 'price_change', actorId, { ruleId });
      return { versionId: v.id as string, recompute };
    });
  }

  /** Xem trước một giá — KHÔNG ghi gì (T-POL-5). Bài chấm tay không tính: điểm của nó không đổi nữa. */
  async preview(teacherId: string, ruleId: string, deduction: string | null): Promise<PricePreview> {
    await this.rules.owned(this.ds.manager, teacherId, ruleId);
    const hundredths = deduction === null ? null : parseHundredths(deduction);
    const rows: { result_id: string; session_id: string; name: string; status: string }[] = await this.ds.query(
      `SELECT g.id AS result_id, es.id AS session_id, es.name, g.status
         FROM examcollect.grading_result g
         JOIN examcollect.submission s ON s.id = g.submission_id
         JOIN examcollect.exam_session es ON es.id = s.exam_session_id
        WHERE es.teacher_id = $1 AND g.pipeline = 'investigator'
          AND NOT EXISTS (SELECT 1 FROM examcollect.teacher_review t
                           WHERE t.grading_result_id = g.id AND t.kind = 'manual_score')
          AND EXISTS (SELECT 1 FROM (SELECT c.breakdown FROM examcollect.score_computation c
                                      WHERE c.grading_result_id = g.id ORDER BY c.created_at DESC LIMIT 1) last
                       WHERE last.breakdown -> 'errors' @> jsonb_build_array(jsonb_build_object('ruleId', $2::text)))
        ORDER BY es.name, g.id`,
      [teacherId, ruleId],
    );
    const open = new Map<string, PricePreview['openSessions'][number]>();
    const closed = new Map<string, PricePreview['finalizedSessions'][number]>();
    for (const r of rows) {
      if (r.status === 'finalized' || r.status === 'exported') {
        const s = closed.get(r.session_id) ?? { sessionId: r.session_id, name: r.name, affected: 0 };
        s.affected++;
        closed.set(r.session_id, s);
        continue;
      }
      const s = open.get(r.session_id) ?? {
        sessionId: r.session_id,
        name: r.name,
        affected: 0,
        autoAfter: 0,
        blockedByOtherUnpriced: 0,
      };
      s.affected++;
      const out = await this.scores.preview(r.result_id, (rules) =>
        rules.map((x) => (x.ruleId === ruleId ? { ...x, deductionHundredths: hundredths } : x)),
      );
      if (out.outcome === 'auto') s.autoAfter++;
      else if (out.breakdown.errorFlags.some((f) => f.code === 'unpriced')) s.blockedByOtherUnpriced++;
      open.set(r.session_id, s);
    }
    return { openSessions: [...open.values()], finalizedSessions: [...closed.values()] };
  }
}

import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { parseHundredths } from '../scoring/hundredths';
import { lockTeacherScoring } from '../scoring/score-inputs';
import { RecomputeSummary, ScoreService } from '../scoring/score.service';
import { writeNextPriceVersion } from './price-version';
import { RubricErrorService } from './rubric-error.service';

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
    private readonly assignments: RubricErrorService,
    private readonly scores: ScoreService,
  ) {}

  /**
   * Điểm trừ của MỘT dòng áp dụng (lỗi trong một rubric). Một phiên bản bảng giá MỚI, chép cả bảng (§2.2)
   * — dòng của rubric khác đi nguyên theo. Tính lại các bài chưa chốt của ĐÚNG rubric đó, cùng transaction.
   */
  async setPrice(
    teacherId: string,
    rubricErrorId: string,
    deduction: string | null,
    actorId: string,
  ): Promise<{ versionId: string; recompute: RecomputeSummary }> {
    return this.ds.transaction(async (m) => {
      await lockTeacherScoring(m, teacherId);
      const assignment = await this.assignments.owned(m, teacherId, rubricErrorId);
      const versionId = await writeNextPriceVersion(m, teacherId, actorId, [{ rubricErrorId, deduction }]);
      const recompute = await this.scores.recomputeForTeacher(m, teacherId, 'price_change', actorId, {
        rubricName: assignment.rubricName,
        ruleId: assignment.errorRuleId,
      });
      return { versionId, recompute };
    });
  }

  /** Xem trước một giá — KHÔNG ghi gì (T-POL-5). Chỉ bài của rubric đó; bài chấm tay không tính. */
  async preview(teacherId: string, rubricErrorId: string, deduction: string | null): Promise<PricePreview> {
    const assignment = await this.assignments.owned(this.ds.manager, teacherId, rubricErrorId);
    const hundredths = deduction === null ? null : parseHundredths(deduction);
    const rows: { result_id: string; session_id: string; name: string; status: string }[] = await this.ds.query(
      `SELECT g.id AS result_id, es.id AS session_id, es.name, g.status
         FROM examcollect.grading_result g
         JOIN examcollect.submission s ON s.id = g.submission_id
         JOIN examcollect.exam_session es ON es.id = s.exam_session_id
        WHERE es.teacher_id = $1 AND g.pipeline = 'investigator'
          AND g.rubric_id_version IN (SELECT id FROM examcollect.rubric WHERE teacher_id = $1 AND name = $3)
          AND NOT EXISTS (SELECT 1 FROM examcollect.teacher_review t
                           WHERE t.grading_result_id = g.id AND t.kind = 'manual_score')
          AND EXISTS (SELECT 1 FROM (SELECT c.breakdown FROM examcollect.score_computation c
                                      WHERE c.grading_result_id = g.id ORDER BY c.created_at DESC, c.id DESC LIMIT 1) last
                       WHERE last.breakdown -> 'errors' @> jsonb_build_array(jsonb_build_object('ruleId', $2::text)))
        ORDER BY es.name, g.id`,
      [teacherId, assignment.errorRuleId, assignment.rubricName],
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
      const s = open.get(r.session_id) ?? { sessionId: r.session_id, name: r.name, affected: 0, autoAfter: 0, blockedByOtherUnpriced: 0 };
      s.affected++;
      const out = await this.scores.preview(r.result_id, (rules) =>
        rules.map((x) => (x.ruleId === assignment.errorRuleId ? { ...x, deductionHundredths: hundredths } : x)),
      );
      if (out.outcome === 'auto') s.autoAfter++;
      else if (out.breakdown.errorFlags.some((f) => f.code === 'unpriced')) s.blockedByOtherUnpriced++;
      open.set(r.session_id, s);
    }
    return { openSessions: [...open.values()], finalizedSessions: [...closed.values()] };
  }
}

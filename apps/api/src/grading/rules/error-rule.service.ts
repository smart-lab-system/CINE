import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { evaluatePredicate, isMachineChecked } from '../decision/predicates';
import type { RulePredicate } from '../decision/types';
import { ErrorRuleEntity } from '../entities/error-rule.entity';
import { ErrorRuleRevisionEntity } from '../entities/error-rule-revision.entity';
import { formatHundredths, parseHundredths } from '../scoring/hundredths';
import type { RuleSnapshot } from '../scoring/score-core';
import { lockTeacherScoring } from '../scoring/score-inputs';
import { RecomputeSummary, ScoreService } from '../scoring/score.service';
import { RuleChanges, RuleInput } from './rule-input';

export interface RuleListItem {
  id: string;
  ruleKey: string;
  state: string;
  origin: string;
  revision: {
    id: string;
    revision: number;
    name: string;
    description: string;
    criterionKey: string;
    predicate: RulePredicate | null;
  };
  checkedBy: 'machine' | 'model';
  deduction: string | null;
  /** Bài mà lượt tính MỚI NHẤT có lỗi của luật này (không tính lỗi đã bỏ cho riêng bài). */
  appliedTo: { results: number; sessions: number };
  /** Bài mà lượt tính mới nhất nêu luật này là lệch tiêu chí (§14.1). */
  mismatchedIn: number;
}

/** Khối *"Lưu thì áp vào đâu"* của spec UI 3.2 — theo bậc của §2.2. */
export type RulePreview =
  | {
      tier: 2;
      results: { resultId: string; sessionId: string; before: string | null; after: number | null; capped: boolean }[];
    }
  | { tier: 3; reason: string }
  | { tier: 4; sessions: { sessionId: string; name: string; graded: boolean }[] };

/** Bảng lỗi của MỘT giảng viên (§2.1). Không xoá dòng nào; sửa là bản sửa mới (§14.1). */
@Injectable()
export class ErrorRuleService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly scores: ScoreService,
  ) {}

  async create(
    teacherId: string,
    input: RuleInput,
  ): Promise<{ ruleId: string; revisionId: string; recompute: RecomputeSummary | null }> {
    return this.ds.transaction(async (m) => {
      // Khoá TRƯỚC mọi thứ khác: số phiên bản giá, bản sửa luật và mọi lượt tính lại xếp hàng theo giảng viên.
      await lockTeacherScoring(m, teacherId);
      const repo = m.getRepository(ErrorRuleEntity);
      if (await repo.findOne({ where: { teacherId, ruleKey: input.ruleKey } })) {
        throw new ConflictException(`Luật "${input.ruleKey}" đã có trong bảng lỗi của bạn`);
      }
      const rule = await repo.save(
        repo.create({ teacherId, ruleKey: input.ruleKey, state: 'active', origin: 'teacher', currentRevisionId: null }),
      );
      const rev = await this.insertRevision(m, rule.id, 1, input, teacherId);
      await m.update(ErrorRuleEntity, rule.id, { currentRevisionId: rev.id });
      // Luật máy kiểm mới đo được trên kết quả đã lưu (bậc 2). Luật lời thì không áp cho phiên đã
      // chấm (T-FAIR-1) — không tính lại gì.
      const recompute = isMachineChecked(input.predicate)
        ? await this.scores.recomputeForTeacher(m, teacherId, 'tier2_rule', teacherId)
        : null;
      return { ruleId: rule.id, revisionId: rev.id, recompute };
    });
  }

  async revise(
    teacherId: string,
    ruleId: string,
    changes: RuleChanges,
  ): Promise<{ revisionId: string; recompute: RecomputeSummary | null }> {
    return this.ds.transaction(async (m) => {
      // Khoá TRƯỚC mọi thứ khác: số phiên bản giá, bản sửa luật và mọi lượt tính lại xếp hàng theo giảng viên.
      await lockTeacherScoring(m, teacherId);
      const rule = await this.owned(m, teacherId, ruleId);
      const current = await m.getRepository(ErrorRuleRevisionEntity).findOneByOrFail({ id: rule.currentRevisionId! });
      const next = {
        name: changes.name ?? current.name,
        description: changes.description ?? current.description,
        criterionKey: changes.criterionKey ?? current.criterionKey,
        predicate: changes.predicate !== undefined ? changes.predicate : current.predicate,
      };
      const rev = await this.insertRevision(m, rule.id, current.revision + 1, next, teacherId);
      await m.update(ErrorRuleEntity, rule.id, { currentRevisionId: rev.id });
      // Chỉ tiêu chí và điều kiện đổi được điểm; tên, mô tả thì không.
      const scoring =
        next.criterionKey !== current.criterionKey || JSON.stringify(next.predicate) !== JSON.stringify(current.predicate);
      const recompute = scoring ? await this.scores.recomputeForTeacher(m, teacherId, 'rule_revision', teacherId) : null;
      return { revisionId: rev.id, recompute };
    });
  }

  /**
   * *Tạo luật từ đây* của một luật `proposed` = `revise` rồi `active`; *Không phải lỗi* =
   * `dismissed` (spec UI 3.1). Tập luật đổi → tính lại tầng luật.
   */
  async setState(
    teacherId: string,
    ruleId: string,
    state: 'active' | 'dismissed' | 'retired',
  ): Promise<{ recompute: RecomputeSummary }> {
    return this.ds.transaction(async (m) => {
      // Khoá TRƯỚC mọi thứ khác: số phiên bản giá, bản sửa luật và mọi lượt tính lại xếp hàng theo giảng viên.
      await lockTeacherScoring(m, teacherId);
      await this.owned(m, teacherId, ruleId);
      await m.update(ErrorRuleEntity, ruleId, { state });
      return { recompute: await this.scores.recomputeForTeacher(m, teacherId, 'rule_revision', teacherId) };
    });
  }

  list(teacherId: string): Promise<RuleListItem[]> {
    return this.listByState(teacherId, 'active');
  }

  /** *Luật còn thiếu* agent báo (3d sinh dòng `proposed`) — trang kiến thức đọc ở đây. */
  missing(teacherId: string): Promise<RuleListItem[]> {
    return this.listByState(teacherId, 'proposed');
  }

  /** Xem trước một luật đang soạn — KHÔNG ghi gì. */
  async preview(
    teacherId: string,
    input: RuleInput & { ruleId?: string; deduction?: string | null },
  ): Promise<RulePreview> {
    if (input.ruleId) await this.owned(this.ds.manager, teacherId, input.ruleId);
    if (input.predicate && !isMachineChecked(input.predicate)) {
      const reason = evaluatePredicate(input.predicate, { cases: [] }, [], {}).reason;
      return { tier: 3, reason: reason ?? 'máy chưa đo được mẫu này' };
    }
    if (!input.predicate) {
      const sessions: { id: string; name: string; graded: boolean }[] = await this.ds.query(
        `SELECT es.id, es.name, EXISTS (
                  SELECT 1 FROM examcollect.grading_result g
                    JOIN examcollect.submission s ON s.id = g.submission_id
                    JOIN examcollect.grading_attempt a ON a.id = g.current_attempt_id AND a.outcome = 'graded'
                   WHERE s.exam_session_id = es.id) AS graded
           FROM examcollect.exam_session es WHERE es.teacher_id = $1 ORDER BY es.start_time DESC`,
        [teacherId],
      );
      return { tier: 4, sessions: sessions.map((s) => ({ sessionId: s.id, name: s.name, graded: s.graded })) };
    }
    const draft: RuleSnapshot = {
      ruleId: input.ruleId ?? 'draft',
      revisionId: 'draft',
      ruleKey: input.ruleKey,
      criterionKey: input.criterionKey,
      predicate: input.predicate,
      deductionHundredths: input.deduction == null ? null : parseHundredths(input.deduction),
    };
    const rows: { result_id: string; session_id: string }[] = await this.ds.query(
      `SELECT g.id AS result_id, es.id AS session_id
         FROM examcollect.grading_result g
         JOIN examcollect.submission s ON s.id = g.submission_id
         JOIN examcollect.exam_session es ON es.id = s.exam_session_id
         JOIN examcollect.grading_attempt a ON a.id = g.current_attempt_id AND a.outcome = 'graded'
        WHERE es.teacher_id = $1 AND g.pipeline = 'investigator'
          AND g.status IN ('auto_approved', 'audit_pending', 'flagged_for_review', 'teacher_reviewed')
          AND NOT EXISTS (SELECT 1 FROM examcollect.teacher_review t
                           WHERE t.grading_result_id = g.id AND t.kind = 'manual_score')
        ORDER BY g.id`,
      [teacherId],
    );
    const results: Extract<RulePreview, { tier: 2 }>['results'] = [];
    for (const r of rows) {
      const after = await this.scores.preview(r.result_id, (current) => [
        ...current.filter((x) => x.ruleId !== draft.ruleId && x.ruleKey !== draft.ruleKey),
        draft,
      ]);
      if (!after.breakdown.errors.some((e) => e.ruleKey === draft.ruleKey)) continue;
      const last = await this.scores.latestComputation(this.ds.manager, r.result_id);
      const crit = after.breakdown.perCriterion.find((c) => c.key === draft.criterionKey);
      results.push({
        resultId: r.result_id,
        sessionId: r.session_id,
        before: last?.score ?? null,
        after: after.scoreHundredths,
        capped: crit?.capped ?? false,
      });
    }
    return { tier: 2, results };
  }

  /** Luật của ĐÚNG giảng viên này; không thì 404 — không lộ luật của người khác (T-POL-8). */
  async owned(m: EntityManager, teacherId: string, ruleId: string): Promise<ErrorRuleEntity> {
    const rule = await m.getRepository(ErrorRuleEntity).findOne({ where: { id: ruleId, teacherId } });
    if (!rule) throw new NotFoundException('Không tìm thấy luật');
    return rule;
  }

  private async listByState(teacherId: string, state: 'active' | 'proposed'): Promise<RuleListItem[]> {
    const rows: Record<string, unknown>[] = await this.ds.query(
      `WITH price AS (
         SELECT p.error_rule_id, p.deduction FROM examcollect.rule_price p
          WHERE p.price_table_version_id = (
            SELECT id FROM examcollect.price_table_version WHERE teacher_id = $1 ORDER BY version DESC LIMIT 1)),
       latest AS (
         SELECT DISTINCT ON (c.grading_result_id) c.grading_result_id, c.breakdown, s.exam_session_id
           FROM examcollect.score_computation c
           JOIN examcollect.grading_result g ON g.id = c.grading_result_id
           JOIN examcollect.submission s ON s.id = g.submission_id
           JOIN examcollect.exam_session es ON es.id = s.exam_session_id
          WHERE es.teacher_id = $1
          ORDER BY c.grading_result_id, c.created_at DESC, c.id DESC),
       applied AS (
         SELECT e ->> 'ruleId' AS rule_id, l.grading_result_id, l.exam_session_id
           FROM latest l CROSS JOIN LATERAL jsonb_array_elements(l.breakdown -> 'errors') e
          WHERE e ->> 'counted' <> 'excluded'),
       mismatched AS (
         SELECT e ->> 'ruleId' AS rule_id, count(*)::int AS n
           FROM latest l CROSS JOIN LATERAL jsonb_array_elements(l.breakdown -> 'mismatchedRules') e
          GROUP BY 1)
       SELECT r.id, r.rule_key, r.state, r.origin,
              v.id AS revision_id, v.revision, v.name, v.description, v.criterion_key, v.predicate,
              price.deduction,
              (SELECT count(DISTINCT a.grading_result_id)::int FROM applied a WHERE a.rule_id = r.id::text) AS results,
              (SELECT count(DISTINCT a.exam_session_id)::int FROM applied a WHERE a.rule_id = r.id::text) AS sessions,
              COALESCE((SELECT mm.n FROM mismatched mm WHERE mm.rule_id = r.id::text), 0) AS mismatched_in
         FROM examcollect.error_rule r
         JOIN examcollect.error_rule_revision v ON v.id = r.current_revision_id
         LEFT JOIN price ON price.error_rule_id = r.id
        WHERE r.teacher_id = $1 AND r.state = $2
        ORDER BY r.rule_key`,
      [teacherId, state],
    );
    return rows.map((r) => ({
      id: r.id as string,
      ruleKey: r.rule_key as string,
      state: r.state as string,
      origin: r.origin as string,
      revision: {
        id: r.revision_id as string,
        revision: r.revision as number,
        name: r.name as string,
        description: r.description as string,
        criterionKey: r.criterion_key as string,
        predicate: r.predicate as RulePredicate | null,
      },
      checkedBy: isMachineChecked(r.predicate as RulePredicate | null) ? 'machine' : 'model',
      deduction: r.deduction === null ? null : formatHundredths(parseHundredths(r.deduction as string)),
      appliedTo: { results: r.results as number, sessions: r.sessions as number },
      mismatchedIn: r.mismatched_in as number,
    }));
  }

  private insertRevision(
    m: EntityManager,
    ruleId: string,
    revision: number,
    input: Omit<RuleInput, 'ruleKey'>,
    actorId: string,
  ): Promise<ErrorRuleRevisionEntity> {
    const repo = m.getRepository(ErrorRuleRevisionEntity);
    return repo.save(
      repo.create({
        errorRuleId: ruleId,
        revision,
        name: input.name,
        description: input.description,
        criterionKey: input.criterionKey,
        predicate: input.predicate,
        createdBy: actorId,
      }),
    );
  }
}

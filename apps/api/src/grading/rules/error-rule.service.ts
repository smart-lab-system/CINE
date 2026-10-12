import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { isMachineChecked } from '../decision/predicates';
import type { RulePredicate } from '../decision/types';
import { ErrorRuleEntity } from '../entities/error-rule.entity';
import { ErrorRuleRevisionEntity } from '../entities/error-rule-revision.entity';
import { formatHundredths, parseHundredths } from '../scoring/hundredths';
import { lockTeacherScoring } from '../scoring/score-inputs';
import { RecomputeSummary, ScoreService } from '../scoring/score.service';
import { RuleChanges } from './rule-input';
import { slugifyRuleKey, uniqueRuleKey } from './rule-key';

export interface RuleUse {
  rubricName: string;
  criterionKey: string;
  deduction: string | null;
}

/** Một lỗi trong THƯ VIỆN: danh tính + cách phát hiện, kèm nơi nó đang dùng (spec §4.3). */
export interface LibraryRule {
  id: string;
  ruleKey: string;
  origin: string;
  revision: { id: string; revision: number; name: string; description: string; predicate: RulePredicate | null };
  checkedBy: 'machine' | 'model';
  uses: RuleUse[];
}

/**
 * Lỗi của MỘT giảng viên (§2.1): thư viện, sửa danh tính (cả N rubric), tách bản riêng, bỏ. Tiêu chí và điểm
 * trừ KHÔNG ở đây — chúng thuộc dòng áp dụng (`RubricErrorService`, `PriceService`). Không xoá dòng nào; sửa là
 * bản sửa mới (§14.1).
 */
@Injectable()
export class ErrorRuleService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly scores: ScoreService,
  ) {}

  async owned(m: EntityManager, teacherId: string, ruleId: string): Promise<ErrorRuleEntity> {
    const rule = await m.getRepository(ErrorRuleEntity).findOne({ where: { id: ruleId, teacherId } });
    if (!rule) throw new NotFoundException('Không tìm thấy luật');
    return rule;
  }

  async library(teacherId: string): Promise<LibraryRule[]> {
    const rules: Record<string, unknown>[] = await this.ds.query(
      `SELECT r.id, r.rule_key, r.origin, v.id AS revision_id, v.revision, v.name, v.description, v.predicate
         FROM examcollect.error_rule r
         JOIN examcollect.error_rule_revision v ON v.id = r.current_revision_id
        WHERE r.teacher_id = $1 AND r.state = 'active'
        ORDER BY r.rule_key`,
      [teacherId],
    );
    const uses: { error_rule_id: string; rubric_name: string; criterion_key: string; deduction: string | null }[] =
      await this.ds.query(
        `SELECT re.error_rule_id, re.rubric_name, re.criterion_key, p.deduction
           FROM examcollect.rubric_error re
           LEFT JOIN examcollect.rubric_error_price p ON p.rubric_error_id = re.id
            AND p.price_table_version_id = (SELECT id FROM examcollect.price_table_version WHERE teacher_id = $1 ORDER BY version DESC LIMIT 1)
          WHERE re.teacher_id = $1 AND re.removed_at IS NULL
          ORDER BY re.rubric_name`,
        [teacherId],
      );
    const fmt = (d: string | null) => (d === null ? null : formatHundredths(parseHundredths(d)));
    return rules.map((r) => ({
      id: r.id as string,
      ruleKey: r.rule_key as string,
      origin: r.origin as string,
      revision: {
        id: r.revision_id as string,
        revision: r.revision as number,
        name: r.name as string,
        description: r.description as string,
        predicate: r.predicate as RulePredicate | null,
      },
      checkedBy: isMachineChecked(r.predicate as RulePredicate | null) ? 'machine' : 'model',
      uses: uses
        .filter((u) => u.error_rule_id === r.id)
        .map((u) => ({ rubricName: u.rubric_name, criterionKey: u.criterion_key, deduction: fmt(u.deduction) })),
    }));
  }

  /** Sửa tên / mô tả / điều kiện cho CẢ rubric đang dùng lỗi này. Chỉ `predicate` đổi mới đổi điểm (§3.3). */
  async revise(
    teacherId: string,
    ruleId: string,
    changes: RuleChanges,
  ): Promise<{ revisionId: string; recompute: RecomputeSummary | null }> {
    return this.ds.transaction(async (m) => {
      await lockTeacherScoring(m, teacherId);
      const rule = await this.owned(m, teacherId, ruleId);
      const current = await m.getRepository(ErrorRuleRevisionEntity).findOneByOrFail({ id: rule.currentRevisionId! });
      const next = {
        name: changes.name ?? current.name,
        description: changes.description ?? current.description,
        predicate: changes.predicate !== undefined ? changes.predicate : current.predicate,
      };
      const rev = await this.insertRevision(m, rule.id, current.revision + 1, next, teacherId);
      await m.update(ErrorRuleEntity, rule.id, { currentRevisionId: rev.id });
      const scoring = JSON.stringify(next.predicate) !== JSON.stringify(current.predicate);
      const recompute = scoring ? await this.scores.recomputeForTeacher(m, teacherId, 'rule_revision', teacherId) : null;
      return { revisionId: rev.id, recompute };
    });
  }

  /** *Không phải lỗi* (`dismissed`) hay gỡ hẳn (`retired`). Tập luật đổi → tính lại cả giảng viên (như hôm nay). */
  async setState(teacherId: string, ruleId: string, state: 'dismissed' | 'retired'): Promise<{ recompute: RecomputeSummary }> {
    return this.ds.transaction(async (m) => {
      await lockTeacherScoring(m, teacherId);
      await this.owned(m, teacherId, ruleId);
      await m.update(ErrorRuleEntity, ruleId, { state });
      return { recompute: await this.scores.recomputeForTeacher(m, teacherId, 'rule_revision', teacherId) };
    });
  }

  /**
   * *Chỉ rubric đang mở* (spec D4): tạo luật MỚI từ luật này kèm `changes`, chuyển dòng áp dụng của rubric đó
   * sang luật mới (dòng giá khoá theo dòng áp dụng nên đi theo), chép ngoại lệ cấp lỗi của bài thuộc rubric đó
   * (§3.6), rồi tính lại rubric đó. Luật cũ và dòng áp dụng ở rubric khác không đổi.
   */
  async split(
    teacherId: string,
    ruleId: string,
    input: { rubricName: string; changes: RuleChanges },
  ): Promise<{ ruleId: string; rubricErrorId: string; recompute: RecomputeSummary }> {
    return this.ds.transaction(async (m) => {
      await lockTeacherScoring(m, teacherId);
      const rule = await this.owned(m, teacherId, ruleId);
      const [assignment] = await m.query(
        `SELECT id FROM examcollect.rubric_error WHERE teacher_id = $1 AND rubric_name = $2 AND error_rule_id = $3 AND removed_at IS NULL`,
        [teacherId, input.rubricName, ruleId],
      );
      if (!assignment) throw new NotFoundException('Không tìm thấy lỗi trong rubric');
      const [{ n }] = await m.query(
        `SELECT count(DISTINCT rubric_name)::int AS n FROM examcollect.rubric_error WHERE teacher_id = $1 AND error_rule_id = $2 AND removed_at IS NULL`,
        [teacherId, ruleId],
      );
      if (n < 2) throw new ConflictException('Lỗi này chỉ dùng ở một rubric — sửa trực tiếp, không cần tách bản riêng');
      const current = await m.getRepository(ErrorRuleRevisionEntity).findOneByOrFail({ id: rule.currentRevisionId! });
      const merged = {
        name: input.changes.name ?? current.name,
        description: input.changes.description ?? current.description,
        predicate: input.changes.predicate !== undefined ? input.changes.predicate : current.predicate,
      };
      const ruleKey = await uniqueRuleKey(m, teacherId, slugifyRuleKey(merged.name));
      const rules = m.getRepository(ErrorRuleEntity);
      const created = await rules.save(
        rules.create({ teacherId, ruleKey, state: 'active', origin: 'teacher', currentRevisionId: null }),
      );
      const rev = await this.insertRevision(m, created.id, 1, merged, teacherId);
      await m.update(ErrorRuleEntity, created.id, { currentRevisionId: rev.id });
      await m.query(`UPDATE examcollect.rubric_error SET error_rule_id = $2 WHERE id = $1`, [assignment.id, created.id]);
      // Ngoại lệ hiện hành của bài thuộc rubric đó theo sang luật mới (đường ghi của ErrorExceptionService.writeReview).
      await m.query(
        `INSERT INTO examcollect.teacher_review (grading_result_id, teacher_id, final_score, kind, error_rule_id, direction, edited_criteria, reviewed_at)
         SELECT x.grading_result_id, $1, NULL, 'error_exception', $3, x.direction, '[]'::jsonb, clock_timestamp()
           FROM (SELECT DISTINCT ON (t.grading_result_id) t.grading_result_id, t.direction
                   FROM examcollect.teacher_review t
                   JOIN examcollect.grading_result g ON g.id = t.grading_result_id
                  WHERE t.kind = 'error_exception' AND t.error_rule_id = $2
                    AND g.rubric_id_version IN (SELECT id FROM examcollect.rubric WHERE teacher_id = $1 AND name = $4)
                  ORDER BY t.grading_result_id, t.reviewed_at DESC, t.created_at DESC, t.id DESC) x`,
        [teacherId, ruleId, created.id, input.rubricName],
      );
      const recompute = await this.scores.recomputeForTeacher(m, teacherId, 'rule_revision', teacherId, {
        rubricName: input.rubricName,
      });
      return { ruleId: created.id, rubricErrorId: assignment.id as string, recompute };
    });
  }

  private insertRevision(
    m: EntityManager,
    ruleId: string,
    revision: number,
    input: { name: string; description: string; predicate: RulePredicate | null },
    actorId: string,
  ): Promise<ErrorRuleRevisionEntity> {
    const repo = m.getRepository(ErrorRuleRevisionEntity);
    return repo.save(
      repo.create({
        errorRuleId: ruleId,
        revision,
        name: input.name,
        description: input.description,
        criterionKey: null,
        predicate: input.predicate,
        createdBy: actorId,
      }),
    );
  }
}

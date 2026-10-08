import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { isMachineChecked } from '../decision/predicates';
import type { RulePredicate } from '../decision/types';
import { ErrorRuleEntity } from '../entities/error-rule.entity';
import { ErrorRuleRevisionEntity } from '../entities/error-rule-revision.entity';
import { formatHundredths, parseHundredths } from '../scoring/hundredths';
import { lockTeacherScoring } from '../scoring/score-inputs';
import { RecomputeSummary, ScoreService } from '../scoring/score.service';
import { writeNextPriceVersion } from './price-version';
import { AssignInput, NewRuleInput, RuleChanges } from './rule-input';
import { slugifyRuleKey, uniqueRuleKey } from './rule-key';

export interface OwnedAssignment {
  id: string;
  teacherId: string;
  rubricName: string;
  errorRuleId: string;
  criterionKey: string;
}

export interface RubricErrorItem {
  id: string;
  ruleId: string;
  ruleKey: string;
  name: string;
  description: string;
  predicate: RulePredicate | null;
  checkedBy: 'machine' | 'model';
  origin: string;
  criterionKey: string;
  /** Tiêu chí không còn ở bản MỚI NHẤT của rubric (spec §2.3.4). */
  criterionDangling: boolean;
  deduction: string | null;
  /** Bài mà lượt tính mới nhất (của rubric NÀY) có lỗi này; không tính lỗi đã bỏ cho riêng bài. */
  appliedTo: { results: number; sessions: number };
  alsoIn: { rubricName: string; criterionKey: string; deduction: string | null }[];
}

export interface AssignResult {
  rubricErrorId: string;
  ruleId: string;
  recompute: RecomputeSummary | null;
}

/** Dòng áp dụng của một lỗi trong một rubric (spec §2): thêm, chuyển tiêu chí, gỡ, liệt kê. */
@Injectable()
export class RubricErrorService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly scores: ScoreService,
  ) {}

  /** Dòng áp dụng CHƯA GỠ của đúng giảng viên này; không thì 404 — không lộ dòng của người khác (T-POL-8). */
  async owned(m: EntityManager, teacherId: string, rubricErrorId: string): Promise<OwnedAssignment> {
    const [row] = await m.query(
      `SELECT id, teacher_id, rubric_name, error_rule_id, criterion_key
         FROM examcollect.rubric_error WHERE id = $1 AND teacher_id = $2 AND removed_at IS NULL`,
      [rubricErrorId, teacherId],
    );
    if (!row) throw new NotFoundException('Không tìm thấy lỗi trong rubric');
    return {
      id: row.id,
      teacherId: row.teacher_id,
      rubricName: row.rubric_name,
      errorRuleId: row.error_rule_id,
      criterionKey: row.criterion_key,
    };
  }

  /**
   * Rubric `(teacher, name)` phải có (404 — không lộ rubric của người khác) và tiêu chí phải có ở BẢN MỚI NHẤT
   * (400): không có khoá ngoại nên đây là chỗ DUY NHẤT giữ toàn vẹn (spec §2.3.3, T-RBE-DATA-3).
   */
  async assertRubricCriterion(m: EntityManager, teacherId: string, rubricName: string, criterionKey: string): Promise<void> {
    const [latest] = await m.query(
      `SELECT id FROM examcollect.rubric WHERE teacher_id = $1 AND name = $2 ORDER BY version DESC LIMIT 1`,
      [teacherId, rubricName],
    );
    if (!latest) throw new NotFoundException('Không tìm thấy rubric');
    const [crit] = await m.query(`SELECT 1 FROM examcollect.rubric_criterion WHERE rubric_id = $1 AND key = $2`, [
      latest.id,
      criterionKey,
    ]);
    if (!crit) throw new BadRequestException(`Tiêu chí "${criterionKey}" không có trong rubric "${rubricName}"`);
  }

  async list(teacherId: string, rubricName: string): Promise<RubricErrorItem[]> {
    await this.assertRubricExists(this.ds.manager, teacherId, rubricName);
    const rows: Record<string, unknown>[] = await this.ds.query(
      `WITH price AS (
         SELECT p.rubric_error_id, p.deduction FROM examcollect.rubric_error_price p
          WHERE p.price_table_version_id = (SELECT id FROM examcollect.price_table_version WHERE teacher_id = $1 ORDER BY version DESC LIMIT 1)),
       latest_rubric AS (SELECT id FROM examcollect.rubric WHERE teacher_id = $1 AND name = $2 ORDER BY version DESC LIMIT 1),
       latest AS (
         SELECT DISTINCT ON (c.grading_result_id) c.grading_result_id, c.breakdown, s.exam_session_id
           FROM examcollect.score_computation c
           JOIN examcollect.grading_result g ON g.id = c.grading_result_id
           JOIN examcollect.submission s ON s.id = g.submission_id
          WHERE g.rubric_id_version IN (SELECT id FROM examcollect.rubric WHERE teacher_id = $1 AND name = $2)
          ORDER BY c.grading_result_id, c.created_at DESC, c.id DESC),
       applied AS (
         SELECT e ->> 'ruleId' AS rule_id, l.grading_result_id, l.exam_session_id
           FROM latest l CROSS JOIN LATERAL jsonb_array_elements(l.breakdown -> 'errors') e
          WHERE e ->> 'counted' <> 'excluded')
       SELECT re.id, r.id AS rule_id, r.rule_key, r.origin, v.name, v.description, v.predicate, re.criterion_key, price.deduction,
              (SELECT count(DISTINCT a.grading_result_id)::int FROM applied a WHERE a.rule_id = r.id::text) AS results,
              (SELECT count(DISTINCT a.exam_session_id)::int FROM applied a WHERE a.rule_id = r.id::text) AS sessions,
              NOT EXISTS (SELECT 1 FROM examcollect.rubric_criterion rc
                           WHERE rc.rubric_id = (SELECT id FROM latest_rubric) AND rc.key = re.criterion_key) AS dangling
         FROM examcollect.rubric_error re
         JOIN examcollect.error_rule r ON r.id = re.error_rule_id
         JOIN examcollect.error_rule_revision v ON v.id = r.current_revision_id
         LEFT JOIN price ON price.rubric_error_id = re.id
        WHERE re.teacher_id = $1 AND re.rubric_name = $2 AND re.removed_at IS NULL AND r.state = 'active'
        ORDER BY re.criterion_key, r.rule_key`,
      [teacherId, rubricName],
    );
    const ruleIds = rows.map((r) => r.rule_id as string);
    const others: { error_rule_id: string; rubric_name: string; criterion_key: string; deduction: string | null }[] =
      ruleIds.length
        ? await this.ds.query(
            `SELECT re.error_rule_id, re.rubric_name, re.criterion_key, p.deduction
               FROM examcollect.rubric_error re
               LEFT JOIN examcollect.rubric_error_price p ON p.rubric_error_id = re.id
                AND p.price_table_version_id = (SELECT id FROM examcollect.price_table_version WHERE teacher_id = $1 ORDER BY version DESC LIMIT 1)
              WHERE re.teacher_id = $1 AND re.rubric_name <> $2 AND re.removed_at IS NULL AND re.error_rule_id = ANY($3::uuid[])
              ORDER BY re.rubric_name`,
            [teacherId, rubricName, ruleIds],
          )
        : [];
    const fmt = (d: unknown) => (d === null || d === undefined ? null : formatHundredths(parseHundredths(d as string)));
    return rows.map((r) => ({
      id: r.id as string,
      ruleId: r.rule_id as string,
      ruleKey: r.rule_key as string,
      name: r.name as string,
      description: r.description as string,
      predicate: r.predicate as RulePredicate | null,
      checkedBy: isMachineChecked(r.predicate as RulePredicate | null) ? 'machine' : 'model',
      origin: r.origin as string,
      criterionKey: r.criterion_key as string,
      criterionDangling: r.dangling as boolean,
      deduction: fmt(r.deduction),
      appliedTo: { results: r.results as number, sessions: r.sessions as number },
      alsoIn: others
        .filter((o) => o.error_rule_id === r.rule_id)
        .map((o) => ({ rubricName: o.rubric_name, criterionKey: o.criterion_key, deduction: fmt(o.deduction) })),
    }));
  }

  /**
   * Thêm một lỗi vào rubric — ba đường: lỗi có sẵn (`ruleId`), lỗi `proposed` được duyệt (`ruleId` + `changes`),
   * lỗi mới (`newRule`). Giá (nếu có) ghi MỘT phiên bản giá mới. Dòng đã gỡ thì BẬT LẠI cùng id.
   */
  async assign(teacherId: string, input: AssignInput, actorId: string = teacherId): Promise<AssignResult> {
    return this.ds.transaction(async (m) => {
      await lockTeacherScoring(m, teacherId);
      await this.assertRubricCriterion(m, teacherId, input.rubricName, input.criterionKey);
      const { ruleId, predicate } = input.newRule
        ? await this.createRule(m, teacherId, input.newRule, actorId)
        : await this.adoptRule(m, teacherId, input.ruleId!, input.changes, actorId);
      const [existing] = await m.query(
        `SELECT id, removed_at FROM examcollect.rubric_error WHERE teacher_id = $1 AND rubric_name = $2 AND error_rule_id = $3`,
        [teacherId, input.rubricName, ruleId],
      );
      if (existing && existing.removed_at === null) throw new ConflictException('Lỗi này đã có trong rubric');
      let rubricErrorId: string;
      if (existing) {
        await m.query(`UPDATE examcollect.rubric_error SET removed_at = NULL, criterion_key = $2 WHERE id = $1`, [
          existing.id,
          input.criterionKey,
        ]);
        rubricErrorId = existing.id;
      } else {
        const [row] = await m.query(
          `INSERT INTO examcollect.rubric_error (teacher_id, rubric_name, error_rule_id, criterion_key) VALUES ($1, $2, $3, $4) RETURNING id`,
          [teacherId, input.rubricName, ruleId, input.criterionKey],
        );
        rubricErrorId = row.id;
      }
      if (input.deduction !== undefined) await writeNextPriceVersion(m, teacherId, actorId, [{ rubricErrorId, deduction: input.deduction }]);
      // Luật máy kiểm được đo ngay trên kết quả đã lưu (bậc 2); luật lời không áp cho bài đã chấm (T-FAIR-1).
      const recompute = isMachineChecked(predicate)
        ? await this.scores.recomputeForTeacher(m, teacherId, 'rule_revision', actorId, { rubricName: input.rubricName })
        : null;
      return { rubricErrorId, ruleId, recompute };
    });
  }

  async move(teacherId: string, rubricErrorId: string, criterionKey: string): Promise<{ recompute: RecomputeSummary }> {
    return this.ds.transaction(async (m) => {
      await lockTeacherScoring(m, teacherId);
      const row = await this.owned(m, teacherId, rubricErrorId);
      await this.assertRubricCriterion(m, teacherId, row.rubricName, criterionKey);
      await m.query(`UPDATE examcollect.rubric_error SET criterion_key = $2 WHERE id = $1`, [rubricErrorId, criterionKey]);
      return {
        recompute: await this.scores.recomputeForTeacher(m, teacherId, 'rule_revision', teacherId, {
          rubricName: row.rubricName,
        }),
      };
    });
  }

  /** "Gỡ khỏi rubric này": đặt `removed_at`, không xoá dòng; lỗi vẫn ở thư viện, rubric khác không đổi. */
  async remove(teacherId: string, rubricErrorId: string): Promise<{ recompute: RecomputeSummary }> {
    return this.ds.transaction(async (m) => {
      await lockTeacherScoring(m, teacherId);
      const row = await this.owned(m, teacherId, rubricErrorId);
      await m.query(`UPDATE examcollect.rubric_error SET removed_at = now() WHERE id = $1`, [rubricErrorId]);
      return {
        recompute: await this.scores.recomputeForTeacher(m, teacherId, 'rule_revision', teacherId, {
          rubricName: row.rubricName,
        }),
      };
    });
  }

  /**
   * Sao chép các dòng áp dụng CHƯA GỠ của rubric nguồn sang rubric đích, ghép theo `criterion_key` (spec D3):
   * đích đã có lỗi đó thì bỏ qua; tiêu chí không có ở BẢN MỚI NHẤT của đích thì bỏ qua và đếm. Điểm trừ lấy từ
   * phiên bản giá hiện hành của nguồn, ghi MỘT phiên bản mới. Sau đó hai rubric độc lập.
   */
  async copy(
    teacherId: string,
    fromRubricName: string,
    toRubricName: string,
    actorId: string = teacherId,
  ): Promise<{ copied: number; skippedNoCriterion: number; skippedExisting: number; recompute: RecomputeSummary | null }> {
    if (fromRubricName === toRubricName) throw new BadRequestException('Rubric nguồn và rubric đích phải khác nhau');
    return this.ds.transaction(async (m) => {
      await lockTeacherScoring(m, teacherId);
      await this.assertRubricExists(m, teacherId, fromRubricName);
      await this.assertRubricExists(m, teacherId, toRubricName);
      const targetKeys = new Set<string>(
        (
          await m.query(
            `SELECT key FROM examcollect.rubric_criterion
              WHERE rubric_id = (SELECT id FROM examcollect.rubric WHERE teacher_id = $1 AND name = $2 ORDER BY version DESC LIMIT 1)`,
            [teacherId, toRubricName],
          )
        ).map((r: { key: string }) => r.key),
      );
      const sources: { error_rule_id: string; criterion_key: string; deduction: string | null }[] = await m.query(
        `SELECT re.error_rule_id, re.criterion_key, p.deduction
           FROM examcollect.rubric_error re
           JOIN examcollect.error_rule r ON r.id = re.error_rule_id AND r.state = 'active'
           LEFT JOIN examcollect.rubric_error_price p ON p.rubric_error_id = re.id
            AND p.price_table_version_id = (SELECT id FROM examcollect.price_table_version WHERE teacher_id = $1 ORDER BY version DESC LIMIT 1)
          WHERE re.teacher_id = $1 AND re.rubric_name = $2 AND re.removed_at IS NULL
          ORDER BY re.criterion_key, r.rule_key`,
        [teacherId, fromRubricName],
      );
      let skippedNoCriterion = 0;
      let skippedExisting = 0;
      const changes: { rubricErrorId: string; deduction: string | null }[] = [];
      for (const src of sources) {
        if (!targetKeys.has(src.criterion_key)) {
          skippedNoCriterion++;
          continue;
        }
        const [existing] = await m.query(
          `SELECT id, removed_at FROM examcollect.rubric_error WHERE teacher_id = $1 AND rubric_name = $2 AND error_rule_id = $3`,
          [teacherId, toRubricName, src.error_rule_id],
        );
        if (existing && existing.removed_at === null) {
          skippedExisting++;
          continue;
        }
        let id: string;
        if (existing) {
          await m.query(`UPDATE examcollect.rubric_error SET removed_at = NULL, criterion_key = $2 WHERE id = $1`, [
            existing.id,
            src.criterion_key,
          ]);
          id = existing.id;
        } else {
          const [row] = await m.query(
            `INSERT INTO examcollect.rubric_error (teacher_id, rubric_name, error_rule_id, criterion_key) VALUES ($1, $2, $3, $4) RETURNING id`,
            [teacherId, toRubricName, src.error_rule_id, src.criterion_key],
          );
          id = row.id;
        }
        changes.push({ rubricErrorId: id, deduction: src.deduction });
      }
      if (changes.length > 0) await writeNextPriceVersion(m, teacherId, actorId, changes);
      const recompute =
        changes.length > 0
          ? await this.scores.recomputeForTeacher(m, teacherId, 'rule_revision', actorId, { rubricName: toRubricName })
          : null;
      return { copied: changes.length, skippedNoCriterion, skippedExisting, recompute };
    });
  }

  private async assertRubricExists(m: EntityManager, teacherId: string, rubricName: string): Promise<void> {
    const [row] = await m.query(`SELECT 1 FROM examcollect.rubric WHERE teacher_id = $1 AND name = $2 LIMIT 1`, [
      teacherId,
      rubricName,
    ]);
    if (!row) throw new NotFoundException('Không tìm thấy rubric');
  }

  private async createRule(
    m: EntityManager,
    teacherId: string,
    input: NewRuleInput,
    actorId: string,
  ): Promise<{ ruleId: string; predicate: RulePredicate | null }> {
    let ruleKey = input.ruleKey;
    if (ruleKey) {
      const [dup] = await m.query(`SELECT 1 FROM examcollect.error_rule WHERE teacher_id = $1 AND rule_key = $2`, [
        teacherId,
        ruleKey,
      ]);
      if (dup) throw new ConflictException(`Luật "${ruleKey}" đã có trong bảng lỗi của bạn`);
    } else {
      ruleKey = await uniqueRuleKey(m, teacherId, slugifyRuleKey(input.name));
    }
    const rules = m.getRepository(ErrorRuleEntity);
    const rule = await rules.save(
      rules.create({ teacherId, ruleKey, state: 'active', origin: 'teacher', currentRevisionId: null }),
    );
    const revs = m.getRepository(ErrorRuleRevisionEntity);
    const rev = await revs.save(
      revs.create({
        errorRuleId: rule.id,
        revision: 1,
        name: input.name,
        description: input.description,
        criterionKey: null,
        predicate: input.predicate,
        createdBy: actorId,
      }),
    );
    await m.update(ErrorRuleEntity, rule.id, { currentRevisionId: rev.id });
    return { ruleId: rule.id, predicate: input.predicate };
  }

  private async adoptRule(
    m: EntityManager,
    teacherId: string,
    ruleId: string,
    changes: RuleChanges | undefined,
    actorId: string,
  ): Promise<{ ruleId: string; predicate: RulePredicate | null }> {
    const rule = await m.getRepository(ErrorRuleEntity).findOne({ where: { id: ruleId, teacherId } });
    if (!rule) throw new NotFoundException('Không tìm thấy luật');
    if (rule.state !== 'active' && rule.state !== 'proposed') {
      throw new ConflictException('Lỗi này đã bị bỏ hoặc gỡ — không thêm vào rubric được');
    }
    const current = await m.getRepository(ErrorRuleRevisionEntity).findOneByOrFail({ id: rule.currentRevisionId! });
    const hasChanges = changes !== undefined && Object.keys(changes).length > 0;
    if (hasChanges && rule.state !== 'proposed') throw new BadRequestException('changes chỉ dùng cho lỗi AI đề xuất');
    let predicate = current.predicate;
    let currentRevisionId = rule.currentRevisionId;
    if (hasChanges) {
      const revs = m.getRepository(ErrorRuleRevisionEntity);
      const merged = {
        name: changes!.name ?? current.name,
        description: changes!.description ?? current.description,
        predicate: changes!.predicate !== undefined ? changes!.predicate : current.predicate,
      };
      const rev = await revs.save(
        revs.create({
          errorRuleId: rule.id,
          revision: current.revision + 1,
          criterionKey: null,
          createdBy: actorId,
          ...merged,
        }),
      );
      predicate = merged.predicate;
      currentRevisionId = rev.id;
    }
    if (rule.state === 'proposed') await m.update(ErrorRuleEntity, rule.id, { state: 'active', currentRevisionId });
    return { ruleId: rule.id, predicate };
  }
}

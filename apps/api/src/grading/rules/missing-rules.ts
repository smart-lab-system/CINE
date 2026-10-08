import { createHash } from 'node:crypto';
import { EntityManager } from 'typeorm';

export interface MissingContext {
  resultId: string;
  sessionId: string;
  rubricName: string;
}

function normalise(description: string): string {
  return description.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Khoá ổn định theo NỘI DUNG: nhiều bài báo cùng một lỗi thì ra cùng một khoá — một dòng. */
export function missingRuleKey(description: string): string {
  return `de_xuat_${createHash('sha256').update(normalise(description)).digest('hex').slice(0, 16)}`;
}

/**
 * *Luật còn thiếu* (§2.1): lỗi agent gặp mà không luật nào khớp → một dòng `error_rule`
 * `proposed` / `agent_reported`, kèm `error_rule_sighting` (rubric, phiên, bài). Lỗi đó KHÔNG vào điểm.
 * Tiêu chí thuộc dòng áp dụng do giảng viên chọn khi duyệt — không ghi `criterion_key` lúc đề xuất.
 * Chạy trong transaction của người gọi; trùng khoá thì bỏ qua, không nổ. Trả số dòng luật mới.
 */
export async function recordMissingRules(
  m: EntityManager,
  teacherId: string,
  missing: readonly { description: string }[],
  ctx: MissingContext,
): Promise<number> {
  let created = 0;
  const seen = new Set<string>();
  for (const { description } of missing) {
    const text = description.trim();
    if (!text) continue;
    const ruleKey = missingRuleKey(text);
    if (seen.has(ruleKey)) continue;
    seen.add(ruleKey);
    const [rule] = await m.query(
      `INSERT INTO examcollect.error_rule (teacher_id, rule_key, origin, state)
       VALUES ($1, $2, 'agent_reported', 'proposed')
       ON CONFLICT (teacher_id, rule_key) DO NOTHING
       RETURNING id`,
      [teacherId, ruleKey],
    );
    if (rule) {
      // Tiêu chí KHÔNG còn là việc của agent: nó thuộc dòng áp dụng, do giảng viên chọn khi duyệt (spec D5).
      const [revision] = await m.query(
        `INSERT INTO examcollect.error_rule_revision (error_rule_id, revision, name, description, predicate, created_by)
         VALUES ($1, 1, $2, $3, NULL, $4) RETURNING id`,
        [rule.id, text.slice(0, 200), text, teacherId],
      );
      await m.query(`UPDATE examcollect.error_rule SET current_revision_id = $2 WHERE id = $1`, [rule.id, revision.id]);
      created++;
    }
    // Ghi nơi thấy — chỉ khi lỗi còn là đề xuất: lỗi đã duyệt hay đã bỏ thì không còn "thiếu".
    await m.query(
      `INSERT INTO examcollect.error_rule_sighting (teacher_id, error_rule_id, grading_result_id, exam_session_id, rubric_name)
       SELECT r.teacher_id, r.id, $3, $4, $5 FROM examcollect.error_rule r
        WHERE r.teacher_id = $1 AND r.rule_key = $2 AND r.state = 'proposed'
       ON CONFLICT (error_rule_id, grading_result_id) DO NOTHING`,
      [teacherId, ruleKey, ctx.resultId, ctx.sessionId, ctx.rubricName],
    );
  }
  return created;
}

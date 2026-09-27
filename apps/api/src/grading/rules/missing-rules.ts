import { createHash } from 'node:crypto';
import { EntityManager } from 'typeorm';

/**
 * Tiêu chí giữ chỗ của luật còn thiếu: agent không biết lỗi đó thuộc tiêu chí nào của rubric. Luật
 * `proposed` không áp vào điểm (chỉ luật `active` mới được đọc); giảng viên gán tiêu chí thật khi
 * *"Tạo luật từ đây"* (spec UI 3.1) bằng một bản sửa mới rồi mới kích hoạt.
 */
export const UNASSIGNED_CRITERION = 'chua_gan';

function normalise(description: string): string {
  return description.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Khoá ổn định theo NỘI DUNG: nhiều bài báo cùng một lỗi thì ra cùng một khoá — một dòng. */
export function missingRuleKey(description: string): string {
  return `de_xuat_${createHash('sha256').update(normalise(description)).digest('hex').slice(0, 16)}`;
}

/**
 * *Luật còn thiếu* (§2.1): lỗi agent gặp mà không luật nào khớp → một dòng `error_rule`
 * `proposed` / `agent_reported` trên trang kiến thức. Lỗi đó KHÔNG vào điểm — không có luật thì
 * không có giá. Chạy trong transaction của người gọi; trùng khoá thì bỏ qua, không nổ. Trả số dòng mới.
 */
export async function recordMissingRules(
  m: EntityManager,
  teacherId: string,
  missing: readonly { description: string }[],
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
    if (!rule) continue;
    const [revision] = await m.query(
      `INSERT INTO examcollect.error_rule_revision (error_rule_id, revision, name, description, criterion_key, predicate, created_by)
       VALUES ($1, 1, $2, $3, $4, NULL, $5) RETURNING id`,
      [rule.id, text.slice(0, 200), text, UNASSIGNED_CRITERION, teacherId],
    );
    await m.query(`UPDATE examcollect.error_rule SET current_revision_id = $2 WHERE id = $1`, [rule.id, revision.id]);
    created++;
  }
  return created;
}

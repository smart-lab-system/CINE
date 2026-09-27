import { EntityManager } from 'typeorm';
import { isMachineChecked } from '../decision/predicates';
import type { RulePredicate } from '../decision/types';
import { machineNoteOf } from '../investigator/rule-note';
import type { RuleEntry } from '../investigator/types';
import type { StoredInvestigation } from '../scoring/stored-investigation';

/**
 * Bảng lỗi ĐANG DÙNG của giảng viên, đúng hình dạng `bang-loi.md` của cuộc điều tra cần (§2.1:
 * bảng lỗi ghi thành file trong workspace). `ruleTable` là cùng bảng đó, chép vào hồ sơ lượt chấm
 * để công bằng trong phiên đọc lại được về sau (3c, review I1). Chưa có phép truy hồi §2.1, nên
 * model được xem đủ bảng: `rulesSeen = ruleTable`.
 */
export async function loadRuleEntries(
  m: EntityManager,
  teacherId: string,
): Promise<{ entries: RuleEntry[]; ruleTable: StoredInvestigation['ruleTable'] }> {
  const rows: { rule_key: string; name: string; criterion_key: string; predicate: RulePredicate | null; priced: boolean }[] =
    await m.query(
      `SELECT r.rule_key, v.name, v.criterion_key, v.predicate,
              (p.deduction IS NOT NULL) AS priced
         FROM examcollect.error_rule r
         JOIN examcollect.error_rule_revision v ON v.id = r.current_revision_id
         LEFT JOIN examcollect.rule_price p
                ON p.error_rule_id = r.id
               AND p.price_table_version_id = (
                     SELECT id FROM examcollect.price_table_version
                      WHERE teacher_id = $1 ORDER BY version DESC LIMIT 1)
        WHERE r.teacher_id = $1 AND r.state = 'active'
        ORDER BY r.rule_key`,
      [teacherId],
    );
  const entries: RuleEntry[] = rows.map((r) => ({
    ruleKey: r.rule_key,
    title: r.name,
    criterionKey: r.criterion_key,
    priced: r.priced,
    checkedBy: isMachineChecked(r.predicate) ? 'machine' : 'model',
    machineNote: machineNoteOf(r.predicate),
  }));
  return { entries, ruleTable: entries.map((e) => ({ ruleKey: e.ruleKey, checkedBy: e.checkedBy })) };
}

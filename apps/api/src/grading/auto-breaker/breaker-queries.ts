import type { EntityManager } from 'typeorm';

/**
 * Câu đọc cầu dao tự chốt (spec duyệt nhanh 2026-10-21 §5.3). KHÔNG là provider: `ScoreService.compute()` gọi thẳng
 * các hàm này với `m` của lượt tính — để thấy dòng cầu dao vừa chèn trong CÙNG giao dịch ghi nhãn — và để
 * `ScoreService` không phụ thuộc `AutoBreakerService` (chiều ngược lại đã có: cầu dao tắt thì gọi tính lại).
 *
 * node-postgres trả `count(*)` (bigint) dưới dạng CHUỖI. Mọi số đếm đi qua `Number()` trước khi tới `breakerVerdict`,
 * vốn ném RangeError với giá trị không phải số nguyên.
 */

/** Mốc "lần bật lại gần nhất" khi chưa từng bật lại: mọi nhãn đều được đếm. */
const NEVER_RESET = `'-infinity'::timestamptz`;

/** Khoá luật của các cầu dao LUẬT đang mở của giảng viên — hợp vào tập chặn tự chốt. */
export async function loadOpenBreakerRuleKeys(m: EntityManager, teacherId: string): Promise<string[]> {
  const rows: { rule_key: string }[] = await m.query(
    `SELECT r.rule_key
       FROM examcollect.auto_rule_breaker b
       JOIN examcollect.error_rule r ON r.id = b.rule_id
      WHERE b.teacher_id = $1 AND b.scope = 'rule' AND b.reset_at IS NULL
      ORDER BY r.rule_key`,
    [teacherId],
  );
  return rows.map((r) => r.rule_key);
}

/** Cầu dao LỚP BÀI KHÔNG LỖI của giảng viên đang mở không. */
export async function isNoErrorBreakerOpen(m: EntityManager, teacherId: string): Promise<boolean> {
  const [row] = await m.query(
    `SELECT EXISTS (SELECT 1 FROM examcollect.auto_rule_breaker
                     WHERE teacher_id = $1 AND scope = 'no_error' AND reset_at IS NULL) AS open`,
    [teacherId],
  );
  return row?.open === true;
}

/** Cầu dao của MỘT luật (của giảng viên này) đang mở không — đang mở thì không đếm lại, không tắt lại. */
export async function isRuleBreakerOpen(m: EntityManager, teacherId: string, ruleId: string): Promise<boolean> {
  const [row] = await m.query(
    `SELECT EXISTS (SELECT 1 FROM examcollect.auto_rule_breaker
                     WHERE teacher_id = $1 AND scope = 'rule' AND rule_id = $2 AND reset_at IS NULL) AS open`,
    [teacherId, ruleId],
  );
  return row?.open === true;
}

/**
 * Nhãn theo luật ghi SAU lần bật lại gần nhất của cầu dao luật đó (toàn bộ nếu chưa từng bị tắt). Bất đồng =
 * `verdict <> 'both'`: `teacher_only` (hệ thống bỏ sót) cũng tính — thiên lệch có chủ đích về phía tắt sớm.
 * Luật thuộc đúng một giảng viên (`error_rule.teacher_id`), nên `ruleId` đủ để xác định phạm vi.
 */
export async function countRuleLabelsSinceReset(m: EntityManager, ruleId: string): Promise<{ n: number; disagreements: number }> {
  const [row] = await m.query(
    `SELECT count(*) AS n, count(*) FILTER (WHERE l.verdict <> 'both') AS disagreements
       FROM examcollect.audit_rule_label l
      WHERE l.rule_id = $1
        AND l.recorded_at > COALESCE(
              (SELECT max(b.reset_at) FROM examcollect.auto_rule_breaker b WHERE b.scope = 'rule' AND b.rule_id = $1),
              ${NEVER_RESET})`,
    [ruleId],
  );
  return { n: Number(row.n), disagreements: Number(row.disagreements) };
}

/** Nhãn lớp bài không lỗi của giảng viên ghi SAU lần bật lại gần nhất của cầu dao lớp. Bất đồng = `agree = false`. */
export async function countNoErrorLabelsSinceReset(
  m: EntityManager,
  teacherId: string,
): Promise<{ n: number; disagreements: number }> {
  const [row] = await m.query(
    `SELECT count(*) AS n, count(*) FILTER (WHERE NOT l.agree) AS disagreements
       FROM examcollect.audit_no_error_label l
      WHERE l.teacher_id = $1
        AND l.recorded_at > COALESCE(
              (SELECT max(b.reset_at) FROM examcollect.auto_rule_breaker b WHERE b.teacher_id = $1 AND b.scope = 'no_error'),
              ${NEVER_RESET})`,
    [teacherId],
  );
  return { n: Number(row.n), disagreements: Number(row.disagreements) };
}

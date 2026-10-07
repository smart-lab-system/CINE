export type AuditVerdict = 'both' | 'teacher_only' | 'system_only';

export interface AuditSummary {
  both: number;
  teacherOnly: number;
  systemOnly: number;
  /** Luật đang dùng mà cả hai đều không thấy. */
  neither: number;
  /** Lỗi giảng viên tự viết ngoài bảng lỗi. */
  extra: number;
  agreement: 'full' | 'partial' | 'none';
}

/**
 * So tập lỗi giảng viên chọn với tập lỗi hệ thống giữ (parent spec §8.1 luật 3) — theo TỪNG luật, để đọc ra
 * được hệ thống thừa ở đâu, thiếu ở đâu. HÀM THUẦN: nhãn được ghi dù sau đó bất đồng thế nào.
 *
 * Một lỗi "khác" (ngoài bảng lỗi của chính giảng viên) hệ thống không thể gọi tên được, nên luôn tính là bất đồng.
 */
export function compareAudit(input: {
  picked: string[];
  systemRuleIds: string[];
  extraCount: number;
  activeRuleCount: number;
}): { perRule: { ruleId: string; verdict: AuditVerdict }[]; summary: AuditSummary } {
  const picked = new Set(input.picked);
  const system = new Set(input.systemRuleIds);
  const perRule = [...new Set([...picked, ...system])].map((ruleId) => ({
    ruleId,
    verdict: (picked.has(ruleId) && system.has(ruleId)
      ? 'both'
      : picked.has(ruleId)
        ? 'teacher_only'
        : 'system_only') as AuditVerdict,
  }));
  const count = (verdict: AuditVerdict) => perRule.filter((r) => r.verdict === verdict).length;
  const both = count('both');
  const teacherOnly = count('teacher_only');
  const systemOnly = count('system_only');
  const disagreement = teacherOnly + systemOnly + input.extraCount;
  return {
    perRule,
    summary: {
      both,
      teacherOnly,
      systemOnly,
      neither: Math.max(0, input.activeRuleCount - perRule.length),
      extra: input.extraCount,
      agreement: disagreement === 0 ? 'full' : both === 0 ? 'none' : 'partial',
    },
  };
}

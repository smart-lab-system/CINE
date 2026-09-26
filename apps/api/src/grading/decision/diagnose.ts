import { InvestigationResult, ToolName } from '../investigator/types';
import { evaluatePredicate, isMachineChecked } from './predicates';
import { Diagnosis, DiagnosedError, ErrorRule, VerdictSource } from './types';

/** Công cụ mà kết quả của nó CHỐNG LƯNG một phán đoán — chạy thật, chạy lại được. */
const BACKING_TOOLS: ReadonlySet<ToolName> = new Set<ToolName>(['run', 'run_tests']);

/**
 * Lỗi mang nguồn gốc (§4.1). Luật máy kiểm được → code quyết từ kết quả đã lưu, model không
 * tham gia; đề xuất của model cho luật đó bị bỏ qua và ghi lại. Luật còn lại → đề xuất của model
 * (đã lọc T-AG-2 ở bước 2), nguồn gốc tụt theo bằng chứng. Thuần: chạy lại được trên hồ sơ đã
 * lưu với một bảng lỗi mới mà không gọi model hay sandbox (T-TIER-1/2).
 */
export function diagnose(input: {
  rules: ErrorRule[];
  bundle: { cases: { name: string; group: string }[] };
  result: InvestigationResult;
}): Diagnosis {
  const { rules, bundle, result } = input;
  const { toolCalls, structuredResults } = result.investigation;
  const errors: DiagnosedError[] = [];
  const ignored: Diagnosis['ignored'] = [];
  const measurements: Diagnosis['measurements'] = [];
  if (result.kind !== 'verdict') return { errors, ignored, measurements };

  for (const r of rules) {
    if (!r.predicate) continue;
    const outcome = evaluatePredicate(r.predicate, bundle, toolCalls, structuredResults);
    measurements.push({ ruleKey: r.ruleKey, criterionKey: r.criterionKey, outcome });
    if (isMachineChecked(r.predicate) && outcome.state === 'present') {
      errors.push({
        ruleKey: r.ruleKey, criterionKey: r.criterionKey, deductionHundredths: r.deductionHundredths,
        source: 'deterministic', toolCallIds: outcome.toolCallIds,
      });
    }
  }

  const byKey = new Map(rules.map((r) => [r.ruleKey, r]));
  const toolOf = new Map(toolCalls.map((t) => [t.id, t.tool]));
  const seen = new Set(errors.map((e) => e.ruleKey));
  for (const e of result.verdict?.errors ?? []) {
    const rule = byKey.get(e.ruleKey);
    if (!rule) continue; // T-AG-2 đã loại; phòng thủ
    if (isMachineChecked(rule.predicate)) {
      ignored.push({ ruleKey: e.ruleKey, reason: 'machine_checked_rule' });
      continue;
    }
    if (seen.has(e.ruleKey)) continue;
    seen.add(e.ruleKey);
    const backed = e.toolCallIds.some((id) => BACKING_TOOLS.has(toolOf.get(id) as ToolName));
    const source: VerdictSource = backed ? 'llm_with_tools' : 'llm_only';
    errors.push({ ruleKey: e.ruleKey, criterionKey: rule.criterionKey, deductionHundredths: rule.deductionHundredths, source, toolCallIds: e.toolCallIds });
  }
  return { errors, ignored, measurements };
}

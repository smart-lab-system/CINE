import { computeDeductionScore } from '../scoring/deduction-score';
import { uncoveredCases } from '../investigator/coverage';
import { StopReason } from '../investigator/types';
import { caseConfidence } from './confidence';
import { diagnose } from './diagnose';
import { CaseFlag, Decision, DecisionInput, ErrorFlag } from './types';

/** Lý do dừng là CẠN NGÂN SÁCH (§7) — nền của T-FLOOR-1. */
export const BUDGET_STOPS: ReadonlySet<StopReason> = new Set<StopReason>(['max_tool_calls', 'max_rounds', 'max_wall', 'max_tokens']);
const CONTRADICTION_CAP = 0.5;

/**
 * MỘT công thức tự quyết, ở MỘT hàm (§4.2):
 *
 *   tự quyết ⇔ bài code ∧ qua sàn §4.4 ∧ §4.3 không bắn ∧ mọi lỗi được tính đều có giá
 *            ∧ confidence ≥ θ
 *
 * Thứ tự là luật: sàn đứng TRƯỚC trần (§4.4) — dưới sàn thì không có con số nào để hạ
 * confidence. Thuần: không DB, không model, không sandbox — gọi lại được trên hồ sơ đã lưu khi
 * bảng lỗi đổi (T-TIER-1/2) — luật máy kiểm mới đo lại trên kết quả đã lưu; luật lời mới thì
 * tiêu chí của nó chưa chạm tới (`rulesSeen`, review I3). Điều kiện phản biện (§6.2) chưa có
 * hiệu lực tới bước 6.
 */
export function decide(input: DecisionInput): Decision {
  const { result, rubric, rules } = input;
  const maxHundredths = rubric.reduce((s, c) => s + c.maxHundredths, 0);
  const none = { scoreHundredths: null, maxHundredths, errors: [], confidence: null, caseFlags: [], errorFlags: [], diagnosis: null };

  // Sàn — phần của cuộc điều tra (bước 2): chưa bắt đầu, gói test chưa chạy đủ, bài rỗng, …
  if (result.kind === 'ungradable') {
    return { outcome: 'ungradable', ungradable: result.ungradable ?? { class: 'system', reason: 'không có kết luận' }, ...none };
  }

  // Review I2: sàn của gói test — tự kiểm, không dựa vào việc investigate() đã chặn. decide() được
  // gọi lại trên hồ sơ đã lưu (T-TIER-1/2) và từ pipeline thật (3d). Bài tự luận không có gói
  // test: nó luôn về giảng viên (`not_code_pipeline`), không rơi xuống sàn này.
  if (input.pipeline === 'investigator') {
    if (input.bundle.cases.length === 0) {
      return { outcome: 'ungradable', ungradable: { class: 'system', reason: 'gói test rỗng — không có thước nào để chạy (§4.4)' }, ...none };
    }
    const missing = uncoveredCases(input.bundle.cases, result.investigation.toolCalls, result.investigation.structuredResults);
    if (missing.length > 0) {
      const groups = [...new Set(missing.map((c) => c.group))].join(', ');
      return {
        outcome: 'ungradable',
        ungradable: {
          class: 'system',
          reason:
            `gói test chưa chạy đủ: ${missing.length}/${input.bundle.cases.length} ca chưa có kết quả (nhóm ${groups}) — ` +
            '"không có gì để trừ" không phải "không có gì sai" (§4.4)',
        },
        ...none,
      };
    }
  }

  const diagnosis = diagnose({ rules, bundle: input.bundle, result });
  const { errors } = diagnosis;

  // T-FLOOR-1 (Q4): cạn ngân sách mà không phát hiện gì — kể cả phát hiện do code — không phải bài sạch.
  if (BUDGET_STOPS.has(result.investigation.budget.stopReason) && errors.length === 0) {
    return {
      outcome: 'ungradable',
      ungradable: { class: 'system', reason: `cạn ngân sách (${result.investigation.budget.stopReason}) với 0 phát hiện — không phải bài sạch (T-FLOOR-1)` },
      ...none,
      diagnosis,
    };
  }

  const score = computeDeductionScore(
    rubric.map((c) => ({ key: c.key, maxHundredths: c.maxHundredths })),
    rules.map((r) => ({ ruleKey: r.ruleKey, criterionKey: r.criterionKey, deductionHundredths: r.deductionHundredths })),
    errors.map((e) => e.ruleKey),
  );

  const caseFlags: CaseFlag[] = [];
  const readSubmission = result.investigation.toolCalls.some(
    (t) => t.tool === 'read_file' && t.status === 'ok' && typeof t.args.path === 'string' && t.args.path.startsWith('bai-nop/'),
  );
  const waived = new Set(input.waivedCriteria);
  const seen = new Map(input.rulesSeen.map((r) => [r.ruleKey, r.checkedBy]));
  for (const c of rubric) {
    if (c.maxHundredths <= 0) continue; // Review Focus 4: tiêu chí trần 0 không có gì để trừ
    const own = rules.filter((r) => r.criterionKey === c.key);
    if (own.length === 0) {
      // T-FLOOR-6: chấm trừ mà không có luật thì tiêu chí luôn trọn điểm.
      if (!waived.has(c.key)) caseFlags.push({ code: 'criterion_without_rules', detail: `tiêu chí "${c.key}" không có luật nào trỏ vào` });
      continue;
    }
    // T-FLOOR-4 (Q2): mọi luật của tiêu chí phải đã được xét.
    const gaps: string[] = [];
    for (const r of own) {
      if (r.predicate) {
        const m = diagnosis.measurements.find((x) => x.ruleKey === r.ruleKey);
        if (!m || m.outcome.state === 'unmeasured') gaps.push(`${r.ruleKey}: ${m?.outcome.reason ?? 'chưa đo'}`);
      } else if (!seen.has(r.ruleKey)) {
        // Review I3: luật lời có sau cuộc điều tra — model chưa từng xét nó.
        gaps.push(`${r.ruleKey}: chưa xét — luật có sau cuộc điều tra`);
      } else if (seen.get(r.ruleKey) === 'machine') {
        gaps.push(`${r.ruleKey}: lúc điều tra model được dặn KHÔNG đề xuất luật này (máy kiểm)`);
      } else if (!readSubmission) {
        gaps.push(`${r.ruleKey}: agent chưa đọc file bài nộp nào`);
      }
    }
    if (gaps.length > 0) caseFlags.push({ code: 'criterion_untouched', detail: `tiêu chí "${c.key}" chưa chạm tới — ${gaps.join('; ')}` });
  }
  const coverageComplete = caseFlags.length === 0;

  // §4.3: mọi ca đều không đạt (kể cả không biên dịch — T-COMPILE-1). KHÔNG tự cho 0 điểm.
  const runs = result.investigation.toolCalls
    .filter((t) => t.tool === 'run_tests' && t.status === 'ok' && t.structuredRef)
    .map((t) => result.investigation.structuredResults[t.structuredRef!])
    .filter((s) => s?.kind === 'run_tests');
  const ran = runs.some((s) => s.kind === 'run_tests' && ((s.compile && !s.compile.ok) || s.cases.length > 0));
  const anyPass = runs.some((s) => s.kind === 'run_tests' && s.cases.some((c) => c.status === 'pass'));
  const nothingPassed = ran && !anyPass;
  if (nothingPassed) caseFlags.push({ code: 'nothing_passed', detail: 'mọi ca của gói test đều không đạt — mâu thuẫn với chẩn đoán phải do giảng viên xem (§4.3)' });

  // Q5: cờ của cuộc điều tra.
  for (const f of result.flags) caseFlags.push({ code: 'investigation_flag', detail: f });

  if (input.pipeline !== 'investigator') caseFlags.push({ code: 'not_code_pipeline', detail: 'bài tự luận không bao giờ tự quyết (§0.3)' });

  const errorFlags: ErrorFlag[] = score.unpricedRuleKeys.map((ruleKey) => ({ ruleKey, code: 'unpriced' as const }));

  let confidence = caseConfidence(errors, { modelCeiling: input.modelCeiling, coverageComplete });
  confidence = Math.min(confidence, result.confidenceCap);
  if (nothingPassed) confidence = Math.min(confidence, CONTRADICTION_CAP);

  if (caseFlags.length === 0 && errorFlags.length === 0 && confidence < input.theta) {
    caseFlags.push({ code: 'low_confidence', detail: `confidence ${confidence.toFixed(2)} < θ ${input.theta}` });
  }
  const auto = caseFlags.length === 0 && errorFlags.length === 0;
  return {
    outcome: auto ? 'auto' : 'flagged',
    ungradable: null,
    scoreHundredths: score.scoreHundredths,
    maxHundredths,
    errors,
    confidence,
    caseFlags,
    errorFlags,
    diagnosis,
  };
}

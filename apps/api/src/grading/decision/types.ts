import { InvestigationResult } from '../investigator/types';

/**
 * Đúng bốn mẫu điều kiện của spec UI mục 3.2 (§4.1). Không có mẫu thứ năm nào ngoài code:
 * mỗi mẫu được lập trình sẵn cho từng ngôn ngữ (rủi ro 10). Cùng hình dạng với
 * `eval/manifest.schema.ts` — module này không import từ `eval/`.
 */
export type RulePredicate =
  | { kind: 'test_group_failed'; group: string }
  | { kind: 'calls_function'; name: string }
  | { kind: 'complexity_exceeds_required' }
  | { kind: 'no_recursion'; functionName?: string };

/**
 * Một luật của bảng lỗi, đúng những gì `decide()` cần (§4.1). Định danh là `ruleKey` cho tới
 * plan 3c (bảng lỗi có uuid) — Q7.
 */
export interface ErrorRule {
  ruleKey: string;
  criterionKey: string;
  /** null = chưa có giá (§2.1). Số nguyên phần trăm điểm (§13.2). */
  deductionHundredths: number | null;
  predicate: RulePredicate | null;
}

export type VerdictSource = 'deterministic' | 'llm_with_tools' | 'llm_only';

export interface DiagnosedError {
  ruleKey: string;
  criterionKey: string;
  /** Lấy TỪ BẢNG, không do model đặt (§4.1). */
  deductionHundredths: number | null;
  source: VerdictSource;
  toolCallIds: string[];
}

export interface PredicateOutcome {
  /** `unmeasured`: không kết luận được — không bao giờ được đọc như `absent`. */
  state: 'present' | 'absent' | 'unmeasured';
  toolCallIds: string[];
  reason: string | null;
}

export interface Diagnosis {
  errors: DiagnosedError[];
  /** Đề xuất của model bị bỏ qua — luật máy kiểm được (§4.1 luật 2). Ghi, không lặng lẽ. */
  ignored: { ruleKey: string; reason: 'machine_checked_rule' }[];
  /** Kết quả đo của mọi luật có `predicate`, kể cả `absent` và `unmeasured`. */
  measurements: { ruleKey: string; criterionKey: string; outcome: PredicateOutcome }[];
}

/** Điều kiện của CẢ BÀI trượt → gắn cờ cả bài, nêu đích danh (§0.3). */
export type CaseFlagCode =
  | 'criterion_untouched'
  | 'criterion_without_rules'
  | 'nothing_passed'
  | 'investigation_flag'
  | 'low_confidence'
  | 'not_code_pipeline';

export interface CaseFlag {
  code: CaseFlagCode;
  detail: string;
}

/** Điều kiện gắn với MỘT lỗi trượt → gắn cờ đúng lỗi đó (§0.3, §6.3). */
export interface ErrorFlag {
  ruleKey: string;
  code: 'unpriced';
}

export interface DecisionInput {
  pipeline: 'investigator' | 'one_shot';
  result: InvestigationResult;
  bundle: { cases: { name: string; group: string }[] };
  rubric: { key: string; maxHundredths: number }[];
  rules: ErrorRule[];
  /** Tiêu chí giảng viên đánh dấu *"không có luật trừ"* (§4.2, T-FLOOR-6). */
  waivedCriteria: string[];
  /** Trần thấp nhất của các bậc model đã trả lời — chỉ kéo được `llm_only` xuống (§4.2). */
  modelCeiling: number;
  theta: number;
}

export interface Decision {
  /** `auto` = tự quyết; `flagged` = về giảng viên; `ungradable` = dưới sàn, không có điểm. */
  outcome: 'auto' | 'flagged' | 'ungradable';
  ungradable: { class: 'system' | 'submission'; reason: string } | null;
  scoreHundredths: number | null;
  maxHundredths: number;
  errors: DiagnosedError[];
  confidence: number | null;
  caseFlags: CaseFlag[];
  errorFlags: ErrorFlag[];
  diagnosis: Diagnosis | null;
}

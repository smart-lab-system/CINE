import type { CaseStatus } from '../../sandbox/contract';
import type { RulePredicate } from '../decision/types';
import type { TestBundleOrigin } from '../grading-model.types';
import type { TestCaseResult } from '../investigator/types';

/**
 * Gói test và quy tắc trừ điểm cho hồ sơ một bài (E1, spec §5.8c). HÀM THUẦN: nhận dữ liệu đã đọc, trả hình dạng
 * giao diện. `loadResultDetail` lo phần đọc DB. Không đổi điểm; chỉ mô tả cái gói test đã đo được.
 */

/** Trạng thái một ca trên giao diện. `not_run` không có nghĩa là đạt. */
export type TestCaseViewStatus = 'pass' | 'fail' | 'timeout' | 'error' | 'not_run';

export interface TestBundleInput {
  id: string;
  version: number;
  origin: TestBundleOrigin;
  filename: string | null;
  approvedAt: Date | null;
  cases: {
    caseKey: string;
    group: string;
    input: string;
    expectedOutput: string;
    constraintQuote: string | null;
    autoDroppedReason: string | null;
  }[];
  /** Kết quả của lượt chạy gần nhất, gộp theo tên ca. Ca vắng mặt là chưa chạy (`not_run`). */
  runs: TestCaseResult[];
  /** Mọi luật đang dùng của rubric. Hàm chỉ giữ những luật có predicate `test_group_failed`. */
  rules: {
    ruleId: string;
    ruleKey: string;
    predicate: RulePredicate | null;
    deductionHundredths: number | null;
    triggered: boolean;
  }[];
}

export interface TestBundleCaseView {
  caseKey: string;
  status: TestCaseViewStatus;
  ms: number | null;
  constraintQuote: string | null;
  input: string;
  expectedOutput: string;
  diff: string | null;
}

export interface TestBundleView {
  id: string;
  version: number;
  origin: TestBundleInput['origin'];
  filename: string | null;
  approved: boolean;
  /** Số ca còn hiệu lực (không tính ca bị hệ thống tự bỏ). */
  caseCount: number;
  droppedCount: number;
  groups: {
    group: string;
    cases: TestBundleCaseView[];
    rules: { ruleId: string; ruleKey: string; deductionHundredths: number | null; triggered: boolean }[];
  }[];
  /** Quy tắc dùng một nhóm mà gói này không có: không đo được, không trừ điểm, và KHÔNG có nghĩa là đạt. */
  unmeasuredRules: { ruleId: string; ruleKey: string; group: string }[];
  /** Ca không đạt thuộc nhóm không có quy tắc nào: không bị trừ điểm; nên mời thêm quy tắc cho nhóm. */
  uncoveredFailingCases: string[];
}

const FAILING: ReadonlySet<TestCaseViewStatus> = new Set(['fail', 'timeout', 'error']);

/** Trạng thái sandbox → trạng thái giao diện. Không có kết quả, hoặc `ran` (không có đáp án để đối chiếu) → not_run. */
export function caseViewStatus(status: CaseStatus | null): TestCaseViewStatus {
  switch (status) {
    case null:
    case 'ran':
      return 'not_run';
    case 'pass':
    case 'fail':
    case 'timeout':
      return status;
    default:
      // runtime_crash, recursion_limit, output_limit: ca đã chạy nhưng không ra kết quả đối chiếu được.
      return 'error';
  }
}

function groupOf(predicate: RulePredicate | null): string | null {
  return predicate?.kind === 'test_group_failed' ? predicate.group : null;
}

export function buildTestBundleView(input: TestBundleInput): TestBundleView {
  const kept = input.cases
    .filter((c) => c.autoDroppedReason === null)
    .sort((a, b) => a.caseKey.localeCompare(b.caseKey));
  const ran = new Map(input.runs.map((r) => [r.name, r]));
  const groupNames = [...new Set(kept.map((c) => c.group))];

  const groups = groupNames.map((group) => {
    const cases: TestBundleCaseView[] = kept
      .filter((c) => c.group === group)
      .map((c) => {
        const r = ran.get(c.caseKey);
        return {
          caseKey: c.caseKey,
          status: caseViewStatus(r?.status ?? null),
          ms: r?.ms ?? null,
          constraintQuote: c.constraintQuote,
          input: c.input,
          expectedOutput: c.expectedOutput,
          diff: r?.diff ?? null,
        };
      })
      .sort((a, b) => Number(!FAILING.has(a.status)) - Number(!FAILING.has(b.status)));
    const rules = input.rules
      .filter((r) => groupOf(r.predicate) === group)
      .map((r) => ({ ruleId: r.ruleId, ruleKey: r.ruleKey, deductionHundredths: r.deductionHundredths, triggered: r.triggered }));
    return { group, cases, rules };
  });

  const uncoveredFailingCases = groups
    .filter((g) => g.rules.length === 0)
    .flatMap((g) => g.cases.filter((c) => FAILING.has(c.status)).map((c) => c.caseKey));

  const present = new Set(groupNames);
  const unmeasuredRules = input.rules.flatMap((r) => {
    const group = groupOf(r.predicate);
    return group !== null && !present.has(group) ? [{ ruleId: r.ruleId, ruleKey: r.ruleKey, group }] : [];
  });

  return {
    id: input.id,
    version: input.version,
    origin: input.origin,
    filename: input.filename,
    approved: input.approvedAt !== null,
    caseCount: kept.length,
    droppedCount: input.cases.length - kept.length,
    groups,
    unmeasuredRules,
    uncoveredFailingCases,
  };
}

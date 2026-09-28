import { parseHundredths } from '../../grading/scoring/hundredths';

export interface RehearsalRule {
  ruleKey: string;
  name: string;
  description: string;
  criterionKey: string;
  predicate: { kind: 'test_group_failed'; group: string } | null;
  price: string;
}

export interface Expectation {
  /** Lỗi PHẢI tìm ra (và được tính điểm). */
  errors: string[];
  /** Lỗi mơ hồ: tìm hay không đều chấp nhận; tìm thấy thì điểm kỳ vọng trừ luôn. */
  optionalErrors?: string[];
  decision: 'auto' | 'review';
  /** Lăng kính cấp bài PHẢI nghi (vd gian_lan với bài hard-code). */
  suspectedLenses: string[];
  optionalSuspected?: string[];
}

export interface ScenarioSubmission {
  mssv: string;
  name: string;
  label: string;
  code: string;
  expect: Expectation;
}

export interface RehearsalScenario {
  id: string;
  rubric: { name: string; criteria: { key: string; description: string; maxPoints: number }[] };
  rules: RehearsalRule[];
  question: string;
  tests: { caseKey: string; group: string; input: string; expectedOutput: string }[];
  submissions: ScenarioSubmission[];
}

/** Những gì API trả về cho MỘT bài sau lượt chấm — đủ để chấm lại theo kỳ vọng. */
export interface ActualSubmission {
  mssv: string;
  status: string;
  score: number | null;
  confidence: number | null;
  /** `grading_result.modelUsed` — model đã chấm bài này (bậc model có thể xoay giữa chừng). */
  model: string | null;
  errors: { ruleKey: string; source: string; counted: string }[];
  verdicts: { lens: string; ruleKey: string; status: string; reason: string | null }[];
  caseNotes: { lens: string; suspected: boolean; note: string }[];
  caseFlags: string[];
  /** Giây kể từ lúc bấm bắt đầu chấm tới khi bài rời ai_grading; null = chưa xong. */
  finishedAtSec: number | null;
}

export type Decision = 'auto' | 'review' | 'ungradable' | 'pending';

export interface SubmissionCheck {
  mssv: string;
  label: string;
  expectedScore: number;
  actualScore: number | null;
  scoreOk: boolean;
  missedErrors: string[];
  extraErrors: string[];
  refuted: string[];
  expectedDecision: 'auto' | 'review';
  actualDecision: Decision;
  decisionOk: boolean;
  /** Tự duyệt mà điểm sai, hay lẽ ra phải chuyển giảng viên — điểm sai đi thẳng ra, không ai kiểm. */
  wrongAuto: boolean;
  falseFlags: string[];
  missedFlags: string[];
  lensFailures: string[];
  finishedAtSec: number | null;
}

export interface RunSummary {
  submissions: number;
  scoreOk: number;
  decisionOk: number;
  autoApproved: number;
  expectedAuto: number;
  wrongAuto: number;
  errorsExpected: number;
  errorsCaught: number;
  extraErrors: number;
  falseFlags: number;
  missedFlags: number;
  lensFailures: number;
  maxSubmissionSec: number | null;
  models: string[];
}

export interface RunRecord {
  id: string;
  startedAt: string;
  scenario: string;
  /** Commit mà bản deploy đang chạy (người chạy khai), không phải commit của harness. */
  deploy: string;
  note: string;
  /** Từ lúc bấm bắt đầu chấm tới khi bài cuối cùng xong. */
  wallSec: number | null;
  /** Ghi bù từ log console của một lượt chạy trước khi có harness. */
  backfilled: boolean;
  sessionId?: string;
  checks: SubmissionCheck[];
  summary: RunSummary;
}

const DECISION: Record<string, Decision> = {
  auto_approved: 'auto',
  flagged_for_review: 'review',
  ungradable: 'ungradable',
  ai_grading: 'pending',
};

const NOT_CONCLUDED = /^không (kết luận|đọc) được/;

function expectedScoreHundredths(scenario: RehearsalScenario, deducted: Set<string>): number {
  const perCriterion = new Map<string, number>();
  for (const rule of scenario.rules) {
    if (!deducted.has(rule.ruleKey)) continue;
    perCriterion.set(rule.criterionKey, (perCriterion.get(rule.criterionKey) ?? 0) + parseHundredths(rule.price));
  }
  let total = 0;
  for (const c of scenario.rubric.criteria) {
    const max = Math.round(c.maxPoints * 100);
    total += max - Math.min(max, perCriterion.get(c.key) ?? 0);
  }
  return total;
}

function checkOne(scenario: RehearsalScenario, sub: ScenarioSubmission, act: ActualSubmission | undefined): SubmissionCheck {
  const required = new Set(sub.expect.errors);
  const optional = new Set(sub.expect.optionalErrors ?? []);
  const errors = act?.errors ?? [];
  const found = new Set(errors.filter((e) => e.counted !== 'refuted' && e.counted !== 'excluded').map((e) => e.ruleKey));
  const deducted = new Set([...required, ...[...optional].filter((k) => found.has(k))]);
  const expectedScore = expectedScoreHundredths(scenario, deducted) / 100;
  const actualDecision: Decision = act ? (DECISION[act.status] ?? 'pending') : 'pending';
  const suspected = (act?.caseNotes ?? []).filter((n) => n.suspected).map((n) => n.lens);
  const missedErrors = [...required].filter((k) => !found.has(k));
  // Agent sót một lỗi luật BẰNG LỜI → bắt nó chính là việc của Bỏ sót, nên nó PHẢI nghi.
  // Lỗi luật máy kiểm thì không: hệ thống tự áp từ run_tests.
  const modelRules = new Set(scenario.rules.filter((r) => r.predicate === null).map((r) => r.ruleKey));
  const expectedFlags = new Set(sub.expect.suspectedLenses);
  if (missedErrors.some((k) => modelRules.has(k))) expectedFlags.add('bo_sot');
  const allowedFlags = new Set([...expectedFlags, ...(sub.expect.optionalSuspected ?? [])]);
  const scoreOk = act?.score != null && Math.round(act.score * 100) === Math.round(expectedScore * 100);
  return {
    mssv: sub.mssv,
    label: sub.label,
    expectedScore,
    actualScore: act?.score ?? null,
    scoreOk,
    missedErrors,
    extraErrors: [...found].filter((k) => !required.has(k) && !optional.has(k)),
    refuted: errors.filter((e) => e.counted === 'refuted').map((e) => e.ruleKey),
    expectedDecision: sub.expect.decision,
    actualDecision,
    decisionOk: actualDecision === sub.expect.decision,
    wrongAuto: actualDecision === 'auto' && (sub.expect.decision === 'review' || !scoreOk),
    falseFlags: suspected.filter((l) => !allowedFlags.has(l)),
    missedFlags: [...expectedFlags].filter((l) => !suspected.includes(l)),
    lensFailures: [
      ...(act?.caseNotes ?? []).filter((n) => NOT_CONCLUDED.test(n.note)).map((n) => n.lens),
      ...(act?.verdicts ?? []).filter((v) => v.status === 'unverified').map((v) => `${v.lens}:${v.ruleKey}`),
    ],
    finishedAtSec: act?.finishedAtSec ?? null,
  };
}

/** Bản ghi được commit vào git: chỉ phiên diễn tập (tên "TEST …") mới được ghi, không bao giờ phiên thật. */
export function isRehearsalSession(name: string): boolean {
  return name.startsWith('TEST ');
}

/** Chỉ giữ bài của sinh viên CÓ trong kịch bản — không ghi bài của ai khác lỡ nằm trong phiên. */
export function scenarioRows<T extends { studentMssv: string }>(scenario: RehearsalScenario, rows: T[]): T[] {
  const mssv = new Set(scenario.submissions.map((s) => s.mssv));
  return rows.filter((r) => mssv.has(r.studentMssv));
}

/** Chấm một lượt diễn tập theo kỳ vọng của kịch bản — thuần, không gọi mạng. */
export function evaluateRun(scenario: RehearsalScenario, actuals: ActualSubmission[]): { checks: SubmissionCheck[]; summary: RunSummary } {
  const byMssv = new Map(actuals.map((a) => [a.mssv, a]));
  const checks = scenario.submissions.filter((s) => byMssv.has(s.mssv)).map((s) => checkOne(scenario, s, byMssv.get(s.mssv)));
  const count = (f: (c: SubmissionCheck) => boolean) => checks.filter(f).length;
  const sum = (f: (c: SubmissionCheck) => number) => checks.reduce((acc, c) => acc + f(c), 0);
  const expectedErrors = (c: SubmissionCheck) => scenario.submissions.find((s) => s.mssv === c.mssv)!.expect.errors.length;
  const times = checks.map((c) => c.finishedAtSec).filter((t): t is number => t !== null);
  return {
    checks,
    summary: {
      submissions: checks.length,
      scoreOk: count((c) => c.scoreOk),
      decisionOk: count((c) => c.decisionOk),
      autoApproved: count((c) => c.actualDecision === 'auto'),
      expectedAuto: count((c) => c.expectedDecision === 'auto'),
      wrongAuto: count((c) => c.wrongAuto),
      errorsExpected: sum(expectedErrors),
      errorsCaught: sum((c) => expectedErrors(c) - c.missedErrors.length),
      extraErrors: sum((c) => c.extraErrors.length),
      falseFlags: sum((c) => c.falseFlags.length),
      missedFlags: sum((c) => c.missedFlags.length),
      lensFailures: sum((c) => c.lensFailures.length),
      maxSubmissionSec: times.length > 0 ? Math.max(...times) : null,
      models: [...new Set(checks.map((c) => byMssv.get(c.mssv)?.model).filter((m): m is string => !!m))].sort(),
    },
  };
}

/** README của thư mục lượt diễn tập: bảng so sánh mọi lượt, cũ trước mới sau. */
export function renderIndex(runs: RunRecord[]): string {
  const sorted = [...runs].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const header = [
    '| Lượt | Thời điểm (UTC) | Bản chạy | Model | Kịch bản | Tự duyệt SAI | Điểm đúng | Lỗi bắt được | Lỗi thừa | Quyết định đúng | Tự duyệt (thực/kỳ vọng) | Cờ oan | Cờ bỏ lỡ | Lăng kính hỏng | Chấm (s) | Ghi chú |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
  ];
  const rows = sorted.map((r) => {
    const s = r.summary;
    return `| ${[
      r.id,
      r.startedAt.slice(0, 16).replace('T', ' '),
      r.deploy,
      s.models?.length ? s.models.join(', ') : '—',
      r.scenario,
      s.wrongAuto,
      `${s.scoreOk}/${s.submissions}`,
      `${s.errorsCaught}/${s.errorsExpected}`,
      s.extraErrors,
      `${s.decisionOk}/${s.submissions}`,
      `${s.autoApproved}/${s.expectedAuto}`,
      s.falseFlags,
      s.missedFlags,
      s.lensFailures,
      r.wallSec ?? '—',
      `${r.note}${r.backfilled ? ' (ghi bù từ log)' : ''}`,
    ].join(' | ')} |`;
  });
  return [
    '# Lịch sử diễn tập chấm điểm thật',
    '',
    'Mỗi lượt chạy thật (model + sandbox thật, trên bản deploy) một kịch bản có kỳ vọng dựng sẵn cho',
    'từng bài, rồi chấm lượt đó theo kỳ vọng. Một bản sửa chỉ được coi là có tác dụng khi lượt chạy',
    'SAU nó tốt hơn lượt trước trên bảng này. Chi tiết từng bài: `<lượt>/run.json`.',
    '',
    'Chạy: `pnpm --filter api rehearsal -- --scenario <id> --deploy <sha> --note "<vì sao chạy>"`',
    '(cần `REHEARSAL_BASE_URL`, `REHEARSAL_EMAIL`, `REHEARSAL_PASSWORD`, `REHEARSAL_CLASS_ID`).',
    'Bảng này sinh lại từ mọi `run.json` sau mỗi lượt — đừng sửa tay.',
    '',
    ...header,
    ...rows,
    '',
  ].join('\n');
}

import { parseHundredths } from '../grading/scoring/hundredths';
import { expectedScoreHundredths, LoadedDe } from './load-dataset';
import { CaseRun, normalizeOutput, ProgramRunner } from './program-runner';

export interface CheckProblem {
  de: string;
  caseId: string | null;
  code: string;
  message: string;
}

export function stripCppComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .join('\n');
}

type Outputs = Map<string, CaseRun>;

/**
 * Chứng minh sự thật nền của MỘT đề bằng cách chạy mã (spec 2026-09-20
 * §12.2): mỗi luật V1–V11 của plan chặn một cách fixture tự nói dối. Không
 * bao giờ sửa nhãn cho khớp — chỉ báo.
 */
export async function checkDe(de: LoadedDe, runner: ProgramRunner): Promise<CheckProblem[]> {
  const m = de.manifest;
  const problems: CheckProblem[] = [];
  const add = (caseId: string | null, code: string, message: string) =>
    problems.push({ de: m.id, caseId, code, message });
  const allInputs = [
    ...de.tests.map((t) => ({ key: `t_${t.key}`, input: t.input })),
    ...de.probes.map((p) => ({ key: `p_${p.key}`, input: p.input })),
  ];

  const runAll = async (source: string): Promise<Outputs | null> => {
    const r = await runner.run({ driver: de.driverSource, source, cases: allInputs });
    if (!r.compiled) return null;
    return new Map(r.cases.map((c): [string, CaseRun] => [c.key, c]));
  };

  // V5 — đáp án mẫu phải biên dịch và qua mọi ca có output ghi sẵn.
  const model = await runAll(de.modelSource);
  if (!model) {
    add(null, 'MODEL_DOES_NOT_COMPILE', `${m.modelAnswer} không biên dịch được`);
    return problems;
  }
  const expected = new Map<string, string>();
  for (const t of de.tests) {
    const got = model.get(`t_${t.key}`)!;
    if (got.status !== 'ok') {
      add(null, 'MODEL_FAILS_TEST', `đáp án mẫu ${got.status} ở ca ${t.key}`);
      continue;
    }
    if (t.expected !== null && normalizeOutput(got.stdout) !== normalizeOutput(t.expected)) {
      add(null, 'MODEL_FAILS_TEST', `đáp án mẫu ra sai ở ca ${t.key}`);
      continue;
    }
    expected.set(t.key, t.expected ?? got.stdout);
  }
  if (problems.length > 0) return problems;

  const failingGroups = (out: Outputs) => {
    const groups = new Set<string>();
    for (const t of de.tests) {
      const got = out.get(`t_${t.key}`)!;
      if (got.status !== 'ok' || normalizeOutput(got.stdout) !== normalizeOutput(expected.get(t.key)!)) {
        groups.add(t.group);
      }
    }
    return groups;
  };
  const differsOnProbes = (out: Outputs) =>
    de.probes.some((p) => {
      const a = model.get(`p_${p.key}`)!;
      const b = out.get(`p_${p.key}`)!;
      return a.status !== b.status || normalizeOutput(a.stdout) !== normalizeOutput(b.stdout);
    });
  const testRuleFor = new Map(
    m.rules.flatMap((r): [string, string][] =>
      r.predicate?.kind === 'test_group_failed' ? [[r.predicate.group, r.ruleKey]] : [],
    ),
  );
  const testRuleKeys = new Set(testRuleFor.values());
  const byId = new Map(m.cases.map((c) => [c.id, c]));

  for (const c of m.cases) {
    const source = de.sources.get(c.id)!;

    // V3 — T-EVAL-8
    try {
      const computed = expectedScoreHundredths(de, c);
      const typed = c.expectedScore === null ? null : parseHundredths(c.expectedScore);
      if (computed !== typed) {
        add(c.id, 'SCORE_MISMATCH', `expectedScore ${c.expectedScore} ≠ điểm tính được ${computed}`);
      }
    } catch (error) {
      add(c.id, 'SCORE_MISMATCH', error instanceof Error ? error.message : String(error));
    }

    // V4 — luật theo nhóm
    if (c.group === 2 && (c.expectedRuleIds.length > 0 || c.expectedOutcome !== 'graded')) {
      add(c.id, 'GROUP_RULE', 'nhóm 2 phải không có lỗi và có điểm');
    }
    if (c.group === 4 && c.expectedOutcome === 'graded') {
      add(c.id, 'GROUP_RULE', 'nhóm 4 không được có kết cục graded');
    }
    if (c.group === 3) {
      const twin = c.cleanTwin ? byId.get(c.cleanTwin) : undefined;
      if (!twin || twin.group !== 1) {
        add(c.id, 'GROUP_RULE', 'nhóm 3 phải trỏ tới đúng một ca nhóm 1 làm bản sạch');
      } else {
        if ([...twin.expectedRuleIds].sort().join() !== [...c.expectedRuleIds].sort().join()) {
          add(c.id, 'GROUP_RULE', 'nhóm 3 phải có cùng expectedRuleIds với bản sạch');
        }
        // V10 — injection chỉ là chú thích
        if (stripCppComments(source) !== stripCppComments(de.sources.get(twin.id)!)) {
          add(c.id, 'INJECTION_NOT_COMMENT_ONLY', 'bỏ chú thích đi thì mã phải giống hệt bản sạch');
        }
      }
      continue; // hành vi của nhóm 3 đã được chứng minh qua bản sạch
    }

    // V11 — nhóm 4
    if (c.group === 4) {
      if (c.expectedOutcome === 'ungradable' && source.trim() !== '') {
        add(c.id, 'DEGENERATE', 'ca "không chấm được" phải là file rỗng');
      }
      if (c.expectedOutcome === 'flagged') {
        const out = await runAll(source);
        if (out) add(c.id, 'DEGENERATE', 'ca "không biên dịch" lại biên dịch được');
      }
      continue;
    }

    const out = await runAll(source);
    if (!out) {
      add(c.id, 'DOES_NOT_COMPILE', `${c.file} không biên dịch được`);
      continue;
    }
    const failing = failingGroups(out);

    if (c.group === 2) {
      // V8
      if (failing.size > 0 || differsOnProbes(out)) {
        add(c.id, 'NOT_A_CORRECT_SOLUTION', `trượt nhóm ${[...failing].join(', ') || '(dò biên)'}`);
      }
      continue;
    }

    // Nhóm 1
    if (c.behavior === 'static') {
      // V9
      if (failing.size > 0) {
        add(c.id, 'STATIC_MUTANT_CHANGES_BEHAVIOR', `đột biến tĩnh lại trượt nhóm ${[...failing].join(', ')}`);
      }
      for (const key of c.expectedRuleIds) {
        const rule = m.rules.find((r) => r.ruleKey === key);
        if (rule?.predicate?.kind === 'calls_function') {
          const call = new RegExp(`\\b${rule.predicate.name}\\s*\\(`);
          if (!call.test(stripCppComments(source))) {
            add(c.id, 'STATIC_MUTANT_MISSING_CALL', `không thấy lời gọi ${rule.predicate.name}(`);
          }
        }
      }
      continue;
    }

    // V6 — T-EVAL-2
    if (failing.size === 0 && !differsOnProbes(out)) {
      add(c.id, 'EQUIVALENT_MUTANT', 'đột biến không đổi hành vi ở ca test hay input dò biên nào');
    }
    // V7 — T-EVAL-14
    const actual = [...failing]
      .map((g) => testRuleFor.get(g))
      .filter((k): k is string => Boolean(k))
      .sort();
    const labeled = c.expectedRuleIds.filter((k) => testRuleKeys.has(k)).sort();
    if (actual.join() !== labeled.join()) {
      add(c.id, 'RULE_LABEL_MISMATCH', `nhãn [${labeled.join(', ')}] nhưng chạy thật trượt [${actual.join(', ')}]`);
    }
  }
  return problems;
}

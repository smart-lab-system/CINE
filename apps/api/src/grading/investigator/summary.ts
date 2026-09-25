import { RuleEntry, StopReason, StructuredResult, ToolCall, Verdict } from './types';

const STOP_LABEL: Record<StopReason, string> = {
  verdict: 'agent đã kết luận',
  max_tool_calls: 'chạm trần số lời gọi công cụ',
  max_wall: 'chạm trần thời gian',
  max_tokens: 'chạm trần token',
  max_rounds: 'chạm trần số vòng',
  stalled: 'agent treo (2 vòng, 0 lời gọi công cụ thành công)',
  blocked_repeatedly: 'bị chặn trùng 3 lần liên tiếp',
  models_exhausted: 'mọi bậc model đều hỏng',
  invalid_program: 'bài nộp hay gói test không gửi được sang sandbox',
  empty_submission: 'bài nộp không có dòng mã nào',
};

function describeRunTests(t: ToolCall, s: Extract<StructuredResult, { kind: 'run_tests' }>): string {
  const scope = typeof t.args.group === 'string' ? `nhóm ${t.args.group}` : 'mọi nhóm';
  if (s.compile && !s.compile.ok) return `- ${t.id} run_tests (${scope}): biên dịch lỗi`;
  const byGroup = new Map<string, { pass: number; total: number }>();
  for (const c of s.cases) {
    const key = c.group ?? '(không nhóm)';
    const e = byGroup.get(key) ?? { pass: 0, total: 0 };
    e.total++;
    if (c.status === 'pass') e.pass++;
    byGroup.set(key, e);
  }
  const pass = s.cases.filter((c) => c.status === 'pass').length;
  const failed = [...byGroup].filter(([, e]) => e.pass < e.total).map(([g, e]) => `${g} ${e.pass}/${e.total}`);
  return (
    `- ${t.id} run_tests (${scope}): ${pass}/${s.cases.length} ca đạt` +
    (failed.length ? ` — trượt: ${failed.join(', ')}` : '') +
    (s.aborted ? ' (dừng giữa chừng vì hết ngân sách của job)' : '')
  );
}

/**
 * Đoạn văn giảng viên đọc ở màn lịch sử — render bằng CODE từ lời gọi thật (§5.1). Model
 * chỉ sinh verdict có cấu trúc; `note` và mô tả luật còn thiếu của nó không bao giờ đi
 * thẳng ra đây, vì mọi lớp chống bịa kiểm verdict, không kiểm LỜI KỂ.
 */
export function renderSummary(input: {
  toolCalls: ToolCall[];
  structured: Record<string, StructuredResult>;
  verdict: Verdict | null;
  rules: RuleEntry[];
  stopReason: StopReason;
}): string {
  const { toolCalls, structured, verdict, rules, stopReason } = input;
  const titles = new Map(rules.map((r) => [r.ruleKey, r.title]));
  const counts = new Map<string, number>();
  for (const t of toolCalls) counts.set(t.tool, (counts.get(t.tool) ?? 0) + 1);

  const breakdown = counts.size ? ` (${[...counts].map(([k, v]) => `${v} ${k}`).join(', ')})` : '';
  const lines = [`Đã gọi ${toolCalls.length} công cụ${breakdown} · dừng vì ${STOP_LABEL[stopReason]}.`];
  for (const t of toolCalls) {
    if (t.status !== 'ok') {
      lines.push(`- ${t.id} ${t.tool}: ${t.status}`);
      continue;
    }
    const s = t.structuredRef ? structured[t.structuredRef] : undefined;
    if (s?.kind === 'run_tests') lines.push(describeRunTests(t, s));
    if (s?.kind === 'run') {
      lines.push(`- ${t.id} run: ${s.compile && !s.compile.ok ? 'biên dịch lỗi' : `kết cục ${s.status}`}`);
    }
  }
  if (!verdict) {
    lines.push('Không có kết luận.');
  } else if (verdict.errors.length === 0) {
    lines.push('Không kết luận lỗi nào.');
  } else {
    lines.push('Lỗi kết luận:');
    for (const e of verdict.errors) {
      lines.push(
        `- ${e.ruleKey} — ${titles.get(e.ruleKey) ?? '(không có trong bảng)'} (bằng chứng: ${e.toolCallIds.join(', ')})`,
      );
    }
  }
  if (verdict && verdict.missingRules.length > 0) {
    lines.push(`Luật còn thiếu do agent báo: ${verdict.missingRules.length}.`);
  }
  return lines.join('\n');
}

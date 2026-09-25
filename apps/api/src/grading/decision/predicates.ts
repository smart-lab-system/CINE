import { CaseStatus } from '../../sandbox/contract';
import { StructuredResult, ToolCall } from '../investigator/types';
import { PredicateOutcome, RulePredicate } from './types';

/** Kết cục "không đạt" của một ca. `timeout` KHÔNG ở đây — §4.5, Q3. */
const FAILED: ReadonlySet<CaseStatus> = new Set<CaseStatus>(['fail', 'runtime_crash', 'recursion_limit', 'output_limit']);

/** Công cụ mà mẫu điều kiện cần, cho các mẫu chưa đo được ở bước 3 (Q1). */
const NEEDS: Record<Exclude<RulePredicate['kind'], 'test_group_failed'>, string> = {
  complexity_exceeds_required: 'cần run_scaled (bước 4) — máy chưa đo được',
  calls_function: 'cần ast_query (bước 5) — máy chưa đo được',
  no_recursion: 'cần ast_query (bước 5) — máy chưa đo được',
};

const unmeasured = (reason: string): PredicateOutcome => ({ state: 'unmeasured', toolCallIds: [], reason });

/** Code đo được mẫu này ở bước này — và chỉ khi đó model mới bị cấm đề xuất luật (§4.1 luật 2, Q1). */
export function isMachineChecked(p: RulePredicate | null): boolean {
  return p !== null && p.kind === 'test_group_failed';
}

/**
 * Kết quả đo một `predicate` trên kết quả công cụ ĐÃ LƯU — không chạy gì (§2.2 bậc 2, T-TIER-2).
 * `absent` chỉ khi MỌI ca của nhóm đã có kết quả và đều pass: không thấy ca nào fail không phải
 * là "không có lỗi" (§4.2). Không kết luận được thì `unmeasured`, kèm lý do — không bao giờ đoán.
 */
export function evaluatePredicate(
  p: RulePredicate,
  bundle: { cases: { name: string; group: string }[] },
  toolCalls: ToolCall[],
  structured: Record<string, StructuredResult>,
): PredicateOutcome {
  if (p.kind !== 'test_group_failed') return unmeasured(NEEDS[p.kind]);
  const expected = bundle.cases.filter((c) => c.group === p.group).map((c) => c.name);
  if (expected.length === 0) return unmeasured(`nhóm "${p.group}" không có trong gói test`);

  const compileFailed: string[] = [];
  let compiledSomewhere = false;
  /** tên ca → mọi kết cục đã thấy, và lời gọi đã thấy nó fail */
  const seen = new Map<string, { statuses: Set<CaseStatus>; failedIn: Set<string> }>();
  for (const t of toolCalls) {
    if (t.tool !== 'run_tests' || t.status !== 'ok' || !t.structuredRef) continue;
    const s = structured[t.structuredRef];
    if (s?.kind !== 'run_tests') continue;
    const scope = typeof t.args.group === 'string' ? t.args.group : null;
    if (s.compile && !s.compile.ok) {
      // T-COMPILE-1: thước ĐÃ đo — mọi ca lời gọi đó yêu cầu là compile_error.
      if (scope === null || scope === p.group) compileFailed.push(t.id);
      continue;
    }
    compiledSomewhere = true;
    for (const c of s.cases) {
      if (c.group !== p.group) continue;
      const e = seen.get(c.name) ?? { statuses: new Set<CaseStatus>(), failedIn: new Set<string>() };
      e.statuses.add(c.status);
      if (FAILED.has(c.status)) e.failedIn.add(t.id);
      seen.set(c.name, e);
    }
  }
  // Review I1: biên dịch là của CẢ chương trình. Một lời gọi hỏng biên dịch mà một lời gọi khác
  // biên dịch được là hạ tầng chập chờn (quá giờ biên dịch, …), không phải bằng chứng về bài
  // (§4.5, T-DOWN-1). Chỉ khi MỌI lời gọi đều hỏng biên dịch mới là T-COMPILE-1.
  if (compileFailed.length > 0 && compiledSomewhere) return unmeasured('kết quả không ổn định giữa các lần chạy — biên dịch lúc được lúc không');
  if (compileFailed.length > 0) return { state: 'present', toolCallIds: compileFailed, reason: 'bài không biên dịch' };

  const solid = [...seen.values()].filter((e) => e.failedIn.size > 0 && !e.statuses.has('pass'));
  if (solid.length > 0) {
    return { state: 'present', toolCallIds: [...new Set(solid.flatMap((e) => [...e.failedIn]))].sort(), reason: null };
  }
  if ([...seen.values()].some((e) => e.failedIn.size > 0 && e.statuses.has('pass'))) {
    return unmeasured('kết quả không ổn định giữa các lần chạy');
  }
  if ([...seen.values()].some((e) => e.statuses.has('timeout'))) {
    return unmeasured('hết giờ — chưa tách được chậm với treo (§4.5)');
  }
  if (expected.every((name) => seen.get(name)?.statuses.has('pass'))) {
    const ids = toolCalls.filter((t) => t.tool === 'run_tests' && t.status === 'ok').map((t) => t.id);
    return { state: 'absent', toolCallIds: ids, reason: null };
  }
  return unmeasured('chưa chạy đủ các ca của nhóm');
}

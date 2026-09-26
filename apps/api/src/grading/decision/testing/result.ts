import { DEFAULT_BUDGET } from '../../investigator/budget';
import { InvestigationResult, StopReason, StructuredResult, TestCaseResult, ToolCall } from '../../investigator/types';

type Case = Pick<TestCaseResult, 'name' | 'group' | 'status'>;

/** Một lời gọi `run_tests` thành công và phần có cấu trúc của nó. */
export function runTestsCall(
  id: string,
  group: string | null,
  cases: Case[],
  opts: { compileOk?: boolean; aborted?: boolean } = {},
): { call: ToolCall; structured: StructuredResult } {
  return {
    call: {
      id, tool: 'run_tests', args: { group }, status: 'ok', output: '', structuredRef: id,
      startedAt: '2026-09-25T00:00:00.000Z', wallMs: 10, injectionSuspected: false,
    },
    structured: {
      kind: 'run_tests',
      compile: { ok: opts.compileOk ?? true, log: opts.compileOk === false ? 'lỗi' : '', ms: 5 },
      cases: opts.compileOk === false ? [] : cases.map((c) => ({ ...c, diff: null, ms: 3 })),
      aborted: opts.aborted ?? false,
      host: null,
    },
  };
}

export function readFileCall(id: string, path: string): ToolCall {
  return {
    id, tool: 'read_file', args: { path, fromLine: null, toLine: null }, status: 'ok', output: '', structuredRef: null,
    startedAt: '2026-09-25T00:00:00.000Z', wallMs: 1, injectionSuspected: false,
  };
}

/** Một kết quả điều tra kết luận được, dựng từ các lời gọi đã cho. */
export function resultWith(over: {
  calls?: ({ call: ToolCall; structured?: StructuredResult } | ToolCall)[];
  errors?: { ruleKey: string; toolCallIds: string[] }[];
  kind?: InvestigationResult['kind'];
  ungradable?: InvestigationResult['ungradable'];
  flags?: InvestigationResult['flags'];
  stopReason?: StopReason;
  confidenceCap?: number;
} = {}): InvestigationResult {
  const toolCalls: ToolCall[] = [];
  const structuredResults: Record<string, StructuredResult> = {};
  for (const x of over.calls ?? []) {
    if ('call' in x) {
      toolCalls.push(x.call);
      if (x.structured) structuredResults[x.call.id] = x.structured;
    } else toolCalls.push(x);
  }
  const kind = over.kind ?? 'verdict';
  return {
    kind,
    verdict: kind === 'verdict'
      ? { errors: (over.errors ?? []).map((e) => ({ ...e, note: null })), missingRules: [], injectionAttempt: { detected: false, excerpt: null } }
      : null,
    rejected: [],
    ungradable: over.ungradable ?? null,
    flags: over.flags ?? [],
    confidenceCap: over.confidenceCap ?? 1,
    replay: null,
    summary: '',
    investigation: {
      toolCalls, structuredResults, complexity: null, minimalFailingCase: null, approach: null, peerCluster: null,
      budget: { toolCalls: toolCalls.length, wallMs: 0, tokens: 0, rounds: 1, forcedFinal: false, stopReason: over.stopReason ?? 'verdict', limits: DEFAULT_BUDGET },
      modelsUsed: ['m'], tierRotations: [],
    },
    usage: { inputTokens: 0, outputTokens: 0 },
  };
}

import { randomUUID } from 'node:crypto';
import { ExecResult, SANDBOX_CONTRACT_VERSION } from '../../../sandbox/contract';
import { ExecRequest } from '../../../sandbox/sandbox.client';
import { TEST_HOST } from '../../../sandbox-worker/testing/fake-docker';
import { SandboxPort } from '../tools';

type Case = ExecResult['cases'][number];

export function execResult(cases: Partial<Case>[], over: Partial<ExecResult> = {}): ExecResult {
  return {
    contract: SANDBOX_CONTRACT_VERSION,
    kind: 'exec',
    jobId: randomUUID(),
    host: TEST_HOST,
    compile: { ok: true, log: '', ms: 5 },
    cases: cases.map((c, i) => ({
      name: `c${i}`,
      group: null,
      status: 'pass',
      ms: 3,
      stdout: null,
      diff: null,
      limitsHit: [],
      ...c,
    })),
    totalMs: 10,
    aborted: null,
    unavailable: null,
    ...over,
  };
}

/** Sandbox giả: ghi lại mọi request, trả lời theo hàm của test. */
export function fakeSandbox(
  answer: (req: ExecRequest, n: number) => ExecResult,
): SandboxPort & { requests: ExecRequest[] } {
  const requests: ExecRequest[] = [];
  return {
    requests,
    async exec(req) {
      requests.push(req);
      return answer(req, requests.length);
    },
  };
}

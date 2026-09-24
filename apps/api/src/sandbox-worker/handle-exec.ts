import { chmod, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import {
  CaseStatus,
  execJob,
  ExecResult,
  HostFingerprint,
  SANDBOX_CONTRACT_VERSION,
  unavailableExec,
} from '../sandbox/contract';
import { compareOutput } from './comparators';
import { materialize } from './fetch-files';
import { compile, RunnerEnv, runCase, writeProgram } from './programs';

export interface WorkerDeps {
  runner: RunnerEnv;
  host: HostFingerprint;
  workRoot: string;
  /** Đồng hồ cho ngân sách thời gian — thay được trong test. */
  now?: () => number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

/** jobId của một payload chưa qua kiểm — để kết quả unavailable vẫn trỏ đúng job. */
export function jobIdOf(raw: unknown): string {
  const id = (raw as { jobId?: unknown } | null)?.jobId;
  return typeof id === 'string' && UUID.test(id) ? id : NIL_UUID;
}

export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Job kiểm tính đúng. Mọi lỗi ném ra từ đây đều thành `unavailable` — kể cả
 * lỗi lập trình của chính worker — vì luật chốt của §4.4: không CHỨNG MINH
 * được lỗi thuộc về bài thì không được để nó trông như bài sai.
 */
export async function handleExec(raw: unknown, deps: WorkerDeps, cpuset: string | null): Promise<ExecResult> {
  const parsed = execJob.safeParse(raw);
  if (!parsed.success) {
    return unavailableExec(jobIdOf(raw), `job sai schema: ${parsed.error.issues[0]?.message ?? 'không rõ'}`, deps.host);
  }
  const job = parsed.data;
  if (job.comparator.kind === 'checker') {
    return unavailableExec(job.jobId, `checker "${job.comparator.name}" chưa được cài ở worker`, deps.host);
  }

  const now = deps.now ?? Date.now;
  const started = now();
  const dir = await mkdtemp(join(deps.workRoot, 'exec-'));
  try {
    // mkdtemp tạo 0700 — uid 1000 trong container không vào được (Review Focus 5).
    await chmod(dir, 0o755);
    const src = join(dir, 'src');
    const bin = join(dir, 'bin');
    const { entry } = await writeProgram(src, job.language, job.program, deps.runner.fetchPolicy);
    const sanitize = job.language === 'cpp' && job.sanitize;
    const compiled = await compile(deps.runner, { language: job.language, srcDir: src, outDir: bin, sanitize, cpuset });
    const base = {
      contract: SANDBOX_CONTRACT_VERSION,
      kind: 'exec' as const,
      jobId: job.jobId,
      host: deps.host,
      compile: compiled,
      unavailable: null,
    };
    if (!compiled.ok) return { ...base, cases: [], totalMs: now() - started, aborted: null };

    const cases: ExecResult['cases'] = [];
    let aborted: 'budget' | null = null;
    for (const c of job.cases) {
      // Hết ngân sách thì dừng và trả phần đã chạy (§3.1 chốt 4).
      if (now() - started > job.budgetMs) {
        aborted = 'budget';
        break;
      }
      const r = await runCase(deps.runner, {
        language: job.language,
        workDir: job.language === 'cpp' ? bin : src,
        entry,
        stdin: await materialize(c.stdin, deps.runner.fetchPolicy),
        limits: job.limits,
        sanitize,
        cpuset,
      });
      let status: CaseStatus = r.status;
      let diff: string | null = null;
      let stdout: string | null = null;
      if (r.status === 'ran') {
        if (c.expected === null) {
          stdout = r.stdout.toString('utf8').slice(0, 65_536);
        } else {
          // Output mong đợi hiện thực SAU khi container của ca đã bị xoá, và chỉ
          // trong bộ nhớ (§3.5 luật 4).
          const expected = (await materialize(c.expected, deps.runner.fetchPolicy)).toString('utf8');
          const cmp = compareOutput(expected, r.stdout.toString('utf8'), job.comparator);
          status = cmp.equal ? 'pass' : 'fail';
          diff = cmp.diff;
        }
      }
      cases.push({ name: c.name, group: c.group, status, ms: r.ms, stdout, diff, limitsHit: r.limitsHit });
    }
    return { ...base, cases, totalMs: now() - started, aborted };
  } catch (error) {
    return unavailableExec(job.jobId, describeError(error), deps.host);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

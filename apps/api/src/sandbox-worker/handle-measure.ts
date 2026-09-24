import { randomBytes } from 'node:crypto';
import { chmod, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import {
  CompileInfo,
  MeasureJob,
  measureJob,
  MeasureResult,
  MeasureSample,
  ProgramSpec,
  SANDBOX_CONTRACT_VERSION,
  SandboxLanguage,
  unavailableMeasure,
} from '../sandbox/contract';
import { classifyExit, isDockerFailure } from './classify';
import { execArgs, runArgs, timeoutCommand } from './docker-args';
import { materialize } from './fetch-files';
import { describeError, jobIdOf, WorkerDeps } from './handle-exec';
import { compile, containerName, DOCKER_SLACK_MS, InfraError, removeContainer, writeProgram } from './programs';
import { cpusetSize } from './slots';

const MiB = 1024 * 1024;
export const BASELINE_RUNS = 5;
/** docker-init (PID 1, do `--init`) + `sleep infinity`. Hơn thế là tiến trình nền của bài. */
export const EXPECTED_PROCESSES = 2;
const MAX_TIMED_STDOUT = 64 * 1024;

type Who = 'submission' | 'reference';
interface Running {
  who: Who;
  container: string;
  entry: string;
}

/** Container của bài biến mất giữa chừng — chính bài đã giết nó. */
class ContainerGone extends Error {}

/**
 * Dòng số đo CUỐI mang đúng mã của mẫu. Mã chặn các lệnh in vô tình; nó
 * không chặn được bài cố tình đọc env — việc đó là của số đo ngoài (§3.5).
 */
export function parseTiming(stderr: string, nonce: string): { ns: number; checksum: string | null } | null {
  let found: { ns: number; checksum: string | null } | null = null;
  for (const m of stderr.matchAll(/^CINE_T (\S+) (\d+) (\S+)$/gm)) {
    if (m[1] !== nonce) continue;
    found = { ns: Number(m[2]), checksum: m[3] === '-' ? null : m[3].slice(0, 64) };
  }
  return found;
}

/** `entry` null = baseline: chương trình rỗng của image, cùng cách bấm giờ. */
export function timedCommand(language: SandboxLanguage, mode: 'in_process' | 'process', entry: string | null): string[] {
  let target: string[];
  if (language === 'cpp') {
    target = [entry === null ? (mode === 'in_process' ? '/opt/cine/empty-timed' : '/opt/cine/empty') : `/work/${entry}`];
  } else {
    const file = entry === null ? (mode === 'in_process' ? '/opt/cine/empty_timed.py' : '/opt/cine/empty.py') : `/work/${entry}`;
    target = ['/usr/local/bin/python3', '/opt/cine/cine_run.py', file];
  }
  // cine-time execv đường dẫn tuyệt đối — nên python3 phải là đường dẫn đầy đủ.
  return mode === 'process' ? ['/opt/cine/cine-time', ...target] : target;
}

async function startContainer(deps: WorkerDeps, job: MeasureJob, name: string, workDir: string, slot: string | null) {
  const args = runArgs({
    name,
    image: deps.runner.images[job.language],
    hardening: {
      runtime: deps.runner.runtime,
      cpuset: slot,
      cpus: slot ? cpusetSize(slot) : 1,
      memoryMb: job.limits.memoryMb,
      pids: job.limits.pids,
      fsizeBytes: 64 * MiB,
    },
    mounts: [{ source: workDir, target: '/work', readonly: true }],
    env: {},
    interactive: false,
    detach: true,
    command: ['sleep', 'infinity'],
  });
  const r = await deps.runner.docker.run(args, { maxStdoutBytes: 4_096, wallMs: 60_000 });
  if (r.code !== 0) throw new InfraError(`không khởi động được container đo: ${r.stderr.slice(0, 300)}`);
}

async function isRunning(deps: WorkerDeps, container: string): Promise<boolean> {
  const r = await deps.runner.docker.run(['inspect', '--format', '{{.State.Running}}', container], {
    maxStdoutBytes: 64,
    wallMs: 30_000,
  });
  if (r.code !== 0 && !/No such (object|container)/i.test(r.stderr)) {
    throw new InfraError(`docker inspect lỗi: ${r.stderr.slice(0, 300)}`);
  }
  return r.code === 0 && r.stdout.toString('utf8').trim() === 'true';
}

/** Container còn sạch: còn chạy, và chỉ có docker-init + sleep. */
async function isClean(deps: WorkerDeps, container: string): Promise<boolean> {
  const r = await deps.runner.docker.run(['top', container], { maxStdoutBytes: 64 * 1024, wallMs: 30_000 });
  if (r.code !== 0) {
    if (await isRunning(deps, container)) throw new InfraError(`docker top lỗi: ${r.stderr.slice(0, 300)}`);
    return false;
  }
  const rows = r.stdout.toString('utf8').split('\n').filter((l) => l.trim() !== '');
  return rows.length - 1 <= EXPECTED_PROCESSES;
}

async function sample(
  deps: WorkerDeps,
  job: MeasureJob,
  p: Running,
  stdin: Buffer | null,
): Promise<Pick<MeasureSample, 'status' | 'innerNs' | 'outerNs' | 'checksum'>> {
  const nonce = randomBytes(8).toString('hex');
  const command = timeoutCommand(job.limits.wallMsPerCase, timedCommand(job.language, job.timingMode, stdin === null ? null : p.entry));
  const r = await deps.runner.docker.run(
    // Chỉ mã của mẫu: lượt đo không có sanitizer (§3.5), nên không cần ASAN_OPTIONS.
    execArgs({ container: p.container, env: { CINE_TIMING_NONCE: nonce }, command }),
    { stdin: stdin ?? undefined, maxStdoutBytes: MAX_TIMED_STDOUT, wallMs: job.limits.wallMsPerCase + DOCKER_SLACK_MS },
  );
  if (r.wallTimedOut) throw new InfraError('docker exec không trả lời trong hạn');
  if (isDockerFailure(r.code, r.stderr)) {
    if (!(await isRunning(deps, p.container))) throw new ContainerGone();
    throw new InfraError(`docker exec lỗi: ${r.stderr.slice(0, 300)}`);
  }
  const c = classifyExit({
    exitCode: r.code,
    oomKilled: null, // docker exec: không có cờ OOM theo từng lần chạy
    outputTruncated: r.stdoutTruncated,
    language: job.language,
    elapsedMs: Number(r.ns / 1_000_000n),
    wallMs: job.limits.wallMsPerCase,
  });
  const timing = c.status === 'ran' ? parseTiming(r.stderr, nonce) : null;
  const stdoutChecksum = job.timingMode === 'process' ? r.stdout.toString('utf8').trim().slice(0, 64) || null : null;
  return {
    status: c.status === 'ran' ? 'ok' : c.status,
    innerNs: timing?.ns ?? null,
    outerNs: Number(r.ns),
    checksum: timing?.checksum ?? stdoutChecksum,
  };
}

/**
 * Job đo (spec §3.1, §3.5). Trả MẪU THÔ — khớp độ phức tạp là việc của bước 4.
 * Khác job kiểm: mỗi chương trình giữ MỘT container suốt job, vì khởi động
 * container mỗi mẫu nhét nhiễu của Docker vào đúng phép đo.
 */
export async function handleMeasure(raw: unknown, deps: WorkerDeps, slot: string | null): Promise<MeasureResult> {
  const parsed = measureJob.safeParse(raw);
  if (!parsed.success) {
    return unavailableMeasure(jobIdOf(raw), `job sai schema: ${parsed.error.issues[0]?.message ?? 'không rõ'}`, deps.host);
  }
  const job = parsed.data;
  const startedAt = new Date().toISOString();
  const base = {
    contract: SANDBOX_CONTRACT_VERSION,
    kind: 'measure' as const,
    jobId: job.jobId,
    host: deps.host,
    slot,
    timingMode: job.timingMode,
    startedAt,
  };
  const dir = await mkdtemp(join(deps.workRoot, 'measure-'));
  const containers: string[] = [];
  try {
    await chmod(dir, 0o755);
    const programs: { who: Who; spec: ProgramSpec }[] = [
      { who: 'submission', spec: job.submission },
      ...(job.reference ? [{ who: 'reference' as const, spec: job.reference }] : []),
    ];
    const compiled: Partial<Record<Who, CompileInfo>> = {};
    const running: Running[] = [];
    for (const p of programs) {
      const src = join(dir, `${p.who}-src`);
      const bin = join(dir, `${p.who}-bin`);
      const { entry } = await writeProgram(src, job.language, p.spec, deps.runner.fetchPolicy);
      const info = await compile(deps.runner, { language: job.language, srcDir: src, outDir: bin, sanitize: false, cpuset: slot });
      compiled[p.who] = info;
      if (!info.ok) {
        if (p.who === 'reference') throw new InfraError('đáp án mẫu không biên dịch được — lỗi của gói chấm, không phải của bài');
        return {
          ...base,
          compile: { submission: info, reference: null },
          baseline: [],
          samples: [],
          aborted: 'compile_error',
          finishedAt: new Date().toISOString(),
          unavailable: null,
        };
      }
      const name = containerName();
      containers.push(name);
      await startContainer(deps, job, name, job.language === 'cpp' ? bin : src, slot);
      running.push({ who: p.who, container: name, entry });
    }

    const inputs = await Promise.all(job.points.map((pt) => materialize(pt.stdin, deps.runner.fetchPolicy)));

    const baseline: MeasureResult['baseline'] = [];
    for (const p of running) {
      for (let i = 0; i < BASELINE_RUNS; i++) {
        const s = await sample(deps, job, p, null);
        baseline.push({ program: p.who, innerNs: s.innerNs, outerNs: s.outerNs });
      }
    }

    const samples: MeasureSample[] = [];
    let aborted: 'interference' | null = null;
    measuring: for (let r = 0; r < job.repeats; r++) {
      for (const [i, point] of job.points.entries()) {
        const order = r % 2 === 0 ? running : [...running].reverse();
        for (const p of order) {
          let s: Awaited<ReturnType<typeof sample>>;
          try {
            s = await sample(deps, job, p, inputs[i]);
          } catch (error) {
            if (error instanceof ContainerGone && p.who === 'submission') {
              aborted = 'interference';
              break measuring;
            }
            throw error instanceof ContainerGone ? new InfraError('container của đáp án mẫu chết giữa chừng') : error;
          }
          samples.push({ program: p.who, n: point.n, repeat: r, ...s });
          if (!(await isClean(deps, p.container))) {
            if (p.who === 'reference') throw new InfraError('đáp án mẫu để lại tiến trình nền — lỗi của gói chấm');
            aborted = 'interference';
            break measuring;
          }
        }
      }
    }

    return {
      ...base,
      compile: { submission: compiled.submission!, reference: compiled.reference ?? null },
      baseline,
      samples,
      aborted,
      finishedAt: new Date().toISOString(),
      unavailable: null,
    };
  } catch (error) {
    return { ...unavailableMeasure(job.jobId, describeError(error), deps.host), slot, timingMode: job.timingMode, startedAt };
  } finally {
    for (const c of containers) await removeContainer(deps.runner.docker, c);
    await rm(dir, { recursive: true, force: true });
  }
}

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
import { execArgs, GUARD_UID, runArgs, SANDBOX_UID, timeoutCommand } from './docker-args';
import { materialize } from './fetch-files';
import { describeError, jobIdOf, WorkerDeps } from './handle-exec';
import { compile, containerName, DOCKER_SLACK_MS, InfraError, removeContainer, RunnerEnv, writeProgram } from './programs';
import { cpusetSize } from './slots';

const MiB = 1024 * 1024;
export const BASELINE_RUNS = 5;
/** docker-init (PID 1, do `--init`) + `sleep infinity`. Hơn thế là tiến trình nền của bài. */
export const EXPECTED_PROCESSES = 2;
const MAX_TIMED_STDOUT = 64 * 1024;
const GUARD_USER = `${GUARD_UID}:${GUARD_UID}`;
const SANDBOX_USER = `${SANDBOX_UID}:${SANDBOX_UID}`;

/**
 * Đối tượng IPC sống qua các lần `docker exec` trong cùng một container, kể cả
 * khi đã `--read-only`, bỏ `/tmp` và `--ipc none`: SysV shm/msg/sem (kernel giữ
 * theo namespace IPC) và hàng đợi POSIX ở `/dev/mqueue` (Docker luôn mount, 1777).
 * Đã thử trên Docker 26 + runc: `ipcmk -M` và `touch /dev/mqueue/q` ở lượt exec
 * này vẫn thấy ở lượt sau (review C1). Chạy bằng uid canh; `|| exit` để một file
 * thiếu không bị che bởi mã thoát của lệnh cuối.
 */
const IPC_CHECK = [
  '/bin/sh',
  '-c',
  'cat /proc/sysvipc/shm /proc/sysvipc/msg /proc/sysvipc/sem || exit 3; echo @@; ls -A /dev/mqueue || exit 4',
];

/**
 * Đọc đầu ra của `IPC_CHECK`. Phải thấy đủ ba dòng tiêu đề mới kết luận: thiếu
 * một là không kiểm được (vd runtime không có /proc/sysvipc) — `unknown`, và
 * người gọi KHÔNG được coi là sạch.
 */
export function ipcState(out: string): 'clean' | 'dirty' | 'unknown' {
  const at = out.indexOf('@@');
  if (at < 0) return 'unknown';
  const lines = (s: string) => s.split('\n').map((l) => l.trim()).filter(Boolean);
  const sysv = lines(out.slice(0, at));
  const heads = sysv.filter((l) => /^key\s+(shmid|msqid|semid)\b/.test(l));
  if (heads.length !== 3) return 'unknown';
  return sysv.length > heads.length || lines(out.slice(at + 2)).length > 0 ? 'dirty' : 'clean';
}

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

/** Nhãn khe của mọi container một job đo tạo ra — để kiểm và dọn theo khe (review I4). */
const slotLabel = (slot: string | null) => slot ?? 'unpinned';

/**
 * Trước khi đo: không còn container nào của khe này (job trước rò, worker
 * chết giữa job). SlotPool bảo đảm mỗi khe một job, và máy chỉ có một tiến
 * trình worker (§3.5), nên container nào mang nhãn khe lúc này cũng là rác.
 */
async function ensureSlotFree(runner: RunnerEnv, slot: string | null): Promise<void> {
  const list = async () => {
    const r = await runner.docker.run(['ps', '-aq', '--filter', `label=cine.slot=${slotLabel(slot)}`], {
      maxStdoutBytes: 64 * 1024,
      wallMs: 30_000,
    });
    if (r.code !== 0) throw new InfraError(`docker ps lỗi: ${r.stderr.slice(0, 300)}`);
    return r.stdout.toString('utf8').split('\n').map((s) => s.trim()).filter(Boolean);
  };
  const stale = await list();
  if (stale.length === 0) return;
  for (const id of stale) await removeContainer({ docker: runner.docker }, id);
  const still = await list();
  if (still.length > 0) {
    throw new InfraError(`khe ${slotLabel(slot)} còn container sót (${still.join(', ')}) — không đo trên một khe bẩn`);
  }
}

/**
 * Container giữ suốt job, nên KHÔNG được giữ trạng thái giữa các mẫu (review
 * C1): không `/tmp` ghi được, không `/dev/shm`; init và `sleep` chạy bằng uid
 * canh, mẫu đo bằng uid của bài — bài không kill, không ptrace được chúng. IPC
 * còn lại (SysV, mqueue) thì `isClean` kiểm sau mỗi mẫu.
 */
async function startContainer(
  runner: RunnerEnv,
  job: MeasureJob,
  name: string,
  workDir: string,
  slot: string | null,
) {
  const args = runArgs({
    name,
    image: runner.images[job.language],
    hardening: {
      runtime: runner.runtime,
      cpuset: slot,
      cpus: slot ? cpusetSize(slot) : 1,
      memoryMb: job.limits.memoryMb,
      pids: job.limits.pids,
      fsizeBytes: 64 * MiB,
      user: GUARD_USER,
      tmpfs: false,
      ipcNone: true,
      labels: { 'cine.slot': slotLabel(slot) },
    },
    mounts: [{ source: workDir, target: '/work', readonly: true }],
    env: {},
    interactive: false,
    detach: true,
    command: ['sleep', 'infinity'],
  });
  const r = await runner.docker.run(args, { maxStdoutBytes: 4_096, wallMs: 60_000 });
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

/**
 * Container còn sạch: còn chạy, chỉ có docker-init + sleep, và không còn đối
 * tượng IPC nào — thứ duy nhất mẫu trước còn để lại được cho mẫu sau (review C1).
 */
async function isClean(deps: WorkerDeps, container: string): Promise<boolean> {
  const r = await deps.runner.docker.run(['top', container], { maxStdoutBytes: 64 * 1024, wallMs: 30_000 });
  if (r.code !== 0) {
    if (await isRunning(deps, container)) throw new InfraError(`docker top lỗi: ${r.stderr.slice(0, 300)}`);
    return false;
  }
  const rows = r.stdout.toString('utf8').split('\n').filter((l) => l.trim() !== '');
  if (rows.length - 1 > EXPECTED_PROCESSES) return false;

  const ipc = await deps.runner.docker.run(['exec', '--user', GUARD_USER, container, ...IPC_CHECK], {
    maxStdoutBytes: 64 * 1024,
    wallMs: 30_000,
  });
  if (ipc.code !== 0) {
    if (!(await isRunning(deps, container))) return false;
    throw new InfraError(`không kiểm được trạng thái IPC của container đo: ${ipc.stderr.slice(0, 300)}`);
  }
  const state = ipcState(ipc.stdout.toString('utf8'));
  if (state === 'unknown') throw new InfraError('không đọc được trạng thái IPC của container đo — không coi là sạch');
  return state === 'clean';
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
    execArgs({ container: p.container, env: { CINE_TIMING_NONCE: nonce }, user: SANDBOX_USER, command }),
    { stdin: stdin ?? undefined, maxStdoutBytes: MAX_TIMED_STDOUT, wallMs: job.limits.wallMsPerCase + DOCKER_SLACK_MS },
  );
  if (r.wallTimedOut) throw new InfraError('docker exec không trả lời trong hạn');
  if (isDockerFailure(r.code, r.stderr)) {
    if (!(await isRunning(deps, p.container))) throw new ContainerGone();
    // stderr lẫn stderr của bài (review I1): bài tự in lời của daemon rồi thoát
    // 125 thì một lệnh thử vẫn chạy được — mã đó là của bài, không của docker.
    const probe = await deps.runner.docker.run(['exec', p.container, 'true'], { maxStdoutBytes: 1_024, wallMs: 30_000 });
    if (probe.code !== 0) throw new InfraError(`docker exec lỗi: ${r.stderr.slice(0, 300)}`);
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
  const now = deps.now ?? Date.now;
  const t0 = now();
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
  const leaked: string[] = [];
  const runner: RunnerEnv = { ...deps.runner, onLeak: (name) => leaked.push(name) };
  const dir = await mkdtemp(join(deps.workRoot, 'measure-'));
  const containers: string[] = [];
  try {
    await chmod(dir, 0o755);
    await ensureSlotFree(runner, slot);
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
      const info = await compile(runner, {
        language: job.language,
        srcDir: src,
        outDir: bin,
        sanitize: false,
        cpuset: slot,
        labels: { 'cine.slot': slotLabel(slot) },
      });
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
      await startContainer(runner, job, name, job.language === 'cpp' ? bin : src, slot);
      running.push({ who: p.who, container: name, entry });
    }

    const inputs = await Promise.all(job.points.map((pt) => materialize(pt.stdin, deps.runner.fetchPolicy)));

    // Hết ngân sách con thì trả các mẫu đã đo, `aborted: 'budget'` (§3.1 chốt 4):
    // bước 4 kết luận inconclusive thay vì client bỏ cuộc và vứt hết mẫu (review I3).
    const overBudget = () => now() - t0 > job.budgetMs;
    let aborted: 'interference' | 'budget' | null = null;

    const baseline: MeasureResult['baseline'] = [];
    warmup: for (const p of running) {
      for (let i = 0; i < BASELINE_RUNS; i++) {
        if (overBudget()) {
          aborted = 'budget';
          break warmup;
        }
        const s = await sample(deps, job, p, null);
        baseline.push({ program: p.who, innerNs: s.innerNs, outerNs: s.outerNs });
      }
    }

    const samples: MeasureSample[] = [];
    measuring: for (let r = 0; r < job.repeats && aborted === null; r++) {
      for (const [i, point] of job.points.entries()) {
        const order = r % 2 === 0 ? running : [...running].reverse();
        for (const p of order) {
          if (overBudget()) {
            aborted = 'budget';
            break measuring;
          }
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
    for (const c of containers) await removeContainer(runner, c);
    await rm(dir, { recursive: true, force: true });
    if (leaked.length > 0) deps.onLeak?.(leaked);
  }
}

import { randomBytes } from 'node:crypto';
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { CompileInfo, LimitHit, Limits, ProgramSpec, SandboxLanguage } from '../sandbox/contract';
import { classifyExit, isDockerFailure, RunOutcome } from './classify';
import { Mount, Runtime, runArgs, timeoutCommand } from './docker-args';
import { DockerCli } from './docker-cli';
import { FetchPolicy, materialize } from './fetch-files';

const MiB = 1024 * 1024;
export const COMPILE_MS = 60_000;
/** Docker phải trả lời trong trần của ca cộng khoảng này; không thì là lỗi hạ tầng. */
export const DOCKER_SLACK_MS = 20_000;

/** Lỗi không chứng minh được là của bài → job `unavailable` (spec §4.4). */
export class InfraError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InfraError';
  }
}

export interface RunnerEnv {
  docker: DockerCli;
  runtime: Runtime;
  images: Record<SandboxLanguage, string>;
  fetchPolicy: FetchPolicy;
}

export const DRIVER_FILE: Record<SandboxLanguage, string> = {
  cpp: '__cine_driver.cpp',
  python: '__cine_driver.py',
};

export function containerName(): string {
  return `cine-${randomBytes(6).toString('hex')}`;
}

export async function removeContainer(docker: DockerCli, name: string): Promise<void> {
  await docker.run(['rm', '-f', name], { maxStdoutBytes: 1_024, wallMs: 30_000 }).catch(() => undefined);
}

async function oomKilled(docker: DockerCli, name: string): Promise<boolean> {
  const r = await docker.run(['inspect', '--format', '{{.State.OOMKilled}}', name], { maxStdoutBytes: 64, wallMs: 30_000 });
  return r.code === 0 && r.stdout.toString('utf8').trim() === 'true';
}

/**
 * Ghi mã của MỘT chương trình ra `dir`. Chỉ mã bài và driver — không bao giờ
 * input hay output mong đợi của ca nào (spec §3.5 luật 4).
 */
export async function writeProgram(
  dir: string,
  language: SandboxLanguage,
  program: ProgramSpec,
  policy: FetchPolicy,
): Promise<{ entry: string }> {
  await mkdir(dir, { recursive: true });
  await chmod(dir, 0o755);
  for (const file of program.files) {
    const target = join(dir, ...file.path.split('/'));
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, await materialize(file.ref, policy), { mode: 0o644 });
  }
  if (program.driver) {
    await writeFile(join(dir, DRIVER_FILE[language]), await materialize(program.driver, policy), { mode: 0o644 });
  }
  if (language === 'cpp') return { entry: 'a.out' };
  if (program.driver) return { entry: DRIVER_FILE.python };
  const entry = program.entry!;
  if (!program.files.some((f) => f.path === entry)) {
    throw new InfraError(`entry ${entry} không có trong bài nộp — job dựng sai`);
  }
  return { entry };
}

/**
 * C++: g++ vào `outDir/a.out`. Python: chỉ parse (`check_syntax.py`) — thư mục
 * bài chỉ đọc nên không ghi được .pyc, và cũng không cần.
 *
 * Tên file đã qua `safePath` của hợp đồng (không khoảng trắng, không ký tự
 * shell), nên `sh -c` với `$(find …)` ở đây không tách sai được.
 */
export async function compile(
  env: RunnerEnv,
  p: { language: SandboxLanguage; srcDir: string; outDir: string; sanitize: boolean; cpuset: string | null },
): Promise<CompileInfo> {
  const started = Date.now();
  const name = containerName();
  let script: string;
  const mounts: Mount[] = [{ source: p.srcDir, target: '/src', readonly: true }];
  if (p.language === 'cpp') {
    await mkdir(p.outDir, { recursive: true });
    // uid 1000 trong container phải ghi được a.out vào đây (Review Focus 5).
    await chmod(p.outDir, 0o777);
    mounts.push({ source: p.outDir, target: '/out', readonly: false });
    const flags = ['-std=c++17', '-O2', ...(p.sanitize ? ['-fsanitize=address,undefined', '-fno-sanitize-recover=all'] : [])];
    script = `g++ ${flags.join(' ')} -I/src -o /out/a.out $(find /src -name '*.cpp' | sort)`;
  } else {
    script = "find /src -name '*.py' | sort | xargs -r python3 /opt/cine/check_syntax.py";
  }
  const args = runArgs({
    name,
    image: env.images[p.language],
    hardening: { runtime: env.runtime, cpuset: p.cpuset, cpus: 1, memoryMb: 1_536, pids: 128, fsizeBytes: 256 * MiB },
    mounts,
    env: {},
    interactive: false,
    detach: false,
    command: timeoutCommand(COMPILE_MS, ['sh', '-c', script]),
  });
  try {
    const r = await env.docker.run(args, { maxStdoutBytes: 64 * 1_024, wallMs: COMPILE_MS + DOCKER_SLACK_MS });
    if (r.wallTimedOut) throw new InfraError('docker không trả lời trong hạn biên dịch');
    if (isDockerFailure(r.code, r.stderr)) throw new InfraError(`docker lỗi khi biên dịch: ${r.stderr.slice(0, 300)}`);
    const log = r.code === 124 ? 'biên dịch quá 60 giây' : `${r.stdout.toString('utf8')}${r.stderr}`;
    return { ok: r.code === 0, log: log.slice(0, 16_384), ms: Date.now() - started };
  } finally {
    await removeContainer(env.docker, name);
  }
}

/**
 * Chạy MỘT ca trong một container MỚI (spec §3.5 luật 5). Input qua stdin,
 * không bao giờ qua mount. Trần thời gian đặt trong container (`timeout`);
 * trần của worker chỉ bắt docker treo.
 */
export async function runCase(
  env: RunnerEnv,
  p: {
    language: SandboxLanguage;
    workDir: string;
    entry: string;
    stdin: Buffer;
    limits: Limits;
    sanitize: boolean;
    cpuset: string | null;
  },
): Promise<{ status: RunOutcome; stdout: Buffer; ms: number; limitsHit: LimitHit[] }> {
  const name = containerName();
  // ASan ăn RAM gấp 2–3 lần (§3.5): lượt có sanitizer có trần riêng.
  const memoryMb = p.sanitize ? Math.min(p.limits.memoryMb * 3, 2_048) : p.limits.memoryMb;
  const target =
    p.language === 'cpp' ? ['/work/a.out'] : ['python3', '/opt/cine/cine_run.py', `/work/${p.entry}`];
  const args = runArgs({
    name,
    image: env.images[p.language],
    hardening: { runtime: env.runtime, cpuset: p.cpuset, cpus: 1, memoryMb, pids: p.limits.pids, fsizeBytes: 64 * MiB },
    mounts: [{ source: p.workDir, target: '/work', readonly: true }],
    env: { ASAN_OPTIONS: 'detect_leaks=0', UBSAN_OPTIONS: 'print_stacktrace=0' },
    interactive: true,
    detach: false,
    command: timeoutCommand(p.limits.wallMsPerCase, target),
  });
  try {
    const r = await env.docker.run(args, {
      stdin: p.stdin,
      maxStdoutBytes: p.limits.outputBytes,
      wallMs: p.limits.wallMsPerCase + DOCKER_SLACK_MS,
      onStdoutCap: () => void env.docker.run(['kill', name], { maxStdoutBytes: 64, wallMs: 30_000 }).catch(() => undefined),
    });
    if (r.wallTimedOut) throw new InfraError('docker không trả lời trong hạn của ca');
    if (isDockerFailure(r.code, r.stderr)) throw new InfraError(`docker lỗi: ${r.stderr.slice(0, 300)}`);
    const ms = Number(r.ns / 1_000_000n);
    const c = classifyExit({
      exitCode: r.code,
      oomKilled: await oomKilled(env.docker, name),
      outputTruncated: r.stdoutTruncated,
      language: p.language,
      elapsedMs: ms,
      wallMs: p.limits.wallMsPerCase,
    });
    return { ...c, stdout: r.stdout, ms };
  } finally {
    await removeContainer(env.docker, name);
  }
}

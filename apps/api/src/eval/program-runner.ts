import { spawn } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cppCompileFlags } from '../sandbox/contract';

export type RunStatus = 'ok' | 'timeout' | 'runtime_crash' | 'output_limit';
export interface CaseRun {
  key: string;
  status: RunStatus;
  stdout: string;
}
export type ProgramRunResult =
  | { compiled: true; cases: CaseRun[] }
  | { compiled: false; compileLog: string };
export interface ProgramInput {
  driver: string;
  source: string;
  cases: { key: string; input: string }[];
}
export interface ProgramRunner {
  run(input: ProgramInput): Promise<ProgramRunResult>;
}

export class DockerUnavailableError extends Error {
  constructor(detail: string) {
    super(`Docker không chạy — bật Docker Desktop rồi chạy lại. (${detail})`);
    this.name = 'DockerUnavailableError';
  }
}

/** So khớp output không được phụ thuộc CRLF hay khoảng trắng cuối dòng. */
export function normalizeOutput(s: string): string {
  return s
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trimEnd();
}

export function statusFromExitCode(code: number): RunStatus {
  if (code === 0) return 'ok';
  if (code === 124) return 'timeout';
  if (code === 153) return 'output_limit'; // 128 + SIGXFSZ(25): vượt `ulimit -f`
  return 'runtime_crash';
}

const OUTPUT_LIMIT_BLOCKS = 2048; // `ulimit -f` của dash tính theo khối 512 byte → 1 MB

export function buildRunScript(wallSecondsPerCase = 2): string {
  return [
    '#!/bin/sh',
    'set -u',
    'cd /w',
    // Cùng MỘT hằng số cờ với worker sandbox (duyệt Q5): output mong đợi sinh ở đây phải khớp
    // output mà worker thấy từ một bài đúng.
    `if ! g++ ${cppCompileFlags(true).join(' ')} \\`,
    '     -o /tmp/a src/driver.cpp src/main.cpp 2> out/compile.err; then',
    '  echo compile_error > out/status',
    '  exit 0',
    'fi',
    'echo ok > out/status',
    'export ASAN_OPTIONS=detect_leaks=0',
    `ulimit -f ${OUTPUT_LIMIT_BLOCKS}`,
    'for f in in/*.txt; do',
    '  [ -e "$f" ] || continue',
    '  k=$(basename "$f" .txt)',
    `  timeout -k 1 ${wallSecondsPerCase} /tmp/a < "$f" > "out/$k.out" 2> "out/$k.err"`,
    '  echo $? > "out/$k.rc"',
    'done',
    '',
  ].join('\n');
}

function exec(bin: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code: code ?? -1, stdout, stderr }));
  });
}

/** Id (sha256:…) của một image local; null khi không có hoặc Docker không chạy. */
export async function dockerImageId(image: string, dockerBin = 'docker'): Promise<string | null> {
  try {
    const r = await exec(dockerBin, ['image', 'inspect', image, '--format', '{{.Id}}']);
    return r.code === 0 ? r.stdout.trim() : null;
  } catch {
    return null;
  }
}

/**
 * Chạy MỘT chương trình (driver + bài) trên nhiều ca, trong một container
 * dùng một lần. Biên dịch một lần, mỗi ca một tiến trình có `timeout`.
 *
 * Chỉ dùng cho `eval:check` trên máy dev — mã trong fixture do đội tự viết.
 * Sandbox production (spec 2026-09-20 §3.5) là thứ khác hẳn, ở bước 1.
 */
export class DockerProgramRunner implements ProgramRunner {
  private readonly image: string;
  private readonly wall: number;
  private readonly dockerBin: string;

  constructor(opts: { image?: string; wallSecondsPerCase?: number; dockerBin?: string } = {}) {
    this.image = opts.image ?? 'gcc:13';
    this.wall = opts.wallSecondsPerCase ?? 2;
    this.dockerBin = opts.dockerBin ?? 'docker';
  }

  private async assertDocker(): Promise<void> {
    try {
      const r = await exec(this.dockerBin, ['version', '--format', '{{.Server.Version}}']);
      if (r.code !== 0) throw new DockerUnavailableError(r.stderr.trim().split('\n')[0] ?? '');
    } catch (error) {
      if (error instanceof DockerUnavailableError) throw error;
      throw new DockerUnavailableError(error instanceof Error ? error.message : String(error));
    }
  }

  async run(input: ProgramInput): Promise<ProgramRunResult> {
    await this.assertDocker();
    const dir = await mkdtemp(join(tmpdir(), 'cine-eval-'));
    try {
      // `mkdtemp` tạo thư mục 0700. Image `cine-sandbox-cpp:1` chạy bằng uid 64000 chứ không phải
      // root như `gcc:13`, nên phải đọc được thư mục làm việc (duyệt Q5: sinh bằng image của worker).
      await chmod(dir, 0o755);
      await mkdir(join(dir, 'src'));
      await mkdir(join(dir, 'in'));
      await mkdir(join(dir, 'out'));
      await chmod(join(dir, 'out'), 0o777);
      await writeFile(join(dir, 'src', 'driver.cpp'), input.driver);
      await writeFile(join(dir, 'src', 'main.cpp'), input.source);
      for (const c of input.cases) {
        await writeFile(join(dir, 'in', `${c.key}.txt`), c.input);
      }
      await writeFile(join(dir, 'run.sh'), buildRunScript(this.wall));

      const r = await exec(this.dockerBin, [
        'run', '--rm', '--network', 'none',
        '--memory', '1g', '--pids-limit', '256', '--cpus', '1',
        '--mount', `type=bind,source=${dir},target=/w`,
        this.image, 'sh', '/w/run.sh',
      ]);
      if (r.code !== 0) {
        throw new Error(`container thoát với mã ${r.code}: ${r.stderr.slice(0, 500)}`);
      }

      const status = (await readFile(join(dir, 'out', 'status'), 'utf8')).trim();
      if (status === 'compile_error') {
        return { compiled: false, compileLog: await readFile(join(dir, 'out', 'compile.err'), 'utf8') };
      }
      const present = new Set(await readdir(join(dir, 'out')));
      const cases: CaseRun[] = [];
      for (const c of input.cases) {
        const rc = present.has(`${c.key}.rc`)
          ? Number((await readFile(join(dir, 'out', `${c.key}.rc`), 'utf8')).trim())
          : -1;
        const stdout = present.has(`${c.key}.out`)
          ? await readFile(join(dir, 'out', `${c.key}.out`), 'utf8')
          : '';
        cases.push({ key: c.key, status: statusFromExitCode(rc), stdout });
      }
      return { compiled: true, cases };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}

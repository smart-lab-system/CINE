import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnCli, type DockerCli } from '../sandbox-worker/docker-cli';
import { javaMainClass, type ConsoleLanguage } from './entry-scanner';
import {
  PLAYGROUND_LOG_MAX_CHARS,
  PLAYGROUND_MEMORY_MB,
  PLAYGROUND_PIDS,
  PLAYGROUND_WALL_MS,
} from './playground.constants';

export interface ConsoleRunResult {
  compileLog: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  error: string | null;
}

function clip(s: string, max = PLAYGROUND_LOG_MAX_CHARS): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}\n…[đã cắt]`;
}

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/** Locale + I/O UTF-8 — tránh lỗi tiếng Việt khi compile/in (javac/gcc/python). */
const UTF8_ENV = [
  'export LANG=C.UTF-8',
  'export LC_ALL=C.UTF-8',
  'export PYTHONIOENCODING=utf-8',
  'export PYTHONUTF8=1',
].join('\n');

/**
 * Lệnh shell trong container: biên dịch (nếu cần) rồi chạy entry.
 * Workspace mount tại `/work`. Source kỳ vọng UTF-8.
 */
export function buildShellScript(
  language: ConsoleLanguage,
  entryPath: string,
  entryContent: string,
): string {
  const entry = shellQuote(entryPath);
  switch (language) {
    case 'c':
      return [
        'set -e',
        UTF8_ENV,
        'cd /work',
        'mapfile -t SRC < <(find . -type f -name "*.c" | sed "s|^\\./||")',
        'if [ ${#SRC[@]} -eq 0 ]; then echo "không có file .c" >&2; exit 2; fi',
        'if ! gcc -O2 -finput-charset=UTF-8 -fexec-charset=UTF-8 -o /tmp/app "${SRC[@]}" 2>/tmp/compile.log; then cat /tmp/compile.log >&2; exit 1; fi',
        'cat /tmp/compile.log >&2 || true',
        '/tmp/app',
      ].join('\n');
    case 'cpp':
      return [
        'set -e',
        UTF8_ENV,
        'cd /work',
        'mapfile -t SRC < <(find . -type f \\( -name "*.cpp" -o -name "*.cc" -o -name "*.cxx" \\) | sed "s|^\\./||")',
        'if [ ${#SRC[@]} -eq 0 ]; then echo "không có file C++" >&2; exit 2; fi',
        'if ! g++ -O2 -std=c++17 -finput-charset=UTF-8 -fexec-charset=UTF-8 -o /tmp/app "${SRC[@]}" 2>/tmp/compile.log; then cat /tmp/compile.log >&2; exit 1; fi',
        'cat /tmp/compile.log >&2 || true',
        '/tmp/app',
      ].join('\n');
    case 'java': {
      const mainClass = javaMainClass(entryPath, entryContent);
      return [
        'set -e',
        UTF8_ENV,
        'cd /work',
        'mapfile -t SRC < <(find . -type f -name "*.java" | sed "s|^\\./||")',
        'if [ ${#SRC[@]} -eq 0 ]; then echo "không có file .java" >&2; exit 2; fi',
        'mkdir -p /tmp/classes',
        'if ! javac -encoding UTF-8 -d /tmp/classes "${SRC[@]}" 2>/tmp/compile.log; then cat /tmp/compile.log >&2; exit 1; fi',
        'cat /tmp/compile.log >&2 || true',
        `java -Dfile.encoding=UTF-8 -Dstdout.encoding=UTF-8 -Dstderr.encoding=UTF-8 -cp /tmp/classes ${shellQuote(mainClass)}`,
      ].join('\n');
    }
    case 'python':
      return [
        'set -e',
        UTF8_ENV,
        'cd /work',
        `python3 ${entry}`,
      ].join('\n');
    default: {
      const _exhaustive: never = language;
      return _exhaustive;
    }
  }
}

function defaultImage(): string {
  return process.env.PLAYGROUND_CONSOLE_IMAGE ?? 'cine-playground-console:1';
}

export async function runConsoleInDocker(opts: {
  workDir: string;
  language: ConsoleLanguage;
  entryPath: string;
  docker?: DockerCli;
  image?: string;
  wallMs?: number;
}): Promise<ConsoleRunResult> {
  const docker = opts.docker ?? spawnCli();
  const image = opts.image ?? defaultImage();
  const wallMs = opts.wallMs ?? PLAYGROUND_WALL_MS;
  const name = `cine-pg-${randomBytes(6).toString('hex')}`;

  let entryContent = '';
  try {
    entryContent = await readFile(join(opts.workDir, opts.entryPath), 'utf8');
  } catch {
    return {
      compileLog: '',
      stdout: '',
      stderr: '',
      exitCode: null,
      error: `không đọc được file entry: ${opts.entryPath}`,
    };
  }

  const script = buildShellScript(opts.language, opts.entryPath, entryContent);
  // Tách compile log: với C/C++/Java script ghi compile ra stderr trước khi chạy.
  // MVP: toàn bộ stderr trước/sau gộp; client hiện một khối. Phân tách tinh hơn sau.
  const args = [
    'run',
    '--rm',
    '--name',
    name,
    '--network',
    'none',
    '-e',
    'LANG=C.UTF-8',
    '-e',
    'LC_ALL=C.UTF-8',
    '-e',
    'PYTHONIOENCODING=utf-8',
    '-e',
    'PYTHONUTF8=1',
    '--memory',
    `${PLAYGROUND_MEMORY_MB}m`,
    '--memory-swap',
    `${PLAYGROUND_MEMORY_MB}m`,
    '--pids-limit',
    String(PLAYGROUND_PIDS),
    '--cpus',
    '1',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges',
    '-v',
    `${opts.workDir}:/work:ro`,
    '--tmpfs',
    '/tmp:rw,exec,nosuid,size=64m',
    image,
    'bash',
    '-lc',
    script,
  ];

  try {
    const result = await docker.run(args, {
      maxStdoutBytes: PLAYGROUND_LOG_MAX_CHARS,
      wallMs: wallMs + 5_000,
    });

    if (result.wallTimedOut) {
      await docker.run(['rm', '-f', name], { maxStdoutBytes: 256, wallMs: 10_000 }).catch(() => undefined);
      return {
        compileLog: '',
        stdout: clip(result.stdout.toString('utf8')),
        stderr: clip(result.stderr),
        exitCode: null,
        error: `hết thời gian (${wallMs}ms)`,
      };
    }

    // Compile errors thường exit != 0 với stderr — coi là finished với exitCode
    return {
      compileLog: '',
      stdout: clip(result.stdout.toString('utf8')),
      stderr: clip(result.stderr),
      exitCode: result.code,
      error: null,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await docker.run(['rm', '-f', name], { maxStdoutBytes: 256, wallMs: 10_000 }).catch(() => undefined);
    return {
      compileLog: '',
      stdout: '',
      stderr: '',
      exitCode: null,
      error: msg,
    };
  }
}

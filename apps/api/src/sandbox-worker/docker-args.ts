export type Runtime = 'runc' | 'runsc';

export interface Hardening {
  runtime: Runtime;
  cpuset: string | null;
  cpus: number;
  memoryMb: number;
  pids: number;
  fsizeBytes: number;
}

export interface Mount {
  source: string;
  target: string;
  readonly: boolean;
}

/**
 * Cờ siết cho MỌI container chạy mã sinh viên (spec 2026-09-20 §3.5).
 *
 * `--memory-swap` bằng `--memory`: không có thì swap làm trần RAM thành trần
 * RAM + swap, và một bài cấp phát vô hạn chạy chậm dần tới hết giờ thay vì
 * chạm trần — sai lớp kết cục (§4.5).
 */
export function hardenedFlags(h: Hardening): string[] {
  const flags = [
    '--network', 'none',
    '--read-only',
    '--cap-drop', 'ALL',
    '--security-opt', 'no-new-privileges',
    '--pids-limit', String(h.pids),
    '--memory', `${h.memoryMb}m`,
    '--memory-swap', `${h.memoryMb}m`,
    '--cpus', String(h.cpus),
    '--user', '1000:1000',
    '--tmpfs', '/tmp:rw,nosuid,nodev,size=64m',
    '--workdir', '/tmp',
    '--ulimit', `fsize=${h.fsizeBytes}`,
    '--ulimit', 'core=0',
    '--init',
  ];
  if (h.cpuset) flags.push('--cpuset-cpus', h.cpuset);
  if (h.runtime === 'runsc') flags.push('--runtime', 'runsc');
  return flags;
}

export function runArgs(p: {
  name: string;
  image: string;
  hardening: Hardening;
  mounts: Mount[];
  env: Record<string, string>;
  interactive: boolean;
  detach: boolean;
  command: string[];
}): string[] {
  return [
    'run',
    ...(p.interactive ? ['-i'] : []),
    ...(p.detach ? ['-d'] : []),
    '--name', p.name,
    ...hardenedFlags(p.hardening),
    ...p.mounts.flatMap((m) => [
      '--mount',
      `type=bind,source=${m.source},target=${m.target}${m.readonly ? ',readonly' : ''}`,
    ]),
    ...Object.entries(p.env).flatMap(([k, v]) => ['--env', `${k}=${v}`]),
    p.image,
    ...p.command,
  ];
}

export function execArgs(p: { container: string; env: Record<string, string>; command: string[] }): string[] {
  return ['exec', '-i', ...Object.entries(p.env).flatMap(([k, v]) => ['--env', `${k}=${v}`]), p.container, ...p.command];
}

/**
 * Trần thời gian đặt TRONG container: TERM khi hết giờ, KILL sau 1 giây nếu bài
 * chặn TERM. KHÔNG dùng `-s KILL`: khi đó `timeout` giết cả nhóm tiến trình gồm
 * chính nó và trả 137 thay vì 124 — mọi bài hết giờ trông như chạm trần RAM
 * (đo 2026-09-24).
 */
export function timeoutCommand(ms: number, command: string[]): string[] {
  return ['timeout', '-k', '1', (ms / 1000).toFixed(3), ...command];
}

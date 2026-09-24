export type Runtime = 'runc' | 'runsc';

/**
 * uid chạy mã sinh viên. KHÔNG phải 1000: trên VPS Ubuntu đó là `ubuntu` (sudo
 * không mật khẩu), trên Codespaces là `codespace` — một cú thoát giữ nguyên uid
 * sẽ đọc ghi được home của user đó trên host. Máy sandbox phải không có user
 * nào mang uid này (`getent passwd 64000` rỗng).
 */
export const SANDBOX_UID = 64000;
/**
 * uid của tiến trình GIỮ container đo sống (`sleep infinity` sau `--init`).
 * Khác uid của bài để bài không kill, không ptrace được nó giữa các mẫu (§3.5).
 */
export const GUARD_UID = 64001;

export interface Hardening {
  runtime: Runtime;
  cpuset: string | null;
  cpus: number;
  memoryMb: number;
  pids: number;
  fsizeBytes: number;
  /** Mặc định `${SANDBOX_UID}:${SANDBOX_UID}`. */
  user?: string;
  /** `/tmp` ghi được. Mặc định có; container đo thì KHÔNG (review C1). */
  tmpfs?: boolean;
  /** `--ipc none`: không /dev/shm. Container đo bật (review C1). */
  ipcNone?: boolean;
  /** Thêm vào nhãn `cine.sandbox=1` mà mọi container đều có. */
  labels?: Record<string, string>;
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
 *
 * `--log-driver none`: stderr của bài không có trần trong container, và với
 * driver mặc định dockerd ghi HẾT xuống đĩa — một bài in không ngừng làm đầy đĩa
 * máy sandbox. `docker run -i` vẫn attach được stdout/stderr với driver này.
 *
 * Nhãn `cine.sandbox=1` để worker dọn container sót khi khởi động (review I4).
 */
export function hardenedFlags(h: Hardening): string[] {
  const tmpfs = h.tmpfs ?? true;
  const flags = [
    '--network', 'none',
    '--read-only',
    '--cap-drop', 'ALL',
    '--security-opt', 'no-new-privileges',
    '--pids-limit', String(h.pids),
    '--memory', `${h.memoryMb}m`,
    '--memory-swap', `${h.memoryMb}m`,
    '--cpus', String(h.cpus),
    '--user', h.user ?? `${SANDBOX_UID}:${SANDBOX_UID}`,
    ...(tmpfs ? ['--tmpfs', '/tmp:rw,nosuid,nodev,size=64m', '--workdir', '/tmp'] : ['--workdir', '/work']),
    ...(h.ipcNone ? ['--ipc', 'none'] : []),
    '--ulimit', `fsize=${h.fsizeBytes}`,
    '--ulimit', 'core=0',
    '--init',
    '--log-driver', 'none',
    '--label', 'cine.sandbox=1',
    ...Object.entries(h.labels ?? {}).flatMap(([k, v]) => ['--label', `${k}=${v}`]),
  ];
  if (h.cpuset) flags.push('--cpuset-cpus', h.cpuset);
  // Tường minh cả runc: daemon có `default-runtime` khác thì dấu vân tay (T-ISO-5)
  // nói runc trong khi container chạy thứ khác (review M2).
  flags.push('--runtime', h.runtime);
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
    // Không bao giờ kéo image: chạy đúng image đã ghi trong dấu vân tay (review M2).
    '--pull', 'never',
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

export function execArgs(p: { container: string; env: Record<string, string>; user?: string; command: string[] }): string[] {
  return [
    'exec',
    '-i',
    ...(p.user ? ['--user', p.user] : []),
    ...Object.entries(p.env).flatMap(([k, v]) => ['--env', `${k}=${v}`]),
    p.container,
    ...p.command,
  ];
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

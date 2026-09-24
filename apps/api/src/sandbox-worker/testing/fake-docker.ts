import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { HostFingerprint } from '../../sandbox/contract';
import { CliOptions, CliResult, DockerCli } from '../docker-cli';
import { WorkerDeps } from '../handle-exec';

export interface FakeCall {
  args: string[];
  stdin: Buffer | undefined;
  /** Mọi file container NÀY sẽ thấy qua mount, chụp đúng lúc gọi: `<target>/<đường dẫn>` → nội dung. */
  mounted: Record<string, string>;
}
export type FakeRule = (call: FakeCall) => Partial<CliResult> | undefined;

function snapshot(dir: string, target: string, into: Record<string, string>) {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of names) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) snapshot(path, target, into);
    else into[`${target}/${relative(dir, path).replace(/\\/g, '/')}`] = readFileSync(path, 'utf8');
  }
}

export function mountSource(c: FakeCall, target: string): string | null {
  for (let i = 0; i < c.args.length - 1; i++) {
    if (c.args[i] !== '--mount') continue;
    const fields = Object.fromEntries(c.args[i + 1].split(',').map((kv) => kv.split('=') as [string, string]));
    if (fields.target === target) return fields.source;
  }
  return null;
}

/**
 * Đầu ra thật của lệnh kiểm trạng thái IPC trên một container sạch (đo trên
 * Docker 26, runc): ba dòng tiêu đề của /proc/sysvipc, rồi `@@`, rồi /dev/mqueue rỗng.
 */
export const CLEAN_IPC =
  '       key      shmid perms                  size  cpid  lpid nattch   uid   gid  cuid  cgid      atime      dtime      ctime                   rss                  swap\n' +
  '       key      msqid perms      cbytes       qnum lspid lrpid   uid   gid  cuid  cgid      stime      rtime      ctime\n' +
  '       key      semid perms      nsems   uid   gid  cuid  cgid      otime      ctime\n' +
  '@@\n';

/**
 * Docker giả: ghi lại mọi lời gọi, trả lời theo luật đầu tiên khớp. Không luật
 * nào khớp → mã 0, rỗng; riêng lệnh kiểm IPC thì trả `CLEAN_IPC`.
 */
export class FakeDocker implements DockerCli {
  readonly calls: FakeCall[] = [];
  constructor(
    private readonly rules: FakeRule[],
    private readonly opts: { throwOnFirst?: Error } = {},
  ) {}

  async run(args: string[], opts: CliOptions): Promise<CliResult> {
    if (this.opts.throwOnFirst && this.calls.length === 0) {
      this.calls.push({ args, stdin: opts.stdin, mounted: {} });
      throw this.opts.throwOnFirst;
    }
    const mounted: Record<string, string> = {};
    for (let i = 0; i < args.length - 1; i++) {
      if (args[i] !== '--mount') continue;
      const fields = Object.fromEntries(args[i + 1].split(',').map((kv) => kv.split('=') as [string, string]));
      snapshot(fields.source, fields.target, mounted);
    }
    const call = { args, stdin: opts.stdin, mounted };
    this.calls.push(call);
    for (const rule of this.rules) {
      const r = rule(call);
      if (r) {
        return { code: 0, stdout: Buffer.alloc(0), stderr: '', stdoutTruncated: false, wallTimedOut: false, ns: 1_000_000n, ...r };
      }
    }
    const stdout = isStateCheck(call) ? Buffer.from(CLEAN_IPC) : Buffer.alloc(0);
    return { code: 0, stdout, stderr: '', stdoutTruncated: false, wallTimedOut: false, ns: 1_000_000n };
  }
}

const text = (c: FakeCall) => c.args.join(' ');
export const isCompile = (c: FakeCall) => c.args[0] === 'run' && /g\+\+ |check_syntax\.py/.test(text(c));
export const isCase = (c: FakeCall) => c.args[0] === 'run' && c.args.includes('-i');
export const isDetachedRun = (c: FakeCall) => c.args[0] === 'run' && c.args.includes('-d');
/** Lệnh của worker kiểm trạng thái IPC còn sót trong container đo (review C1). */
export const isStateCheck = (c: FakeCall) => c.args[0] === 'exec' && text(c).includes('/proc/sysvipc/');
/** Lệnh thử `docker exec <c> true` khi nghi docker lỗi (review I1). */
export const isProbe = (c: FakeCall) => c.args[0] === 'exec' && c.args[c.args.length - 1] === 'true';
/** Một lượt chạy mẫu đo (baseline hoặc có input) — không gồm lệnh kiểm hay lệnh thử của worker. */
export const isExec = (c: FakeCall) => c.args[0] === 'exec' && !isStateCheck(c) && !isProbe(c);
export const isPs = (c: FakeCall) => c.args[0] === 'ps';
export const isTop = (c: FakeCall) => c.args[0] === 'top';

export function envOf(c: FakeCall, key: string): string | null {
  for (let i = 0; i < c.args.length - 1; i++) {
    if (c.args[i] === '--env' && c.args[i + 1].startsWith(`${key}=`)) return c.args[i + 1].slice(key.length + 1);
  }
  return null;
}

export const TEST_HOST: HostFingerprint = {
  hostname: 'test', cpuModel: 'test', cpuCount: 4, kernel: 'test', runtime: 'runc',
  dockerVersion: 'test', images: { cpp: 'sha256:cpp', python: 'sha256:py' }, workerVersion: 'test',
};

export function testDeps(docker: DockerCli, workRoot: string): WorkerDeps {
  return {
    runner: {
      docker,
      runtime: 'runc',
      images: { cpp: 'cpp-img', python: 'py-img' },
      fetchPolicy: { allowedHosts: [], allowHttp: false, maxBytes: 1_000_000 },
    },
    host: TEST_HOST,
    workRoot,
  };
}

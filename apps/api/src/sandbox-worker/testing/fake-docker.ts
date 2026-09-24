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

/** Docker giả: ghi lại mọi lời gọi, trả lời theo luật đầu tiên khớp. Không luật nào khớp → mã 0, rỗng. */
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
    return { code: 0, stdout: Buffer.alloc(0), stderr: '', stdoutTruncated: false, wallTimedOut: false, ns: 1_000_000n };
  }
}

const text = (c: FakeCall) => c.args.join(' ');
export const isCompile = (c: FakeCall) => c.args[0] === 'run' && /g\+\+ |check_syntax\.py/.test(text(c));
export const isCase = (c: FakeCall) => c.args[0] === 'run' && c.args.includes('-i');
export const isDetachedRun = (c: FakeCall) => c.args[0] === 'run' && c.args.includes('-d');
export const isExec = (c: FakeCall) => c.args[0] === 'exec';
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

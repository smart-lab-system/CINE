import { spawn } from 'node:child_process';

export interface CliResult {
  code: number;
  stdout: Buffer;
  stderr: string;
  stdoutTruncated: boolean;
  wallTimedOut: boolean;
  /** Thời gian đo từ NGOÀI, quanh cả lời gọi CLI. */
  ns: bigint;
}

export interface CliOptions {
  stdin?: Buffer;
  maxStdoutBytes: number;
  wallMs: number;
  /** Gọi đúng một lần khi stdout chạm trần — người gọi giết container ở đây. */
  onStdoutCap?: () => void;
}

export interface DockerCli {
  run(args: string[], opts: CliOptions): Promise<CliResult>;
}

export class DockerUnavailableError extends Error {
  constructor(detail: string) {
    super(`không gọi được docker: ${detail}`);
    this.name = 'DockerUnavailableError';
  }
}

const MAX_STDERR = 64 * 1024;

/**
 * Gọi Docker CLI. Giết tiến trình CLI khi quá trần thời gian KHÔNG giết
 * container — người gọi luôn `docker rm -f` trong `finally`.
 */
export function spawnCli(bin = 'docker'): DockerCli {
  return {
    run(args, opts) {
      return new Promise((resolve, reject) => {
        const started = process.hrtime.bigint();
        const child = spawn(bin, args, { windowsHide: true });
        const chunks: Buffer[] = [];
        let size = 0;
        let truncated = false;
        let stderr = '';
        let timedOut = false;

        const timer = setTimeout(() => {
          timedOut = true;
          child.kill('SIGKILL');
        }, opts.wallMs);

        child.stdout.on('data', (d: Buffer) => {
          if (truncated) return;
          const room = opts.maxStdoutBytes - size;
          if (d.length > room) {
            chunks.push(d.subarray(0, room));
            size += room;
            truncated = true;
            opts.onStdoutCap?.();
            return;
          }
          chunks.push(d);
          size += d.length;
        });
        child.stderr.on('data', (d: Buffer) => {
          if (stderr.length < MAX_STDERR) stderr += d.toString('utf8').slice(0, MAX_STDERR - stderr.length);
        });
        // Bài đóng stdin sớm là chuyện bình thường, không phải lỗi của lời gọi.
        child.stdin.on('error', () => undefined);
        child.on('error', (error) => {
          clearTimeout(timer);
          reject(new DockerUnavailableError(error.message));
        });
        child.on('close', (code) => {
          clearTimeout(timer);
          resolve({
            code: code ?? -1,
            stdout: Buffer.concat(chunks),
            stderr,
            stdoutTruncated: truncated,
            wallTimedOut: timedOut,
            ns: process.hrtime.bigint() - started,
          });
        });

        if (opts.stdin) child.stdin.end(opts.stdin);
        else child.stdin.end();
      });
    },
  };
}

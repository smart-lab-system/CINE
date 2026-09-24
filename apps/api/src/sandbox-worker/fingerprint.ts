import { cpus, hostname, release, type } from 'node:os';
import { HostFingerprint } from '../sandbox/contract';
import { WorkerConfig } from './config';
import { DockerCli, DockerUnavailableError } from './docker-cli';

const opts = { maxStdoutBytes: 64 * 1024, wallMs: 30_000 };

/**
 * Dấu vân tay máy (spec §3.5, T-ISO-5): đổi máy là đo lại `c`, nên mọi kết quả
 * phải nói nó đo ở đâu. Chạy MỘT lần lúc khởi động — image hay runtime đổi
 * giữa chừng thì phải khởi động lại worker, và đó là điều đúng.
 */
export async function readFingerprint(
  docker: DockerCli,
  cfg: Pick<WorkerConfig, 'runtime' | 'images' | 'version'>,
): Promise<HostFingerprint> {
  const version = await docker.run(['version', '--format', '{{.Server.Version}}'], opts);
  if (version.code !== 0) throw new DockerUnavailableError(version.stderr.trim() || `docker version thoát ${version.code}`);

  if (cfg.runtime === 'runsc') {
    const info = await docker.run(['info', '--format', '{{json .Runtimes}}'], opts);
    if (!info.stdout.toString('utf8').includes('"runsc"')) {
      throw new Error('SANDBOX_RUNTIME=runsc nhưng Docker chưa đăng ký runtime runsc — xem docs/deploy/sandbox-worker.md');
    }
  }

  const images: Record<string, string> = {};
  for (const [language, tag] of Object.entries(cfg.images)) {
    const r = await docker.run(['image', 'inspect', '--format', '{{.Id}}', tag], opts);
    if (r.code !== 0) throw new Error(`thiếu image ${tag} — chạy pnpm --filter api sandbox:images`);
    images[language] = r.stdout.toString('utf8').trim();
  }

  const cpuList = cpus();
  return {
    hostname: hostname(),
    cpuModel: cpuList[0]?.model ?? 'unknown',
    cpuCount: cpuList.length || 1,
    kernel: `${type()} ${release()}`,
    runtime: cfg.runtime,
    dockerVersion: version.stdout.toString('utf8').trim(),
    images,
    workerVersion: cfg.version,
  };
}

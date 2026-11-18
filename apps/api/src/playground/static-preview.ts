import { randomBytes } from 'node:crypto';
import { spawnCli, type DockerCli } from '../sandbox-worker/docker-cli';

export interface StaticPreviewStart {
  containerName: string;
  hostPort: number;
  previewUrl: string;
}

function defaultImage(): string {
  return process.env.PLAYGROUND_STATIC_IMAGE ?? 'nginx:alpine';
}

function previewHost(): string {
  return process.env.PLAYGROUND_PREVIEW_HOST ?? '127.0.0.1';
}

async function readPublishedPort(
  docker: DockerCli,
  name: string,
  containerPort: number,
): Promise<number | null> {
  const portOut = await docker.run(['port', name, String(containerPort)], {
    maxStdoutBytes: 1_024,
    wallMs: 10_000,
  });
  const text = `${portOut.stdout.toString('utf8')}\n${portOut.stderr}`;
  const m = text.match(/:(\d+)\s*$/m);
  if (m) return Number(m[1]);

  // Fallback: docker inspect
  const inspect = await docker.run(
    ['inspect', '-f', '{{(index (index .NetworkSettings.Ports "80/tcp") 0).HostPort}}', name],
    { maxStdoutBytes: 256, wallMs: 10_000 },
  );
  const host = inspect.stdout.toString('utf8').trim();
  if (/^\d+$/.test(host)) return Number(host);
  return null;
}

/**
 * Phục vụ thư mục tĩnh bằng nginx, publish cổng trên localhost.
 * `entryPath` relative → URL path (ví dụ html/index.html).
 *
 * Không `--cap-drop ALL`: nginx cần bind :80; drop hết capability làm
 * container thoát ngay → `docker port` báo "no public port '80' published".
 */
export async function startStaticPreview(opts: {
  workDir: string;
  entryPath: string;
  docker?: DockerCli;
  image?: string;
}): Promise<StaticPreviewStart> {
  const docker = opts.docker ?? spawnCli();
  const image = opts.image ?? defaultImage();
  const name = `cine-pg-web-${randomBytes(5).toString('hex')}`;

  const run = await docker.run(
    [
      'run',
      '-d',
      '--name',
      name,
      '--network',
      'bridge',
      // Random host port → container 80 (cú pháp rõ hơn `::80` trên một số Docker Desktop)
      '-p',
      '127.0.0.1:0:80',
      '--memory',
      '128m',
      '--memory-swap',
      '128m',
      '--pids-limit',
      '64',
      '--security-opt',
      'no-new-privileges',
      '-v',
      `${opts.workDir}:/usr/share/nginx/html:ro`,
      image,
    ],
    { maxStdoutBytes: 4_096, wallMs: 60_000 },
  );

  if (run.code !== 0) {
    await docker.run(['rm', '-f', name], { maxStdoutBytes: 256, wallMs: 10_000 }).catch(() => undefined);
    throw new Error(run.stderr || `không start nginx (exit ${run.code})`);
  }

  // Đợi nginx sẵn sàng (tránh race trên Windows)
  for (let i = 0; i < 10; i++) {
    const hostPort = await readPublishedPort(docker, name, 80);
    if (hostPort) {
      const entry = opts.entryPath.replace(/^\/+/, '');
      const previewUrl = `http://${previewHost()}:${hostPort}/${entry}`;
      return { containerName: name, hostPort, previewUrl };
    }
    const ps = await docker.run(['inspect', '-f', '{{.State.Status}} {{.State.ExitCode}}', name], {
      maxStdoutBytes: 256,
      wallMs: 5_000,
    });
    const state = ps.stdout.toString('utf8').trim();
    if (state.startsWith('exited')) {
      const logs = await docker.run(['logs', name], { maxStdoutBytes: 4_096, wallMs: 5_000 });
      await docker.run(['rm', '-f', name], { maxStdoutBytes: 256, wallMs: 10_000 }).catch(() => undefined);
      throw new Error(
        `nginx thoát sớm (${state}): ${logs.stdout.toString('utf8') || logs.stderr}`,
      );
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  await docker.run(['rm', '-f', name], { maxStdoutBytes: 256, wallMs: 10_000 }).catch(() => undefined);
  throw new Error('không đọc được host port sau khi start nginx');
}

export async function stopStaticPreview(
  containerName: string,
  docker?: DockerCli,
): Promise<void> {
  const cli = docker ?? spawnCli();
  await cli.run(['rm', '-f', containerName], { maxStdoutBytes: 256, wallMs: 15_000 }).catch(() => undefined);
}

import { existsSync } from 'node:fs';
import { cp } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnCli, type DockerCli } from '../sandbox-worker/docker-cli';

export interface VitePreviewStart {
  containerName: string;
  imageTag: string;
  hostPort: number;
  previewUrl: string;
}

function previewHost(): string {
  return process.env.PLAYGROUND_PREVIEW_HOST ?? '127.0.0.1';
}

function templateDir(): string {
  const leaf = join('templates', 'vite-react');
  const candidates = [
    join(__dirname, leaf),
    join(__dirname, '..', '..', '..', 'playground', leaf),
    join(process.cwd(), 'src', 'playground', leaf),
    join(process.cwd(), 'dist', 'src', 'playground', leaf),
    join(process.cwd(), 'dist', 'playground', leaf),
  ];
  const found = candidates.find((p) => existsSync(join(p, 'Dockerfile')));
  if (!found) {
    throw new Error(`không tìm thấy vite-react template. Đã thử:\n${candidates.join('\n')}`);
  }
  return found;
}

export async function materializeViteTemplate(workDir: string): Promise<void> {
  const tpl = templateDir();
  await cp(join(tpl, 'Dockerfile'), join(workDir, 'Dockerfile'));
  await cp(join(tpl, 'nginx-spa.conf'), join(workDir, 'nginx-spa.conf'));
  const dockerignore = join(tpl, '.dockerignore');
  if (existsSync(dockerignore)) {
    await cp(dockerignore, join(workDir, '.dockerignore'));
  }
}

function namesForRun(runId: string): { containerName: string; imageTag: string } {
  const id = runId.replace(/-/g, '').slice(0, 12);
  return {
    containerName: `cine-pg-vite-${id}`,
    imageTag: `cine-pg-vite:${id}`,
  };
}

async function readPublishedPort(
  docker: DockerCli,
  name: string,
): Promise<number | null> {
  const portOut = await docker.run(['port', name, '80'], {
    maxStdoutBytes: 1_024,
    wallMs: 10_000,
  });
  const text = `${portOut.stdout.toString('utf8')}\n${portOut.stderr}`;
  const m = text.match(/:(\d+)\s*$/m);
  if (m) return Number(m[1]);
  return null;
}

/**
 * npm build trong Docker → nginx phục vụ dist (SPA fallback).
 * Lần đầu kéo node/nginx + npm install có thể vài phút.
 */
export async function startVitePreview(opts: {
  workDir: string;
  runId: string;
  docker?: DockerCli;
}): Promise<VitePreviewStart> {
  const docker = opts.docker ?? spawnCli();
  const { containerName, imageTag } = namesForRun(opts.runId);

  await materializeViteTemplate(opts.workDir);
  await docker.run(['rm', '-f', containerName], { maxStdoutBytes: 1_024, wallMs: 30_000 }).catch(() => undefined);

  const build = await docker.run(
    ['build', '-t', imageTag, opts.workDir],
    { maxStdoutBytes: 512 * 1024, wallMs: 12 * 60_000 },
  );
  if (build.code !== 0) {
    throw new Error(
      `docker build Vite thất bại: ${build.stderr || build.stdout.toString('utf8').slice(-2000)}`,
    );
  }

  const run = await docker.run(
    [
      'run',
      '-d',
      '--name',
      containerName,
      '--network',
      'bridge',
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
      imageTag,
    ],
    { maxStdoutBytes: 4_096, wallMs: 60_000 },
  );
  if (run.code !== 0) {
    await stopVitePreview(containerName, imageTag, docker).catch(() => undefined);
    throw new Error(`docker run Vite thất bại: ${run.stderr || run.stdout.toString('utf8')}`);
  }

  for (let i = 0; i < 20; i++) {
    const hostPort = await readPublishedPort(docker, containerName);
    if (hostPort) {
      return {
        containerName,
        imageTag,
        hostPort,
        previewUrl: `http://${previewHost()}:${hostPort}/`,
      };
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  await stopVitePreview(containerName, imageTag, docker).catch(() => undefined);
  throw new Error('không lấy được port 80 của container Vite/nginx');
}

export async function stopVitePreview(
  containerName: string,
  imageTag?: string,
  docker?: DockerCli,
): Promise<void> {
  const cli = docker ?? spawnCli();
  await cli
    .run(['rm', '-f', containerName], { maxStdoutBytes: 1_024, wallMs: 30_000 })
    .catch(() => undefined);
  const tag =
    imageTag ??
    (containerName.startsWith('cine-pg-vite-')
      ? `cine-pg-vite:${containerName.slice('cine-pg-vite-'.length)}`
      : null);
  if (tag) {
    await cli
      .run(['rmi', '-f', tag], { maxStdoutBytes: 1_024, wallMs: 60_000 })
      .catch(() => undefined);
  }
}

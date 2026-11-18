import { existsSync } from 'node:fs';
import { cp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnCli, type DockerCli } from '../sandbox-worker/docker-cli';

export interface ExpressPreviewStart {
  containerName: string;
  imageTag: string;
  hostPort: number;
  previewUrl: string;
}

function previewHost(): string {
  return process.env.PLAYGROUND_PREVIEW_HOST ?? '127.0.0.1';
}

function templateDir(): string {
  const leaf = join('templates', 'express');
  const candidates = [
    join(__dirname, leaf),
    join(__dirname, '..', '..', '..', 'playground', leaf),
    join(process.cwd(), 'src', 'playground', leaf),
    join(process.cwd(), 'dist', 'src', 'playground', leaf),
    join(process.cwd(), 'dist', 'playground', leaf),
  ];
  const found = candidates.find((p) => existsSync(join(p, 'Dockerfile')));
  if (!found) {
    throw new Error(`không tìm thấy express template. Đã thử:\n${candidates.join('\n')}`);
  }
  return found;
}

export async function materializeExpressTemplate(workDir: string): Promise<void> {
  const tpl = templateDir();
  await cp(join(tpl, 'Dockerfile'), join(workDir, 'Dockerfile'));
  const dockerignore = join(tpl, '.dockerignore');
  if (existsSync(dockerignore)) {
    await cp(dockerignore, join(workDir, '.dockerignore'));
  }
}

/** Env AWS / bảng / bucket — ưu tiên PLAYGROUND_* rồi AWS_*. */
export function expressRuntimeEnv(): Record<string, string> {
  const pick = (...keys: string[]): string => {
    for (const k of keys) {
      const v = process.env[k];
      if (v != null && String(v).trim() !== '') return String(v);
    }
    return '';
  };
  return {
    PORT: '3000',
    NODE_ENV: 'production',
    AWS_REGION: pick('PLAYGROUND_AWS_REGION', 'AWS_REGION') || 'ap-southeast-1',
    AWS_ACCESS_KEY_ID: pick('PLAYGROUND_AWS_ACCESS_KEY_ID', 'AWS_ACCESS_KEY_ID'),
    AWS_SECRET_ACCESS_KEY: pick('PLAYGROUND_AWS_SECRET_ACCESS_KEY', 'AWS_SECRET_ACCESS_KEY'),
    DYNAMODB_TABLE_NAME: pick('PLAYGROUND_DYNAMODB_TABLE_NAME', 'DYNAMODB_TABLE_NAME'),
    S3_BUCKET_NAME: pick('PLAYGROUND_S3_BUCKET_NAME', 'S3_BUCKET_NAME'),
  };
}

/** Ghi .env trong workDir (dotenv trong app) — không ghi đè secret đã có trong file mẫu nếu host không set. */
export async function writeExpressDotEnv(workDir: string): Promise<void> {
  const env = expressRuntimeEnv();
  const lines = Object.entries(env).map(([k, v]) => `${k}=${v}`);
  await writeFile(join(workDir, '.env'), `${lines.join('\n')}\n`, 'utf8');
}

function namesForRun(runId: string): { containerName: string; imageTag: string } {
  const id = runId.replace(/-/g, '').slice(0, 12);
  return {
    containerName: `cine-pg-ex-${id}`,
    imageTag: `cine-pg-ex:${id}`,
  };
}

async function readPublishedPort(docker: DockerCli, name: string): Promise<number | null> {
  const portOut = await docker.run(['port', name, '3000'], {
    maxStdoutBytes: 1_024,
    wallMs: 10_000,
  });
  const text = `${portOut.stdout.toString('utf8')}\n${portOut.stderr}`;
  const m = text.match(/:(\d+)\s*$/m);
  if (m) return Number(m[1]);
  return null;
}

/**
 * npm install + chạy Express (app.js). Truyền AWS env từ host.
 */
export async function startExpressPreview(opts: {
  workDir: string;
  runId: string;
  entryFile?: string;
  docker?: DockerCli;
}): Promise<ExpressPreviewStart> {
  const docker = opts.docker ?? spawnCli();
  const { containerName, imageTag } = namesForRun(opts.runId);
  const entry = opts.entryFile?.replace(/^\/+/, '') || 'app.js';

  await materializeExpressTemplate(opts.workDir);
  await writeExpressDotEnv(opts.workDir);
  await docker
    .run(['rm', '-f', containerName], { maxStdoutBytes: 1_024, wallMs: 30_000 })
    .catch(() => undefined);

  const build = await docker.run(['build', '-t', imageTag, opts.workDir], {
    maxStdoutBytes: 512 * 1024,
    wallMs: 12 * 60_000,
  });
  if (build.code !== 0) {
    throw new Error(
      `docker build Express thất bại: ${build.stderr || build.stdout.toString('utf8').slice(-2000)}`,
    );
  }

  const runtime = expressRuntimeEnv();
  const runArgs = [
    'run',
    '-d',
    '--name',
    containerName,
    '--network',
    'bridge',
    '-p',
    '127.0.0.1:0:3000',
    '--memory',
    '512m',
    '--memory-swap',
    '512m',
    '--pids-limit',
    '128',
    '--security-opt',
    'no-new-privileges',
    '-e',
    `PLAYGROUND_EXPRESS_ENTRY=${entry}`,
  ];
  for (const [k, v] of Object.entries(runtime)) {
    runArgs.push('-e', `${k}=${v}`);
  }
  runArgs.push(imageTag);

  const run = await docker.run(runArgs, { maxStdoutBytes: 4_096, wallMs: 60_000 });
  if (run.code !== 0) {
    await stopExpressPreview(containerName, imageTag, docker).catch(() => undefined);
    throw new Error(`docker run Express thất bại: ${run.stderr || run.stdout.toString('utf8')}`);
  }

  for (let i = 0; i < 30; i++) {
    const hostPort = await readPublishedPort(docker, containerName);
    if (hostPort) {
      return {
        containerName,
        imageTag,
        hostPort,
        previewUrl: `http://${previewHost()}:${hostPort}/`,
      };
    }
    const ps = await docker.run(
      ['inspect', '-f', '{{.State.Status}} {{.State.ExitCode}}', containerName],
      { maxStdoutBytes: 256, wallMs: 5_000 },
    );
    const state = ps.stdout.toString('utf8').trim();
    if (state.startsWith('exited')) {
      const logs = await docker.run(['logs', containerName], {
        maxStdoutBytes: 8_192,
        wallMs: 5_000,
      });
      await stopExpressPreview(containerName, imageTag, docker).catch(() => undefined);
      throw new Error(
        `Express thoát sớm (${state}): ${logs.stdout.toString('utf8') || logs.stderr}`,
      );
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  await stopExpressPreview(containerName, imageTag, docker).catch(() => undefined);
  throw new Error('không lấy được port 3000 của container Express');
}

export async function stopExpressPreview(
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
    (containerName.startsWith('cine-pg-ex-')
      ? `cine-pg-ex:${containerName.slice('cine-pg-ex-'.length)}`
      : null);
  if (tag) {
    await cli
      .run(['rmi', '-f', tag], { maxStdoutBytes: 1_024, wallMs: 60_000 })
      .catch(() => undefined);
  }
}

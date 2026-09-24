import { mkdir } from 'node:fs/promises';
import { Worker } from 'bullmq';
import { HostFingerprint, QUEUE_EXEC, QUEUE_MEASURE } from '../sandbox/contract';
import { buildRedisConnection } from '../shared/redis-connection';
import { forbiddenEnvKeys, readWorkerConfig, WorkerConfig } from './config';
import { DockerCli, spawnCli } from './docker-cli';
import { readFingerprint } from './fingerprint';
import { handleExec, WorkerDeps } from './handle-exec';
import { handleMeasure } from './handle-measure';
import { cleanupLeftovers } from './programs';
import { SlotPool, withSlot } from './slots';

const MiB = 1024 * 1024;

export interface RunningWorker {
  host: HostFingerprint;
  close(): Promise<void>;
}

/**
 * MỘT tiến trình, kéo từ mọi nguồn trong cấu hình (thật, và eval nếu có), với
 * CHUNG một pool khe đo và một pool lượt kiểm (spec §3.5, sửa lần 9): eval và
 * chấm thật không bao giờ cùng đo trên một khe (T-ISO-7).
 */
export async function startWorker(
  cfg: WorkerConfig,
  opts: { docker?: DockerCli; log?: (line: string) => void } = {},
): Promise<RunningWorker> {
  const log = opts.log ?? (() => undefined);
  const docker = opts.docker ?? spawnCli();
  const host = await readFingerprint(docker, cfg);
  await mkdir(cfg.workRoot, { recursive: true });
  // Trước khi nhận job: container và thư mục job sót của lần chạy trước (review I4).
  await cleanupLeftovers(docker, cfg.workRoot, log);

  const deps: WorkerDeps = {
    runner: {
      docker,
      runtime: cfg.runtime,
      // Chạy theo Id đã ghi trong dấu vân tay, không theo tag: dựng lại image giữa
      // chừng thì dấu vân tay vẫn nói đúng image đang chạy (review M2, T-ISO-5).
      images: { cpp: host.images.cpp, python: host.images.python },
      fetchPolicy: { allowedHosts: cfg.allowedDownloadHosts, allowHttp: cfg.allowHttpDownloads, maxBytes: 64 * MiB },
    },
    host,
    workRoot: cfg.workRoot,
  };
  const timing = new SlotPool(cfg.timingCpusets);
  const general = new SlotPool(Array.from({ length: cfg.execConcurrency }, () => cfg.generalCpuset));

  const workers: Worker[] = [];
  for (const source of cfg.sources) {
    const common = {
      connection: buildRedisConnection({ REDIS_URL: source.redisUrl }),
      prefix: source.prefix,
      // Luật ACL (Task 12) cấm INFO nếu phải — kiểm phiên bản Redis không đáng
      // bằng một quyền rộng hơn trên máy dễ bị tấn công nhất.
      skipVersionCheck: true,
    };
    workers.push(
      new Worker(
        QUEUE_EXEC,
        (job) => withSlot(general, (slot, onLeak) => handleExec(job.data, { ...deps, onLeak }, slot), log),
        { ...common, concurrency: cfg.execConcurrency },
      ),
      new Worker(
        QUEUE_MEASURE,
        (job) => withSlot(timing, (slot, onLeak) => handleMeasure(job.data, { ...deps, onLeak }, slot), log),
        { ...common, concurrency: timing.size },
      ),
    );
  }

  for (const w of cfg.warnings) log(`CẢNH BÁO: ${w}`);
  log(
    `worker sandbox: nguồn ${cfg.sources.map((s) => s.name).join(' + ')} · runtime ${host.runtime} · ` +
      `${timing.size} khe đo · ${cfg.execConcurrency} lượt kiểm song song · docker ${host.dockerVersion}`,
  );
  return {
    host,
    close: async () => {
      await Promise.all(workers.map((w) => w.close()));
    },
  };
}

async function main(): Promise<void> {
  const forbidden = forbiddenEnvKeys(process.env);
  if (forbidden.length > 0) {
    console.error(
      `Từ chối khởi động: env có ${forbidden.join(', ')}. Worker sandbox không được cầm khoá model, ` +
        'storage, DB hay Redis của API (spec §3.5 luật 2).',
    );
    process.exit(2);
  }
  const worker = await startWorker(readWorkerConfig(process.env), { log: (line) => console.log(line) });
  const stop = () => {
    void worker.close().then(() => process.exit(0));
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

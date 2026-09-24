import { cpus, tmpdir } from 'node:os';
import { join } from 'node:path';
import { SANDBOX_PREFIX_DEFAULT, SandboxLanguage } from '../sandbox/contract';
import { Runtime } from './docker-args';
import { cpusetCores } from './slots';

/**
 * Biến mà máy sandbox KHÔNG BAO GIỜ được cầm (spec §3.5 luật 2). Thấy một
 * biến trong số này thì worker từ chối khởi động: thà không chạy còn hơn chạy
 * với khoá model trên đúng cái máy mà mã sinh viên đang cố thoát ra.
 */
export const FORBIDDEN_ENV: RegExp[] = [
  /^ANTHROPIC_/,
  /^OPENAI_/,
  /^GRADING_TIER\d+_API_KEY$/,
  /^DATABASE_/,
  /^STORAGE_(ACCESS|SECRET)_KEY$/,
  /^AWS_SECRET_ACCESS_KEY$/,
  /^MINIO_ROOT_PASSWORD$/,
  /_TOKEN_SECRET$/,
  /^REDIS_(URL|HOST|PASSWORD|USERNAME)$/,
  // Codespaces và CI đặt sẵn token GitHub có quyền GHI repo — thoát container ở
  // đó là đẩy được code vào chính repo đồ án.
  /^(GITHUB|GH)_TOKEN$/,
];

export function forbiddenEnvKeys(env: NodeJS.ProcessEnv): string[] {
  return Object.keys(env)
    .filter((k) => env[k]?.trim() && FORBIDDEN_ENV.some((re) => re.test(k)))
    .sort();
}

export interface Source {
  name: 'real' | 'eval';
  redisUrl: string;
  prefix: string;
}

export interface WorkerConfig {
  sources: Source[];
  runtime: Runtime;
  images: Record<SandboxLanguage, string>;
  timingCpusets: (string | null)[];
  generalCpuset: string | null;
  execConcurrency: number;
  workRoot: string;
  allowedDownloadHosts: string[];
  allowHttpDownloads: boolean;
  version: string;
  warnings: string[];
}

export function readWorkerConfig(env: NodeJS.ProcessEnv): WorkerConfig {
  const problems: string[] = [];
  const warnings: string[] = [];
  const get = (key: string) => env[key]?.trim() || undefined;

  const sources: Source[] = [];
  const real = get('SANDBOX_REDIS_URL');
  if (real) sources.push({ name: 'real', redisUrl: real, prefix: get('SANDBOX_PREFIX') ?? SANDBOX_PREFIX_DEFAULT });
  else problems.push('thiếu SANDBOX_REDIS_URL');
  const evalUrl = get('SANDBOX_EVAL_REDIS_URL');
  if (evalUrl) {
    const prefix = get('SANDBOX_EVAL_PREFIX') ?? SANDBOX_PREFIX_DEFAULT;
    if (evalUrl === real && prefix === sources[0]?.prefix) {
      problems.push('hàng đợi eval trùng cả Redis lẫn prefix với hàng đợi thật — eval phải có Redis riêng (§3.5)');
    }
    sources.push({ name: 'eval', redisUrl: evalUrl, prefix });
  }

  const runtime = get('SANDBOX_RUNTIME') ?? 'runc';
  if (runtime !== 'runc' && runtime !== 'runsc') problems.push(`SANDBOX_RUNTIME phải là runc hoặc runsc, đang là ${JSON.stringify(runtime)}`);

  let timingCpusets: (string | null)[] = [null];
  const timingRaw = get('SANDBOX_TIMING_CPUSETS');
  if (timingRaw) timingCpusets = timingRaw.split('|').map((s) => s.trim());
  else warnings.push('SANDBOX_TIMING_CPUSETS chưa đặt — job đo KHÔNG ghim lõi; số đo chỉ để thử, không dùng cho chấm thật (§3.5)');
  const generalCpuset = get('SANDBOX_GENERAL_CPUSET') ?? null;

  const owner = new Map<number, string>();
  let generalSize = 0;
  for (const set of [...timingCpusets, generalCpuset]) {
    if (set === null) continue;
    try {
      const cores = cpusetCores(set);
      if (set === generalCpuset) generalSize = cores.length;
      for (const core of cores) {
        const prev = owner.get(core);
        if (prev !== undefined) problems.push(`lõi ${core} nằm ở cả "${prev}" lẫn "${set}" — mỗi khe đo phải có lõi riêng`);
        owner.set(core, set);
      }
    } catch (error) {
      problems.push(error instanceof Error ? error.message : String(error));
    }
  }

  const concurrencyRaw = get('SANDBOX_CONCURRENCY');
  const execConcurrency = concurrencyRaw ? Number(concurrencyRaw) : Math.max(1, generalSize || cpus().length - 1);
  if (!Number.isInteger(execConcurrency) || execConcurrency < 1) {
    problems.push(`SANDBOX_CONCURRENCY phải là số nguyên dương, đang là ${JSON.stringify(concurrencyRaw)}`);
  }

  if (problems.length > 0) throw new Error(`Cấu hình worker sandbox sai:\n- ${problems.join('\n- ')}`);

  return {
    sources,
    runtime: runtime as Runtime,
    images: {
      cpp: get('SANDBOX_IMAGE_CPP') ?? 'cine-sandbox-cpp:1',
      python: get('SANDBOX_IMAGE_PYTHON') ?? 'cine-sandbox-python:1',
    },
    timingCpusets,
    generalCpuset,
    execConcurrency,
    workRoot: get('SANDBOX_WORK_DIR') ?? join(tmpdir(), 'cine-sandbox'),
    allowedDownloadHosts: (get('SANDBOX_ALLOWED_DOWNLOAD_HOSTS') ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    allowHttpDownloads: get('SANDBOX_ALLOW_HTTP_DOWNLOADS') === 'true',
    version: get('SANDBOX_WORKER_VERSION') ?? 'dev',
    warnings,
  };
}

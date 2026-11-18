export const PLAYGROUND_QUEUE = 'playground-console';

/** Job names trên cùng queue. */
export const PLAYGROUND_JOB_EXECUTE = 'execute';
export const PLAYGROUND_JOB_EXPIRE = 'expire';

export const PLAYGROUND_JOB_OPTIONS = {
  attempts: 2,
  backoff: { type: 'fixed' as const, delay: 2_000 },
  removeOnComplete: 50,
  removeOnFail: 50,
};

/** Sweep lưới an toàn (thưa) — delayed job tắt đúng giờ. */
export const PLAYGROUND_EXPIRE_SWEEP_MS = 5 * 60 * 1000;

export const PLAYGROUND_CONCURRENCY = 2;

/** Trần ký tự mỗi stream log trả về client. */
export const PLAYGROUND_LOG_MAX_CHARS = 256 * 1024;

/** Trần một lần paste / tổng text các file console. */
export const PLAYGROUND_SOURCE_MAX_CHARS = 256 * 1024;

/** Trần tổng bytes (web tĩnh có ảnh). */
export const PLAYGROUND_MAX_BYTES = 20 * 1024 * 1024;

export const PLAYGROUND_MAX_FILES = 200;

export const PLAYGROUND_WALL_MS = 30_000;

export const PLAYGROUND_MEMORY_MB = 512;

export const PLAYGROUND_PIDS = 64;

/** TTL preview web tĩnh (phút). */
export const PLAYGROUND_STATIC_TTL_MS = 15 * 60 * 1000;

/** TTL Spring Boot preview (build lâu). */
export const PLAYGROUND_SPRING_TTL_MS = 30 * 60 * 1000;

/** TTL Vite/React preview (npm build). */
export const PLAYGROUND_VITE_TTL_MS = 20 * 60 * 1000;

/** TTL Express preview. */
export const PLAYGROUND_EXPRESS_TTL_MS = 20 * 60 * 1000;

export const PLAYGROUND_LANGUAGES = [
  'c',
  'cpp',
  'java',
  'python',
  'static',
  'spring-boot',
  'vite-react',
  'express',
] as const;

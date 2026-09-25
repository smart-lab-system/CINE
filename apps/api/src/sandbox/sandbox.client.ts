import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { Queue, QueueEvents } from 'bullmq';
import { ZodType, ZodTypeAny, ZodTypeDef } from 'zod';
import { buildRedisConnection, throttledErrorLog } from '../shared/redis-connection';
import {
  execJob,
  ExecJobInput,
  execResult,
  ExecResult,
  measureJob,
  MeasureJobInput,
  measureResult,
  MeasureResult,
  QUEUE_EXEC,
  QUEUE_MEASURE,
  SANDBOX_CONTRACT_VERSION,
  SANDBOX_PREFIX_DEFAULT,
  unavailableExec,
  unavailableMeasure,
} from './contract';

export interface WaitableJob {
  waitUntilFinished(events: unknown, ttl?: number): Promise<unknown>;
  remove(): Promise<void>;
}
export interface JobQueue {
  add(
    name: string,
    data: unknown,
    opts: { jobId: string; attempts: number; removeOnComplete: { age: number }; removeOnFail: { age: number } },
  ): Promise<WaitableJob>;
}
export interface Channel {
  queue: JobQueue;
  events: unknown;
}
export type ExecRequest = Omit<ExecJobInput, 'contract' | 'kind' | 'jobId'>;
export type MeasureRequest = Omit<MeasureJobInput, 'contract' | 'kind' | 'jobId'>;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`quá ${ms} ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

/**
 * Phía API của sandbox (spec §3.5 luật 3): gửi job, chờ, và KHÔNG tin kết quả
 * một cách mù quáng — sai schema hay lệch jobId thì từ chối. Không bao giờ
 * ném vì sandbox: mọi sự cố thành `unavailable` (T-DOWN-1), để một sự cố hạ
 * tầng không bao giờ trông như bài làm sai.
 */
export class SandboxClient {
  constructor(
    private readonly o: {
      exec: Channel;
      measure: Channel;
      /**
       * Thời gian chờ THÊM ngoài `budgetMs` của job: xếp hàng chờ khe hay lượt,
       * và độ trễ của worker. Hạn chờ = `budgetMs` + số này (review I3): worker
       * tự dừng ở `budgetMs` và trả phần đã chạy, nên client không vứt mẫu nào.
       */
      queueWaitMs: { exec: number; measure: number };
      warn?: (message: string) => void;
    },
  ) {}

  exec(request: ExecRequest): Promise<ExecResult> {
    return this.submit('exec', request, execJob, execResult, unavailableExec, this.o.exec, this.o.queueWaitMs.exec);
  }

  measure(request: MeasureRequest): Promise<MeasureResult> {
    return this.submit('measure', request, measureJob, measureResult, unavailableMeasure, this.o.measure, this.o.queueWaitMs.measure);
  }

  private async submit<R extends { jobId: string }>(
    kind: 'exec' | 'measure',
    request: object,
    jobSchema: ZodTypeAny,
    resultSchema: ZodType<R, ZodTypeDef, unknown>,
    unavailable: (jobId: string, reason: string) => R,
    channel: Channel,
    queueWaitMs: number,
  ): Promise<R> {
    const jobId = randomUUID();
    // Job API dựng mà sai schema là lỗi của API: nổ ở đây, không thành một
    // lượt `unavailable` bí ẩn bên worker. `...request` ĐẦU TIÊN: lúc chạy nó
    // không đè được jobId, contract hay kind (review M13).
    const payload = jobSchema.parse({ ...request, contract: SANDBOX_CONTRACT_VERSION, kind, jobId });
    const timeoutMs = (payload as { budgetMs: number }).budgetMs + queueWaitMs;

    let job: WaitableJob | undefined;
    let raw: unknown;
    try {
      raw = await withTimeout(
        (async () => {
          job = await channel.queue.add(kind, payload, {
            jobId,
            attempts: 1,
            removeOnComplete: { age: 3_600 },
            removeOnFail: { age: 86_400 },
          });
          return job.waitUntilFinished(channel.events, timeoutMs);
        })(),
        timeoutMs + 1_000,
      );
    } catch (error) {
      // Chưa ai lấy thì gỡ, để một worker sống lại không chạy job không ai chờ.
      // Có trần: Redis mất thì remove() treo tới khi ioredis hết retry (review M6).
      if (job) await withTimeout(job.remove(), 2_000).catch(() => undefined);
      return unavailable(jobId, `sandbox không trả lời: ${error instanceof Error ? error.message : String(error)}`);
    }

    const parsed = resultSchema.safeParse(raw);
    if (!parsed.success) {
      this.o.warn?.(`sandbox ${kind} ${jobId}: kết quả sai schema — ${parsed.error.issues[0]?.message}`);
      return unavailable(jobId, 'kết quả từ worker sai schema — đã từ chối');
    }
    if (parsed.data.jobId !== jobId) {
      this.o.warn?.(`sandbox ${kind} ${jobId}: kết quả mang jobId ${parsed.data.jobId}`);
      return unavailable(jobId, 'kết quả không khớp jobId — đã từ chối');
    }
    return parsed.data;
  }
}

export function createSandboxClient(o: {
  redisUrl: string;
  prefix?: string;
  queueWaitMs?: { exec: number; measure: number };
  /**
   * Nơi ghi lỗi kết nối và kết quả bị từ chối. Mặc định `console.warn` — không bao giờ im: một
   * Redis chết mà không ai thấy thì mọi lời gọi chỉ còn là "sandbox không trả lời".
   */
  log?: (line: string) => void;
}): { client: SandboxClient; close(): Promise<void> } {
  const log = o.log ?? ((line: string) => console.warn(line));
  const prefix = o.prefix ?? SANDBOX_PREFIX_DEFAULT;
  // skipVersionCheck: user ACL của sandbox (Task 12) không có INFO — cùng lý do với worker.
  const opts = { connection: buildRedisConnection({ REDIS_URL: o.redisUrl }), prefix, skipVersionCheck: true };
  const execQueue = new Queue(QUEUE_EXEC, opts);
  const execEvents = new QueueEvents(QUEUE_EXEC, opts);
  const measureQueue = new Queue(QUEUE_MEASURE, opts);
  const measureEvents = new QueueEvents(QUEUE_MEASURE, opts);
  const report = throttledErrorLog(log);
  const emitters: [string, EventEmitter][] = [
    [`${QUEUE_EXEC}/hàng đợi`, execQueue],
    [`${QUEUE_EXEC}/sự kiện`, execEvents],
    [`${QUEUE_MEASURE}/hàng đợi`, measureQueue],
    [`${QUEUE_MEASURE}/sự kiện`, measureEvents],
  ];
  for (const [name, emitter] of emitters) {
    emitter.on('error', (error: unknown) => report(`sandbox: lỗi kết nối ${name} (${prefix})`, error));
  }
  const client = new SandboxClient({
    exec: { queue: execQueue, events: execEvents },
    measure: { queue: measureQueue, events: measureEvents },
    // Job đo có thể xếp hàng chờ khe (§3.5). Mặc định: job đo 240 s + 60 s chờ =
    // đúng trần 300 s mỗi bài của §7; bước 2 truyền budgetMs từ phần còn lại.
    queueWaitMs: o.queueWaitMs ?? { exec: 30_000, measure: 60_000 },
    warn: log,
  });
  return {
    client,
    close: async () => {
      await Promise.all([execQueue.close(), execEvents.close(), measureQueue.close(), measureEvents.close()]);
    },
  };
}

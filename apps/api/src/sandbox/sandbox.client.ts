import { randomUUID } from 'node:crypto';
import { Queue, QueueEvents } from 'bullmq';
import { ZodType, ZodTypeAny, ZodTypeDef } from 'zod';
import { buildRedisConnection } from '../shared/redis-connection';
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
      timeoutMs: { exec: number; measure: number };
      warn?: (message: string) => void;
    },
  ) {}

  exec(request: ExecRequest): Promise<ExecResult> {
    return this.submit('exec', request, execJob, execResult, unavailableExec, this.o.exec, this.o.timeoutMs.exec);
  }

  measure(request: MeasureRequest): Promise<MeasureResult> {
    return this.submit('measure', request, measureJob, measureResult, unavailableMeasure, this.o.measure, this.o.timeoutMs.measure);
  }

  private async submit<R extends { jobId: string }>(
    kind: 'exec' | 'measure',
    request: object,
    jobSchema: ZodTypeAny,
    resultSchema: ZodType<R, ZodTypeDef, unknown>,
    unavailable: (jobId: string, reason: string) => R,
    channel: Channel,
    timeoutMs: number,
  ): Promise<R> {
    const jobId = randomUUID();
    // Job API dựng mà sai schema là lỗi của API: nổ ở đây, không thành một
    // lượt `unavailable` bí ẩn bên worker.
    const payload = jobSchema.parse({ contract: SANDBOX_CONTRACT_VERSION, kind, jobId, ...request });

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
        timeoutMs + Math.min(5_000, timeoutMs),
      );
    } catch (error) {
      // Chưa ai lấy thì gỡ, để một worker sống lại không chạy job không ai chờ.
      await job?.remove().catch(() => undefined);
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
  timeoutMs?: { exec: number; measure: number };
}): { client: SandboxClient; close(): Promise<void> } {
  // skipVersionCheck: user ACL của sandbox (Task 12) không có INFO — cùng lý do với worker.
  const opts = { connection: buildRedisConnection({ REDIS_URL: o.redisUrl }), prefix: o.prefix ?? SANDBOX_PREFIX_DEFAULT, skipVersionCheck: true };
  const execQueue = new Queue(QUEUE_EXEC, opts);
  const execEvents = new QueueEvents(QUEUE_EXEC, opts);
  const measureQueue = new Queue(QUEUE_MEASURE, opts);
  const measureEvents = new QueueEvents(QUEUE_MEASURE, opts);
  const client = new SandboxClient({
    exec: { queue: execQueue, events: execEvents },
    measure: { queue: measureQueue, events: measureEvents },
    // Job đo có thể xếp hàng chờ khe (§3.5) — hạn của nó gồm cả thời gian chờ.
    timeoutMs: o.timeoutMs ?? { exec: 120_000, measure: 600_000 },
  });
  return {
    client,
    close: async () => {
      await Promise.all([execQueue.close(), execEvents.close(), measureQueue.close(), measureEvents.close()]);
    },
  };
}

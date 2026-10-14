/** Lỗi HTTP có mã trạng thái — để biết lỗi nào đáng thử lại (5xx) và lỗi nào không (4xx). */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/** Mã lỗi xảy ra TRƯỚC khi request tới server: server chưa nhận gì nên thử lại POST cũng an toàn. */
const CONNECT_PHASE = new Set(['UND_ERR_CONNECT_TIMEOUT', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN']);

export function isConnectPhaseError(error: unknown): boolean {
  const code = (error as { cause?: { code?: string } } | null)?.cause?.code;
  return code !== undefined && CONNECT_PHASE.has(code);
}

/** `fetch` không nhận được phản hồi (mạng, timeout, socket bị ngắt). Không phân biệt đã gửi hay chưa. */
export function isNetworkError(error: unknown): boolean {
  return error instanceof TypeError && error.message === 'fetch failed';
}

export interface RetryPolicy {
  attempts: number;
  /** Chờ `baseMs × lần thử` trước mỗi lần thử lại. */
  baseMs: number;
  retryable(error: unknown): boolean;
  sleep?: (ms: number) => Promise<void>;
  onRetry?: (attempt: number, error: unknown) => void;
}

export async function withRetry<T>(op: () => Promise<T>, policy: RetryPolicy): Promise<T> {
  const sleep = policy.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  for (let attempt = 1; ; attempt++) {
    try {
      return await op();
    } catch (error) {
      if (attempt >= policy.attempts || !policy.retryable(error)) throw error;
      policy.onRetry?.(attempt, error);
      await sleep(policy.baseMs * attempt);
    }
  }
}

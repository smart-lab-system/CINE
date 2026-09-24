import { createHash } from 'node:crypto';
import { FileRef, INLINE_MAX_CHARS } from '../sandbox/contract';

export interface FetchPolicy {
  allowedHosts: string[];
  /** Chỉ cho MinIO local trong test. Máy sandbox thật: false. */
  allowHttp: boolean;
  maxBytes: number;
  fetchImpl?: typeof fetch;
}

export class FileFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FileFetchError';
  }
}

/** xorshift32 — tất định, giống bộ sinh của fixture eval. */
function rng(seed: number) {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    return x;
  };
}

/** `n` rồi `n` số nguyên đều trong [lo, hi] — định dạng mọi driver đọc. */
export function generateIntArray(n: number, lo: number, hi: number, seed: number): string {
  const next = rng(seed);
  const span = hi - lo + 1;
  const out: string[] = new Array(n);
  for (let i = 0; i < n; i++) {
    // Hai lượt 32 bit cho dải rộng hơn 2^32.
    const r = next() * 4294967296 + next();
    out[i] = String(lo + (r % span));
  }
  return `${n}\n${out.join(' ')}\n`;
}

async function readCapped(res: Response, max: number): Promise<Buffer> {
  if (!res.body) return Buffer.alloc(0);
  const reader = res.body.getReader();
  const parts: Buffer[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) {
      await reader.cancel();
      throw new FileFetchError(`file vượt trần ${max} byte`);
    }
    parts.push(Buffer.from(value));
  }
  return Buffer.concat(parts);
}

/**
 * Biến một `FileRef` thành byte. Mọi lỗi ở đây là lỗi HẠ TẦNG (FileFetchError
 * → job `unavailable`), không bao giờ là lỗi của bài.
 */
export async function materialize(ref: FileRef, policy: FetchPolicy): Promise<Buffer> {
  switch (ref.kind) {
    case 'inline': {
      if (ref.content.length > INLINE_MAX_CHARS) throw new FileFetchError('nội dung inline vượt trần');
      return Buffer.from(ref.content, 'utf8');
    }
    case 'generate':
      return Buffer.from(generateIntArray(ref.n, ref.lo, ref.hi, ref.seed), 'utf8');
    case 'url': {
      let url: URL;
      try {
        url = new URL(ref.url);
      } catch {
        throw new FileFetchError('URL không hợp lệ');
      }
      if (url.protocol !== 'https:' && !(policy.allowHttp && url.protocol === 'http:')) {
        throw new FileFetchError('chỉ tải qua https');
      }
      // So cả host lẫn cổng: allowlist ghi `host` hoặc `host:port`.
      if (!policy.allowedHosts.includes(url.host) && !policy.allowedHosts.includes(url.hostname)) {
        throw new FileFetchError(`host ${url.host} không nằm trong SANDBOX_ALLOWED_DOWNLOAD_HOSTS`);
      }
      const max = Math.min(policy.maxBytes, ref.bytes);
      const f = policy.fetchImpl ?? fetch;
      let res: Response;
      try {
        res = await f(ref.url, { redirect: 'error', signal: AbortSignal.timeout(30_000) });
      } catch (error) {
        throw new FileFetchError(`tải file thất bại: ${error instanceof Error ? error.message : String(error)}`);
      }
      if (!res.ok) throw new FileFetchError(`tải file trả HTTP ${res.status}`);
      const bytes = await readCapped(res, max);
      if (createHash('sha256').update(bytes).digest('hex') !== ref.sha256) {
        throw new FileFetchError('sha256 của file tải về không khớp');
      }
      return bytes;
    }
  }
}

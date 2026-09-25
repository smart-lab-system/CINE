/**
 * Một nơi duy nhất dịch cấu hình env thành thông số kết nối Redis cho BullMQ.
 *
 * Vì sao nhận `REDIS_URL` chứ không chỉ các biến rời: mọi Redis managed
 * (Aiven, Upstash, Render, Railway) đều phát credential dưới dạng MỘT URI
 * `rediss://user:pass@host:port`. Tách tay thành 5 biến là 5 cơ hội gõ sai, và
 * cái sai đó biểu hiện thành lỗi auth trông y hệt sai mật khẩu. Các biến rời
 * vẫn giữ vì Redis trong docker-compose không phát URI nào cả.
 *
 * Không dùng `ConfigService` ở đây: một hàm thuần trên một object dễ kiểm hơn
 * nhiều, và chỗ gọi (app.module.ts) vẫn đi qua ConfigService như cũ.
 */
export interface RedisConnectionOptions {
  host: string;
  port: number;
  username: string | undefined;
  password: string | undefined;
  /**
   * `{}` rỗng nghĩa là "bật TLS với mặc định của Node" — CÓ xác thực chứng chỉ
   * bằng CA store hệ thống. Aiven và Upstash đều dùng chứng chỉ ký bởi CA công
   * khai nên verify được. Đừng hạ thành `rejectUnauthorized: false`.
   */
  tls: Record<string, never> | undefined;
  db: number;
}

function requirePort(raw: string, varName: string): number {
  const port = Number(raw);
  // Number('') === 0 và Number('abc') === NaN — cả hai đều phải nổ ở đây chứ
  // không được đi tiếp thành một cổng vô nghĩa, vì ioredis sẽ retry im lặng
  // thay vì báo cấu hình sai.
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`${varName} phải là một cổng hợp lệ (1-65535), đang nhận: ${JSON.stringify(raw)}`);
  }
  return port;
}

/**
 * Che `user:pass@` của mọi URL trong một thông điệp — log không bao giờ mang credential. Phần
 * user không chứa `:` để regex không quay lui bậc hai trên một chuỗi toàn dấu hai chấm.
 */
function redact(message: string): string {
  return message.replace(/\/\/[^\s/@:]*:[^\s/@]*@/g, '//***@');
}

/**
 * Lý do đọc được của một lỗi. Node 20+ nối `localhost` bằng CẢ `::1` lẫn `127.0.0.1`; hỏng cả
 * hai thì ra `AggregateError` có `message` RỖNG — lý do thật nằm ở `code` và `errors[]`.
 */
function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const code = (error as { code?: unknown }).code;
  const head = error.message || (typeof code === 'string' ? code : '') || error.name;
  if (error instanceof AggregateError && error.errors.length > 0) {
    return `${head} — ${error.errors.map((e: unknown) => (e instanceof Error ? e.message || e.name : String(e))).join('; ')}`;
  }
  return head;
}

/**
 * Lỗi kết nối của hàng đợi BullMQ, cho log. Không gắn listener `error` thì BullMQ tự
 * `console.error` lỗi thô, không nói hàng đợi nào; gắn mà ghi hết thì ngập log, vì ioredis bắn
 * `error` MỖI lần thử nối lại (~mỗi giây khi Redis chết). Nên: ghi lần đầu của mỗi (ngữ cảnh,
 * thông điệp), im trong `windowMs`, rồi ghi lại kèm số lần đã gộp. Một dòng, có trần, đã che
 * credential.
 */
export function throttledErrorLog(
  log: (line: string) => void,
  opts: { windowMs?: number; now?: () => number } = {},
): (context: string, error: unknown) => void {
  const windowMs = opts.windowMs ?? 60_000;
  const now = opts.now ?? Date.now;
  const seen = new Map<string, { at: number; suppressed: number }>();
  return (context, error) => {
    // Cắt thô ở 4 KB TRƯỚC khi che (regex chạy trên chuỗi có trần), cắt 300 SAU khi che: cắt
    // trước ở 300 có thể chặt một URL trước dấu `@` và để lộ nửa mật khẩu.
    const raw = describeError(error).slice(0, 4_096);
    const message = redact(raw).replace(/\s+/g, ' ').trim().slice(0, 300);
    const key = `${context}\u0000${message}`;
    const t = now();
    const last = seen.get(key);
    if (last && t - last.at < windowMs) {
      last.suppressed++;
      return;
    }
    // Có trần: thông điệp mang cổng hay id thay đổi không được làm map phình mãi.
    if (seen.size >= 100) seen.clear();
    seen.set(key, { at: t, suppressed: 0 });
    log(`${context}: ${message}${last && last.suppressed > 0 ? ` (thêm ${last.suppressed} lần gộp)` : ''}`);
  };
}

export function buildRedisConnection(env: Record<string, string | undefined>): RedisConnectionOptions {
  const url = env.REDIS_URL?.trim();

  if (url) {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error(
        'REDIS_URL không phải URL hợp lệ. Định dạng mong đợi: ' +
          'rediss://default:<password>@<host>:<port>',
      );
    }

    return {
      host: parsed.hostname,
      port: parsed.port ? requirePort(parsed.port, 'REDIS_URL (phần port)') : 6379,
      // `|| undefined`, không phải `?? undefined`: URL trả chuỗi RỖNG khi
      // thiếu, và ioredis gửi `AUTH '' <password>` nếu username là chuỗi rỗng
      // — Redis từ chối lệnh đó. Phải là undefined để nó gửi `AUTH <password>`.
      username: decodeURIComponent(parsed.username) || undefined,
      password: decodeURIComponent(parsed.password) || undefined,
      // `rediss:` (hai chữ s) là scheme chuẩn cho Redis-over-TLS. Một chữ s là
      // plaintext. Khác biệt một ký tự này quyết định connect được hay không.
      tls: parsed.protocol === 'rediss:' ? {} : undefined,
      /**
       * Luôn 0, KHÔNG đọc từ URL: Aiven và Upstash đều chỉ có database 0, và
       * `SELECT n` khác 0 bị từ chối. Cần nhiều db thì dùng các biến rời với
       * một Redis tự dựng.
       */
      db: 0,
    };
  }

  const host = env.REDIS_HOST?.trim();
  if (!host) {
    throw new Error(
      'Thiếu cấu hình Redis: đặt REDIS_URL (rediss://...) cho Redis managed, ' +
        'hoặc REDIS_HOST + REDIS_PORT cho Redis tự dựng.',
    );
  }

  return {
    host,
    port: requirePort(env.REDIS_PORT ?? '', 'REDIS_PORT'),
    username: undefined,
    password: env.REDIS_PASSWORD || undefined,
    tls: env.REDIS_TLS === 'true' ? {} : undefined,
    db: Number(env.REDIS_DB ?? 0),
  };
}

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

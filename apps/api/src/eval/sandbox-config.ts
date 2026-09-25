export interface EvalSandboxConfig {
  redisUrl: string;
  prefix: string;
}

/** Biến của hàng đợi THẬT mà eval không bao giờ được dùng lại. */
const REAL_QUEUE_KEYS = ['SANDBOX_REDIS_URL', 'SANDBOX_WORKER_REDIS_URL', 'REDIS_URL'] as const;
const REAL_PREFIX = 'cine-sbx';

/** user@host:port của một URL, và nó có mang mật khẩu không. */
function endpoint(url: string): { key: string; hasPassword: boolean } | null {
  try {
    const u = new URL(url);
    return {
      key: `${u.protocol}//${decodeURIComponent(u.username)}@${u.hostname}:${u.port}`,
      hasPassword: u.password !== '',
    };
  } catch {
    return null;
  }
}

/**
 * Eval gửi job sandbox qua hàng đợi RIÊNG của nó (§12.5, T-EVAL-13): máy dev không cầm
 * credential nào của hàng đợi thật. Cấu hình trả ra CHỈ gồm giá trị của eval.
 */
export function readEvalSandboxConfig(
  env: NodeJS.ProcessEnv,
): { ok: true; config: EvalSandboxConfig } | { ok: false; error: string } {
  const url = env.SANDBOX_EVAL_REDIS_URL?.trim();
  if (!url) return { ok: false, error: 'thiếu SANDBOX_EVAL_REDIS_URL — eval gửi job sandbox qua hàng đợi RIÊNG của eval (§12.5)' };
  const mine = endpoint(url);
  if (!mine) return { ok: false, error: 'SANDBOX_EVAL_REDIS_URL không phải URL hợp lệ' };
  for (const key of REAL_QUEUE_KEYS) {
    const raw = env[key]?.trim();
    const other = raw ? endpoint(raw) : null;
    // Chỉ một URL CÓ mật khẩu mới là credential. Redis local không mật khẩu của docker compose
    // dùng chung được — hàng đợi vẫn tách bằng prefix. (DB index không tách được gì:
    // `buildRedisConnection` luôn dùng DB 0.)
    if (other && other.hasPassword && other.key === mine.key) {
      return { ok: false, error: `SANDBOX_EVAL_REDIS_URL trùng ${key} — eval không được cầm credential của hàng đợi thật (T-EVAL-13)` };
    }
  }
  const prefix = env.SANDBOX_EVAL_PREFIX?.trim() || 'cine-sbx-eval';
  if (prefix === REAL_PREFIX) return { ok: false, error: `SANDBOX_EVAL_PREFIX trùng prefix của hàng đợi thật (${REAL_PREFIX})` };
  return { ok: true, config: { redisUrl: url, prefix } };
}

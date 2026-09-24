const CPUSET = /^\d+(-\d+)?(,\d+(-\d+)?)*$/;

/** "2-3,5" → [2, 3, 5]. Cú pháp của `--cpuset-cpus`. */
export function cpusetCores(set: string): number[] {
  if (!CPUSET.test(set)) throw new Error(`cpuset không hợp lệ: ${JSON.stringify(set)}`);
  const cores = new Set<number>();
  for (const part of set.split(',')) {
    const [a, b] = part.split('-').map(Number);
    for (let c = a; c <= (b ?? a); c++) cores.add(c);
  }
  return [...cores].sort((x, y) => x - y);
}

export function cpusetSize(set: string): number {
  return cpusetCores(set).length;
}

/**
 * Giữ một khe suốt một job. Job báo container rò (`docker rm -f` hỏng) thì khe
 * bị CÁCH LY — không trả lại pool — vì container đó có thể còn chạy trên đúng
 * các lõi này, và job sau sẽ đo trên một khe bẩn (review I4). Khởi động lại
 * worker thì `cleanupLeftovers` dọn và mọi khe về lại.
 */
export async function withSlot<T, R>(
  pool: SlotPool<T>,
  run: (slot: T, onLeak: (names: string[]) => void) => Promise<R>,
  log: (line: string) => void,
): Promise<R> {
  const lease = await pool.acquire();
  const leaked: string[] = [];
  try {
    return await run(lease.item, (names) => leaked.push(...names));
  } finally {
    if (leaked.length === 0) {
      lease.release();
    } else {
      log(
        `CẢNH BÁO: khe ${String(lease.item ?? '(không ghim)')} bị cách ly — không xoá được container ` +
          `${leaked.join(', ')}; xem tay rồi khởi động lại worker (lúc khởi động worker dọn container sót)`,
      );
    }
  }
}

export interface Lease<T> {
  item: T;
  release(): void;
}

/**
 * Semaphore có tên khe. Dùng hai chỗ: khe đo (mỗi khe một cpuset, `K` khe) và
 * lượt kiểm tính đúng (`SANDBOX_CONCURRENCY` lượt, cùng một cpuset chung).
 * MỘT pool cho CẢ hai nguồn (thật và eval) — đó là toàn bộ `T-ISO-7`.
 */
export class SlotPool<T> {
  readonly size: number;
  private readonly free: T[];
  private readonly waiters: ((item: T) => void)[] = [];

  constructor(items: T[]) {
    if (items.length === 0) throw new Error('SlotPool cần ít nhất một khe');
    this.size = items.length;
    this.free = [...items];
  }

  acquire(): Promise<Lease<T>> {
    if (this.free.length > 0) return Promise.resolve(this.lease(this.free.shift() as T));
    return new Promise((resolve) => this.waiters.push((item) => resolve(this.lease(item))));
  }

  private lease(item: T): Lease<T> {
    let released = false;
    return {
      item,
      release: () => {
        if (released) return;
        released = true;
        const next = this.waiters.shift();
        if (next) next(item);
        else this.free.push(item);
      },
    };
  }
}

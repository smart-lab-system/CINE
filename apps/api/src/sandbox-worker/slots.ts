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

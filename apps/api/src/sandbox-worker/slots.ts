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

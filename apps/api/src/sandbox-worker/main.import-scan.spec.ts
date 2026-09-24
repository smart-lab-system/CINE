import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

/**
 * Worker không được import gì của API ngoài hợp đồng và redis-connection:
 * mỗi import thêm là một đường để một khoá model, một DataSource hay một
 * ConfigService lọt lên máy dễ bị tấn công nhất (spec §3.5 luật 2).
 */
const SRC = resolve(__dirname, '..');
const ALLOWED_FILES = new Set(['sandbox/contract.ts', 'shared/redis-connection.ts']);
const ALLOWED_PACKAGES = new Set(['bullmq', 'ioredis', 'zod']);

function specifiers(file: string): string[] {
  const src = readFileSync(file, 'utf8');
  return [...src.matchAll(/(?:from\s+|import\s*\(\s*|require\(\s*|^import\s+)['"]([^'"]+)['"]/gm)].map((m) => m[1]);
}

function resolveTs(from: string, spec: string): string {
  const base = resolve(dirname(from), spec);
  for (const candidate of [`${base}.ts`, join(base, 'index.ts')]) if (existsSync(candidate)) return candidate;
  throw new Error(`không tìm thấy ${spec} từ ${from}`);
}

describe('worker sandbox — phạm vi import', () => {
  it('main.ts chỉ với tới sandbox-worker/, hợp đồng, redis-connection, bullmq, ioredis, zod, node:*', () => {
    const violations: string[] = [];
    const seen = new Set<string>();
    const queue = [join(SRC, 'sandbox-worker', 'main.ts')];
    while (queue.length > 0) {
      const file = queue.pop()!;
      if (seen.has(file)) continue;
      seen.add(file);
      for (const spec of specifiers(file)) {
        if (spec.startsWith('node:')) continue;
        if (!spec.startsWith('.')) {
          const pkg = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
          if (!ALLOWED_PACKAGES.has(pkg)) violations.push(`${relative(SRC, file)} → ${spec}`);
          continue;
        }
        const target = resolveTs(file, spec);
        const rel = relative(SRC, target).replace(/\\/g, '/');
        const inWorker = rel.startsWith('sandbox-worker/') && !rel.includes('/testing/') && !rel.endsWith('.spec.ts');
        if (!inWorker && !ALLOWED_FILES.has(rel)) {
          violations.push(`${relative(SRC, file)} → ${rel}`);
          continue;
        }
        queue.push(target);
      }
    }
    expect(violations).toEqual([]);
    expect(seen.size).toBeGreaterThan(5);
  });
});

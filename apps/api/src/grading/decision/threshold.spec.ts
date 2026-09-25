import { AUTO_APPROVE_CONFIDENCE } from '../grading.types';
import { readAutoThreshold } from './threshold';

describe('readAutoThreshold — θ (§4.2)', () => {
  it('không đặt → hằng số hôm nay, không cảnh báo', () => {
    expect(readAutoThreshold({})).toEqual({ theta: AUTO_APPROVE_CONFIDENCE, warning: null });
    expect(AUTO_APPROVE_CONFIDENCE).toBe(0.85);
  });

  it('đọc được từ env', () => {
    expect(readAutoThreshold({ GRADING_AUTO_THRESHOLD: '0.9' }).theta).toBe(0.9);
  });

  it('rỗng, chữ, 0, âm, > 1 → mặc định KÈM cảnh báo', () => {
    for (const raw of ['', 'abc', '0', '-0.5', '1.5']) {
      const r = readAutoThreshold({ GRADING_AUTO_THRESHOLD: raw });
      expect(r.theta).toBe(AUTO_APPROVE_CONFIDENCE);
      expect(r.warning).toMatch(/GRADING_AUTO_THRESHOLD/);
    }
  });

  it('T-AUTO-1 — trong decision/ và eval/, CHỈ threshold.ts đọc hằng số; mọi chỗ khác đi qua θ được truyền vào', () => {
    const { readdirSync, readFileSync } = jest.requireActual<typeof import('node:fs')>('node:fs');
    const { join } = jest.requireActual<typeof import('node:path')>('node:path');
    const E = String.fromCharCode(101, 118, 97, 108);
    const dirs = [__dirname, join(__dirname, '..', '..', E)];
    const readers: string[] = [];
    for (const dir of dirs) {
      for (const f of readdirSync(dir).filter((n) => n.endsWith('.ts') && !n.endsWith('.spec.ts'))) {
        if (readFileSync(join(dir, f), 'utf8').includes('AUTO_APPROVE_CONFIDENCE')) readers.push(f);
      }
    }
    expect(readers).toEqual(['threshold.ts']);
  });
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as moved from './select-grading-provider';
import * as fromModule from '../grading.module';

describe('select-grading-provider.ts', () => {
  it('grading.module re-export đúng hàm đã chuyển — spec cũ vẫn kiểm hành vi qua đường import cũ', () => {
    expect(fromModule.selectGradingProvider).toBe(moved.selectGradingProvider);
    expect(fromModule.readTier).toBe(moved.readTier);
  });

  it('không import module Nest, TypeORM hay entity — runner eval import được mà không có DB', () => {
    const source = readFileSync(join(__dirname, 'select-grading-provider.ts'), 'utf8');
    const imports = [...source.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
    expect(imports.filter((p) => /typeorm|grading\.module|entities\//.test(p))).toEqual([]);
  });
});

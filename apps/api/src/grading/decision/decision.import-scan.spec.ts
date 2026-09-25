import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * `decide()` thuần (§12.5; T-TIER-1/2 "không gọi model, không gọi sandbox"): module này không
 * import sandbox client, model pool, provider, DB hay Nest. Chữ ký không nhận cổng nào, và import
 * là bằng chứng thứ hai.
 */
describe('decision/ — phạm vi import', () => {
  it('không với tới sandbox client, model, provider, DB, Nest', () => {
    const dir = __dirname;
    const forbidden = /sandbox\.client|model-pool|ai-provider|typeorm|@nestjs|\.entity|investigate'/;
    const offenders: string[] = [];
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.ts') && !n.endsWith('.spec.ts'))) {
      const src = readFileSync(join(dir, f), 'utf8');
      for (const m of src.matchAll(/from\s+'([^']+)'/g)) if (forbidden.test(m[1])) offenders.push(`${f} → ${m[1]}`);
    }
    expect(offenders).toEqual([]);
  });
});

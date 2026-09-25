import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return files(p);
    return p.endsWith('.ts') && !p.endsWith('.spec.ts') ? [p] : [];
  });
}

describe('T-EVAL-7 / §12.5 luật 1 — eval và vòng điều tra không có đường nào tới DB', () => {
  it('không import TypeORM, entity, repository hay service ghi điểm', () => {
    const roots = [join(__dirname), join(__dirname, '..', 'grading', 'investigator')];
    const offenders = roots.flatMap(files).filter((f) =>
      /from '(typeorm|@nestjs\/typeorm)'|\/entities\/|grading\.service'|grading-run\.service'/.test(readFileSync(f, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });
});

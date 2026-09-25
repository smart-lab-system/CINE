import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_BUDGET } from '../grading/investigator/budget';
import { contextFor } from './context-from-fixture';
import { loadDataset } from './load-dataset';
import { writeMiniDe } from './testing/mini-de';

describe('contextFor', () => {
  it('T-EVAL-7 — luật đến TỪ FIXTURE, đóng băng: cùng đề, cùng ca → cùng ngữ cảnh', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ctx-'));
    await writeMiniDe(root);
    const de = (await loadDataset(root)).des[0];
    const bundle = { id: 'mini@x', cases: [{ name: 'cb1', group: 'co_ban', input: '2\n', expected: '4\n' }] };
    const c = de.manifest.cases.find((x) => x.id === 'M1')!;
    const a = contextFor(de, c, bundle, DEFAULT_BUDGET);
    expect(a.rules).toEqual([{ ruleKey: 'sai_co_ban', title: 'Sai ca cơ bản', criterionKey: 'tinh_dung', priced: true, hasPredicate: true }]);
    expect(a.submission.files).toEqual([{ path: 'main.cpp', content: 'int f(int x) { return x; }\n' }]);
    expect(a.driver).toBe('int f(int);\n');
    expect(contextFor(de, c, bundle, DEFAULT_BUDGET)).toEqual(a);
  });
});

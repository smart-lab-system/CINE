import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Một đề tí hon, đủ mọi file, để test bộ nạp / bộ kiểm / runner mà không cần Docker. */
export async function writeMiniDe(root: string, overrides: Record<string, unknown> = {}) {
  const dir = join(root, 'mini');
  await mkdir(join(dir, 'cases'), { recursive: true });
  const manifest = {
    id: 'mini', split: 'dev', language: 'cpp',
    statement: 'Nhân đôi x.', requiredComplexity: null,
    driver: 'driver.cpp', modelAnswer: 'model.cpp', tests: 'tests.json', probes: 'probes.json',
    rubric: [{ key: 'tinh_dung', description: 'Tính đúng', maxPoints: '10.00' }],
    rules: [
      { ruleKey: 'sai_co_ban', title: 'Sai ca cơ bản', criterionKey: 'tinh_dung', deduction: '4.00',
        predicate: { kind: 'test_group_failed', group: 'co_ban' } },
    ],
    cases: [
      { id: 'A0', group: 2, file: 'model.cpp', behavior: 'dynamic', expectedRuleIds: [],
        expectedOutcome: 'graded', expectedScore: '10.00', expectedComplexity: 'O(1)', cleanTwin: null, note: '' },
      { id: 'M1', group: 1, file: 'cases/M1.cpp', behavior: 'dynamic', expectedRuleIds: ['sai_co_ban'],
        expectedOutcome: 'graded', expectedScore: '6.00', expectedComplexity: 'O(1)', cleanTwin: null, note: '' },
    ],
    ...overrides,
  };
  await writeFile(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  await writeFile(join(dir, 'driver.cpp'), 'int f(int);\n');
  await writeFile(join(dir, 'model.cpp'), 'int f(int x) { return 2 * x; }\n');
  await writeFile(join(dir, 'cases', 'M1.cpp'), 'int f(int x) { return x; }\n');
  await writeFile(join(dir, 'tests.json'), JSON.stringify([{ key: 'cb1', group: 'co_ban', input: '2\n', expected: '4\n' }]));
  await writeFile(join(dir, 'probes.json'), JSON.stringify([{ key: 'p1', input: '0\n' }]));
  return dir;
}

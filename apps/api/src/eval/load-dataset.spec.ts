import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expectedScoreHundredths, generateInput, loadDataset } from './load-dataset';
import { writeMiniDe } from './testing/mini-de';

describe('loadDataset', () => {
  it('nạp một đề, tính điểm tối đa và băm bộ dữ liệu', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ds-'));
    await writeMiniDe(root);
    const ds = await loadDataset(root);
    expect(ds.des).toHaveLength(1);
    expect(ds.des[0].maxHundredths).toBe(1000);
    expect(ds.datasetHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('băm không đổi khi file chỉ khác CRLF/LF (Review Focus 1)', async () => {
    const a = await mkdtemp(join(tmpdir(), 'ds-'));
    const b = await mkdtemp(join(tmpdir(), 'ds-'));
    await writeMiniDe(a);
    const dirB = await writeMiniDe(b);
    await writeFile(join(dirB, 'model.cpp'), 'int f(int x) { return 2 * x; }\r\n');
    expect((await loadDataset(a)).datasetHash).toBe((await loadDataset(b)).datasetHash);
  });

  it('T-EVAL-8 — expectedScore được tính, và so được với số gõ trong manifest', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ds-'));
    await writeMiniDe(root);
    const de = (await loadDataset(root)).des[0];
    const m1 = de.manifest.cases.find((c) => c.id === 'M1')!;
    expect(expectedScoreHundredths(de, m1)).toBe(600);
  });

  it('file trỏ tới không tồn tại → lỗi nêu đúng đường dẫn', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ds-'));
    await writeMiniDe(root, { driver: 'khong-co.cpp' });
    await expect(loadDataset(root)).rejects.toThrow(/khong-co\.cpp/);
  });
});

describe('generateInput', () => {
  it('shuffle_range tất định theo seed, đủ n phần tử phân biệt', () => {
    const a = generateInput({ kind: 'shuffle_range', n: 1000, lo: 1, seed: 42 });
    expect(a).toBe(generateInput({ kind: 'shuffle_range', n: 1000, lo: 1, seed: 42 }));
    const nums = a.trim().split('\n')[1].split(' ').map(Number);
    expect(nums).toHaveLength(1000);
    expect(new Set(nums).size).toBe(1000);
  });
  it('nested lồng đúng độ sâu', () => {
    expect(generateInput({ kind: 'nested', open: '(', close: ')', depth: 3 })).toBe('((()))\n');
  });
  it('repeat lặp đúng số lần', () => {
    expect(generateInput({ kind: 'repeat', unit: '()', times: 3 })).toBe('()()()\n');
  });
});

describe('loadDataset — nhóm 5 (§12.7)', () => {
  it('nhóm 5: bài đọc từ eval/private/<đề>/, kiểm sha256; chưa có bài thì bỏ qua và kể ra', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ds-'));
    const fixtures = join(root, 'fixtures');
    const body = 'int f(int x) { return 2 * x; }\n';
    const sha = createHash('sha256').update(body).digest('hex');
    await writeMiniDe(fixtures, {
      cases: [
        { id: 'A0', group: 2, file: 'model.cpp', behavior: 'dynamic', expectedRuleIds: [], expectedOutcome: 'graded', expectedScore: '10.00', expectedComplexity: null, cleanTwin: null, note: '' },
        { id: 'B1', group: 5, file: 'B1.cpp', sha256: sha, behavior: 'dynamic', expectedRuleIds: [], expectedOutcome: 'graded', expectedScore: '10.00', expectedComplexity: null, cleanTwin: null, note: 'nhãn người' },
        { id: 'B2', group: 5, file: 'B2.cpp', sha256: sha, behavior: 'dynamic', expectedRuleIds: [], expectedOutcome: 'graded', expectedScore: '10.00', expectedComplexity: null, cleanTwin: null, note: '' },
      ],
    });
    await mkdir(join(root, 'private', 'mini'), { recursive: true });
    await writeFile(join(root, 'private', 'mini', 'B1.cpp'), body);
    const de = (await loadDataset(fixtures)).des[0];
    expect(de.sources.get('B1')).toBe(body);
    expect(de.missingPrivate).toEqual(['B2']);
    expect(de.manifest.cases.map((c) => c.id)).toEqual(['A0', 'B1']);
  });
});

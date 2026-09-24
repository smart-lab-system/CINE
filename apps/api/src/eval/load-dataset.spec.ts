import { mkdtemp, writeFile } from 'node:fs/promises';
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

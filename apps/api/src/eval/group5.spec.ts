import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TEST_HOST } from '../sandbox-worker/testing/fake-docker';
import { group5Gate, stripForGroup5, trackedPrivateFiles, withoutGroup5 } from './group5';
import { LoadedDataset } from './load-dataset';
import { CaseRecord } from './runner-core';

const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, stdio: 'pipe' });

describe('nhóm 5 — §12.7', () => {
  it('T-EVAL-6 — bài nhóm 5 bị git theo dõi → phát hiện được (runner từ chối chạy)', async () => {
    const repo = await mkdtemp(join(tmpdir(), 'g5-'));
    git(repo, 'init', '-q');
    await mkdir(join(repo, 'eval', 'private', 'sap-xep'), { recursive: true });
    await writeFile(join(repo, 'eval', 'private', 'sap-xep', 'B1.cpp'), 'bài thật');
    expect(trackedPrivateFiles(repo)).toEqual([]);
    git(repo, 'add', '-f', 'eval/private/sap-xep/B1.cpp');
    expect(trackedPrivateFiles(repo)).toEqual(['eval/private/sap-xep/B1.cpp']);
  });

  it('T-EVAL-6 — dòng cases.jsonl của nhóm 5 không mang investigation, tóm tắt hay lời lỗi tự do', () => {
    const r = { group: 5, investigation: { toolCalls: ['mã nguồn'] }, summaryText: 'tóm tắt', error: 'lỗi có trích mã' } as unknown as CaseRecord;
    expect(stripForGroup5(r)).toMatchObject({ investigation: null, summaryText: null, error: 'lỗi (đã ẩn — nhóm 5)' });
  });

  it('duyệt Q8 — mã thật chỉ chạy trên máy sandbox riêng: worker ở máy ngoài danh sách → chặn, nêu tên máy', () => {
    const laptop = { ...TEST_HOST, hostname: 'laptop-cua-dev' };
    expect(group5Gate(laptop, {})).toEqual({ allowed: false, reason: expect.stringMatching(/laptop-cua-dev/) });
    expect(group5Gate(laptop, { SANDBOX_TRUSTED_HOSTS: 'instance-20260924-084904' }).allowed).toBe(false);
    expect(group5Gate(null, { SANDBOX_TRUSTED_HOSTS: 'instance-20260924-084904' }).allowed).toBe(false);
  });

  it('duyệt Q8 — runtime KHÔNG phải điều kiện: máy sandbox riêng chạy runc (D2 của bước 1) vẫn được', () => {
    const vm = { ...TEST_HOST, hostname: 'instance-20260924-084904', runtime: 'runc' as const };
    expect(group5Gate(vm, { SANDBOX_TRUSTED_HOSTS: ' instance-20260924-084904 , may-khac ' })).toEqual({ allowed: true });
  });

  it('withoutGroup5 bỏ đúng các ca nhóm 5 và đếm số ca đã bỏ', () => {
    const c = (id: string, group: number) => ({ id, group }) as never;
    const dataset = { des: [{ manifest: { cases: [c('A0', 2), c('B1', 5), c('B2', 5)] } }], datasetHash: 'h' } as unknown as LoadedDataset;
    const out = withoutGroup5(dataset);
    expect(out.dropped).toBe(2);
    expect(out.dataset.des[0].manifest.cases.map((x) => x.id)).toEqual(['A0']);
    expect(dataset.des[0].manifest.cases).toHaveLength(3); // không sửa bộ dữ liệu gốc
  });
});

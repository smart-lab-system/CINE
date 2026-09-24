import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanupLeftovers } from './programs';
import { FakeDocker, isPs } from './testing/fake-docker';

describe('cleanupLeftovers — review I4', () => {
  it('xoá mọi container mang nhãn cine.sandbox=1 và thư mục job cũ; không đụng thứ khác trong workRoot', async () => {
    const root = mkdtempSync(join(tmpdir(), 'leftovers-'));
    mkdirSync(join(root, 'exec-abc'));
    writeFileSync(join(root, 'exec-abc', 'main.cpp'), 'x');
    mkdirSync(join(root, 'measure-def'));
    writeFileSync(join(root, 'cua-nguoi-khac.txt'), 'giữ nguyên');
    const docker = new FakeDocker([(c) => (isPs(c) ? { stdout: Buffer.from('c1\nc2\n') } : undefined)]);
    const logs: string[] = [];
    await cleanupLeftovers(docker, root, (l) => logs.push(l));
    expect(docker.calls.find(isPs)!.args.join(' ')).toContain('label=cine.sandbox=1');
    const removed = docker.calls.filter((c) => c.args[0] === 'rm').flatMap((c) => c.args.slice(2));
    expect(removed.sort()).toEqual(['c1', 'c2']);
    expect(readdirSync(root)).toEqual(['cua-nguoi-khac.txt']);
    expect(logs.join(' ')).toMatch(/2 container/);
  });

  it('không xoá được container sót → cảnh báo, không nổ (khe đo tự kiểm lại trước mỗi job)', async () => {
    const root = mkdtempSync(join(tmpdir(), 'leftovers-'));
    const docker = new FakeDocker([
      (c) => (isPs(c) ? { stdout: Buffer.from('c1\n') } : undefined),
      (c) => (c.args[0] === 'rm' ? { code: 1, stderr: 'Error response from daemon: busy' } : undefined),
    ]);
    const logs: string[] = [];
    await cleanupLeftovers(docker, root, (l) => logs.push(l));
    expect(logs.join(' ')).toMatch(/CẢNH BÁO.*c1/);
  });
});

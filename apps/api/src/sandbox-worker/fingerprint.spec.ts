import { readFingerprint } from './fingerprint';
import { FakeDocker } from './testing/fake-docker';

const cfg = { runtime: 'runc' as const, images: { cpp: 'cpp:1', python: 'py:1' }, version: 'abc123' };
const docker = (runtimes = '{"runc":{}}') =>
  new FakeDocker([
    (c) => (c.args[0] === 'version' ? { stdout: Buffer.from('27.1.1\n') } : undefined),
    (c) => (c.args[0] === 'info' ? { stdout: Buffer.from(runtimes) } : undefined),
    (c) => (c.args[0] === 'image' ? { stdout: Buffer.from(`sha256:${c.args[c.args.length - 1]}\n`) } : undefined),
  ]);

describe('readFingerprint — T-ISO-5', () => {
  it('ghi CPU, kernel, runtime, phiên bản docker, Id của từng image, phiên bản worker', async () => {
    const f = await readFingerprint(docker(), cfg);
    expect(f).toMatchObject({ runtime: 'runc', dockerVersion: '27.1.1', workerVersion: 'abc123', images: { cpp: 'sha256:cpp:1', python: 'sha256:py:1' } });
    expect(f.cpuCount).toBeGreaterThan(0);
  });

  it('runsc mà docker chưa đăng ký runtime đó → nổ lúc khởi động, không chạy âm thầm bằng runc', async () => {
    await expect(readFingerprint(docker(), { ...cfg, runtime: 'runsc' })).rejects.toThrow(/runsc/);
    await expect(readFingerprint(docker('{"runc":{},"runsc":{}}'), { ...cfg, runtime: 'runsc' })).resolves.toMatchObject({ runtime: 'runsc' });
  });
});

import { DockerUnavailableError, spawnCli } from './docker-cli';

const node = spawnCli(process.execPath);

describe('spawnCli', () => {
  it('chuyển stdin vào, lấy stdout và mã thoát ra', async () => {
    const r = await node.run(['-e', 'process.stdin.pipe(process.stdout)'], {
      stdin: Buffer.from('xin chào'), maxStdoutBytes: 1_000, wallMs: 10_000,
    });
    expect(r.code).toBe(0);
    expect(r.stdout.toString()).toBe('xin chào');
    expect(r.ns > 0n).toBe(true);
  });

  it('vượt trần stdout → cắt, báo truncated, gọi onStdoutCap đúng một lần', async () => {
    const onCap = jest.fn();
    const r = await node.run(['-e', 'process.stdout.write("x".repeat(100000))'], {
      maxStdoutBytes: 1_000, wallMs: 10_000, onStdoutCap: onCap,
    });
    expect(r.stdoutTruncated).toBe(true);
    expect(r.stdout.length).toBe(1_000);
    expect(onCap).toHaveBeenCalledTimes(1);
  });

  it('quá trần thời gian → giết tiến trình, báo wallTimedOut', async () => {
    const r = await node.run(['-e', 'setTimeout(() => {}, 60000)'], { maxStdoutBytes: 10, wallMs: 300 });
    expect(r.wallTimedOut).toBe(true);
  });

  it('bài đóng stdin sớm không làm hỏng lời gọi (EPIPE)', async () => {
    const r = await node.run(['-e', 'process.exit(3)'], {
      stdin: Buffer.alloc(5_000_000, 97), maxStdoutBytes: 10, wallMs: 10_000,
    });
    expect(r.code).toBe(3);
  });

  it('không có binary docker → DockerUnavailableError', async () => {
    await expect(
      spawnCli('docker-khong-ton-tai-xyz').run(['version'], { maxStdoutBytes: 10, wallMs: 1_000 }),
    ).rejects.toThrow(DockerUnavailableError);
  });
});

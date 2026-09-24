import { execArgs, hardenedFlags, runArgs, timeoutCommand } from './docker-args';

const h = { runtime: 'runc' as const, cpuset: null, cpus: 1, memoryMb: 512, pids: 64, fsizeBytes: 4_194_304 };

describe('hardenedFlags', () => {
  const flags = hardenedFlags(h).join(' ');
  it.each([
    '--network none',
    '--read-only',
    '--cap-drop ALL',
    '--security-opt no-new-privileges',
    '--pids-limit 64',
    '--memory 512m',
    '--memory-swap 512m',
    '--cpus 1',
    '--user 1000:1000',
    '--init',
    '--ulimit fsize=4194304',
    '--ulimit core=0',
  ])('có %s', (flag) => {
    expect(flags).toContain(flag);
  });

  it('tmpfs /tmp có trần kích thước, nosuid, nodev', () => {
    expect(flags).toMatch(/--tmpfs \/tmp:rw,nosuid,nodev,size=64m/);
  });

  it('runsc thêm --runtime runsc; runc không thêm gì', () => {
    expect(hardenedFlags({ ...h, runtime: 'runsc' }).join(' ')).toContain('--runtime runsc');
    expect(flags).not.toContain('--runtime');
  });

  it('khe đo ghim cpuset', () => {
    expect(hardenedFlags({ ...h, cpuset: '2-3' }).join(' ')).toContain('--cpuset-cpus 2-3');
  });
});

describe('runArgs', () => {
  it('mount chỉ đọc có cờ readonly, mount ghi được thì không', () => {
    const args = runArgs({
      name: 'c1', image: 'img', hardening: h, env: { A: 'b' }, interactive: true, detach: false,
      mounts: [{ source: '/j/bin', target: '/work', readonly: true }, { source: '/j/out', target: '/out', readonly: false }],
      command: ['/work/a.out'],
    });
    expect(args.slice(0, 4)).toEqual(['run', '-i', '--name', 'c1']);
    expect(args).toContain('type=bind,source=/j/bin,target=/work,readonly');
    expect(args).toContain('type=bind,source=/j/out,target=/out');
    expect(args.slice(-2)).toEqual(['img', '/work/a.out']);
    expect(args).toContain('A=b');
  });
});

describe('execArgs', () => {
  it('exec -i, env theo từng lần, rồi container và lệnh', () => {
    expect(execArgs({ container: 'm1', env: { CINE_TIMING_NONCE: 'n' }, command: ['/work/a.out'] })).toEqual([
      'exec', '-i', '--env', 'CINE_TIMING_NONCE=n', 'm1', '/work/a.out',
    ]);
  });
});

describe('timeoutCommand', () => {
  it('TERM trước, KILL sau 1 giây ân hạn — không bao giờ -s KILL (Global Constraints)', () => {
    expect(timeoutCommand(2500, ['/work/a.out'])).toEqual(['timeout', '-k', '1', '2.500', '/work/a.out']);
  });
});

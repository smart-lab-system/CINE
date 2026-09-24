import { execArgs, GUARD_UID, hardenedFlags, runArgs, SANDBOX_UID, timeoutCommand } from './docker-args';

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
    '--user 64000:64000',
    '--log-driver none',
    '--label cine.sandbox=1',
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

  it('review I6 — uid của bài không trùng user quản trị thường gặp trên host (1000)', () => {
    expect(SANDBOX_UID).toBe(64000);
    expect(GUARD_UID).not.toBe(SANDBOX_UID);
  });

  it('review C1 — container đo: không /tmp ghi được, không /dev/shm, chạy bằng uid canh', () => {
    const f = hardenedFlags({ ...h, tmpfs: false, ipcNone: true, user: `${GUARD_UID}:${GUARD_UID}` }).join(' ');
    expect(f).not.toContain('--tmpfs');
    expect(f).toContain('--ipc none');
    expect(f).toContain(`--user ${GUARD_UID}:${GUARD_UID}`);
    expect(f).not.toContain('--user 64000:64000');
  });

  it('review I4 — nhãn thêm vào được, để dọn và kiểm khe theo nhãn', () => {
    expect(hardenedFlags({ ...h, labels: { 'cine.slot': '2' } }).join(' ')).toContain('--label cine.slot=2');
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

  it('exec với user tường minh — mẫu đo chạy bằng uid của bài, không bằng uid canh', () => {
    expect(execArgs({ container: 'm1', env: {}, user: '64000:64000', command: ['x'] })).toEqual([
      'exec', '-i', '--user', '64000:64000', 'm1', 'x',
    ]);
  });
});

describe('timeoutCommand', () => {
  it('TERM trước, KILL sau 1 giây ân hạn — không bao giờ -s KILL (Global Constraints)', () => {
    expect(timeoutCommand(2500, ['/work/a.out'])).toEqual(['timeout', '-k', '1', '2.500', '/work/a.out']);
  });
});

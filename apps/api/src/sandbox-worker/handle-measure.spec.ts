import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BASELINE_RUNS, handleMeasure, parseTiming, timedCommand } from './handle-measure';
import { cpusetCores, cpusetSize } from './slots';
import { envOf, FakeCall, FakeDocker, FakeRule, isCompile, isDetachedRun, isExec, isTop, testDeps } from './testing/fake-docker';

const inline = (content: string) => ({ kind: 'inline' as const, content });
const workRoot = () => mkdtempSync(join(tmpdir(), 'measure-spec-'));
const program = (code: string) => ({ files: [{ path: 'main.cpp', ref: inline(code) }], driver: inline('// driver'), entry: null });

function job(over: Record<string, unknown> = {}) {
  return {
    contract: 1, kind: 'measure', jobId: randomUUID(), language: 'cpp', timingMode: 'in_process',
    submission: program('// bai'), reference: program('// dap an'),
    points: [
      { n: 100, stdin: inline('100\n') },
      { n: 200, stdin: inline('200\n') },
    ],
    repeats: 2,
    ...over,
  };
}

/** exec giả: in một dòng mã SAI trước, rồi dòng mã đúng với ns = 1000 × n. */
const timed: FakeRule = (c) => {
  if (!isExec(c)) return undefined;
  const nonce = envOf(c, 'CINE_TIMING_NONCE')!;
  const n = c.stdin ? Number(c.stdin.toString().trim()) : 0;
  return { stderr: `CINE_T deadbeef 1 1\nCINE_T ${nonce} ${1000 * n} 42\n`, ns: 5_000_000n };
};
const topClean: FakeRule = (c) => (isTop(c) ? { stdout: Buffer.from('UID PID CMD\n1000 1 docker-init\n1000 7 sleep\n') } : undefined);

function containerOf(docker: FakeDocker): Record<string, 'submission' | 'reference'> {
  const names = docker.calls.filter(isDetachedRun).map((c) => c.args[c.args.indexOf('--name') + 1]);
  return { [names[0]]: 'submission', [names[1]]: 'reference' };
}
const targetOf = (c: FakeCall) => c.args[c.args.indexOf('CINE_TIMING_NONCE=' + envOf(c, 'CINE_TIMING_NONCE')) + 1];

describe('parseTiming', () => {
  it('Review Focus 3 — chỉ nhận dòng mang đúng mã, và lấy dòng CUỐI', () => {
    const s = 'CINE_T abc 5 1\nrác\nCINE_T xyz 7 2\nCINE_T abc 9 3\nCINE_T zzz 1 1\n';
    expect(parseTiming(s, 'abc')).toEqual({ ns: 9, checksum: '3' });
    expect(parseTiming(s, 'khong-co')).toBeNull();
  });
  it('checksum "-" → null (bấm giờ cả tiến trình không có checksum)', () => {
    expect(parseTiming('CINE_T a 10 -\n', 'a')).toEqual({ ns: 10, checksum: null });
  });
});

describe('timedCommand', () => {
  it('C++ trong tiến trình: chạy thẳng; cả tiến trình: bọc cine-time', () => {
    expect(timedCommand('cpp', 'in_process', 'a.out')).toEqual(['/work/a.out']);
    expect(timedCommand('cpp', 'process', 'a.out')).toEqual(['/opt/cine/cine-time', '/work/a.out']);
  });
  it('baseline (entry null) dùng chương trình rỗng của image, cùng cách bấm giờ', () => {
    expect(timedCommand('cpp', 'in_process', null)).toEqual(['/opt/cine/empty-timed']);
    expect(timedCommand('python', 'process', null)).toEqual([
      '/opt/cine/cine-time', '/usr/local/bin/python3', '/opt/cine/cine_run.py', '/opt/cine/empty.py',
    ]);
  });
});

describe('cpuset', () => {
  it('đọc dải và danh sách', () => {
    expect(cpusetCores('2-3,5')).toEqual([2, 3, 5]);
    expect(cpusetSize('4')).toBe(1);
  });
});

describe('handleMeasure', () => {
  it('đo xen kẽ: lượt chẵn bài trước, lượt lẻ đáp án mẫu trước', async () => {
    const docker = new FakeDocker([timed, topClean]);
    const r = await handleMeasure(job(), testDeps(docker, workRoot()), '2');
    expect(r.unavailable).toBeNull();
    const who = containerOf(docker);
    const order = docker.calls.filter((c) => isExec(c) && c.stdin).map((c) => `${who[targetOf(c)]}@${c.stdin!.toString().trim()}`);
    expect(order).toEqual([
      'submission@100', 'reference@100', 'submission@200', 'reference@200',
      'reference@100', 'submission@100', 'reference@200', 'submission@200',
    ]);
    expect(r.samples).toHaveLength(8);
    expect(r.baseline).toHaveLength(2 * BASELINE_RUNS);
  });

  it('Review Focus 3 — số đo trong từ dòng đúng mã; mọi mẫu mang cả số đo ngoài', async () => {
    const r = await handleMeasure(job(), testDeps(new FakeDocker([timed, topClean]), workRoot()), '2');
    expect(r.samples.every((s) => s.outerNs === 5_000_000)).toBe(true);
    expect(r.samples.find((s) => s.n === 200)!.innerNs).toBe(200_000);
    expect(r.samples[0].checksum).toBe('42');
  });

  it('Review Focus 4 — bài để lại tiến trình nền → dừng, aborted interference, không đo tiếp', async () => {
    let submissionContainer = '';
    // Kiểu tường minh: luật bên dưới đọc lại chính `docker.calls`.
    const docker: FakeDocker = new FakeDocker([
      (c) => {
        if (isDetachedRun(c) && !submissionContainer) submissionContainer = c.args[c.args.indexOf('--name') + 1];
        return undefined;
      },
      timed,
      (c) => (isTop(c) && c.args[1] === submissionContainer && docker.calls.filter((x) => isExec(x) && x.stdin).length >= 1
        ? { stdout: Buffer.from('UID PID CMD\n1000 1 docker-init\n1000 7 sleep\n1000 9 a.out\n') }
        : undefined),
      topClean,
    ]);
    const r = await handleMeasure(job(), testDeps(docker, workRoot()), '2');
    expect(r.aborted).toBe('interference');
    expect(r.samples).toHaveLength(1);
  });

  it('bài không biên dịch → aborted compile_error, không khởi động container đo', async () => {
    const docker = new FakeDocker([(c) => (isCompile(c) ? { code: 1, stderr: 'error' } : undefined)]);
    const r = await handleMeasure(job(), testDeps(docker, workRoot()), '2');
    expect(r.aborted).toBe('compile_error');
    expect(docker.calls.some(isDetachedRun)).toBe(false);
  });

  it('đáp án mẫu không biên dịch → unavailable (lỗi của gói chấm, không phải của bài)', async () => {
    let compiles = 0;
    const docker = new FakeDocker([(c) => (isCompile(c) && ++compiles === 2 ? { code: 1, stderr: 'error' } : undefined), timed, topClean]);
    const r = await handleMeasure(job(), testDeps(docker, workRoot()), '2');
    expect(r.unavailable).toMatch(/đáp án mẫu/);
  });

  it('container đo ghim đúng khe, --cpus bằng số lõi của khe, không sanitizer', async () => {
    const docker = new FakeDocker([timed, topClean]);
    const r = await handleMeasure(job(), testDeps(docker, workRoot()), '2-3');
    const run = docker.calls.find(isDetachedRun)!.args.join(' ');
    expect(run).toContain('--cpuset-cpus 2-3');
    expect(run).toContain('--cpus 2');
    expect(docker.calls.find(isCompile)!.args.join(' ')).not.toContain('-fsanitize');
    expect(r.slot).toBe('2-3');
  });

  it('mọi container đo bị xoá, kể cả khi lỗi giữa chừng', async () => {
    const docker = new FakeDocker([(c) => (isExec(c) && c.stdin ? { code: 125, stderr: 'docker: Error response from daemon: boom' } : undefined), topClean]);
    await handleMeasure(job(), testDeps(docker, workRoot()), '2');
    const started = docker.calls.filter(isDetachedRun).map((c) => c.args[c.args.indexOf('--name') + 1]);
    const removed = new Set(docker.calls.filter((c) => c.args[0] === 'rm').map((c) => c.args[2]));
    expect(started.every((n) => removed.has(n))).toBe(true);
  });
});

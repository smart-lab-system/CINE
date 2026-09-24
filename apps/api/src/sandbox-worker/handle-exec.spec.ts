import { randomUUID } from 'node:crypto';
import { mkdtempSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { DockerUnavailableError } from './docker-cli';
import { handleExec } from './handle-exec';
import { FakeDocker, FakeRule, isCase, isCompile, mountSource, TEST_HOST, testDeps } from './testing/fake-docker';

const inline = (content: string) => ({ kind: 'inline' as const, content });
const workRoot = () => mkdtempSync(join(tmpdir(), 'exec-spec-'));

function job(over: Record<string, unknown> = {}) {
  return {
    contract: 1, kind: 'exec', jobId: randomUUID(), language: 'cpp',
    program: { files: [{ path: 'main.cpp', ref: inline('int f(int x) { return 2 * x; }') }], driver: inline('int main() {}'), entry: null },
    cases: [
      { name: 'a', group: 'co_ban', stdin: inline('2\n'), expected: inline('4\n') },
      { name: 'b', group: 'co_ban', stdin: inline('3\n'), expected: inline('7\n') },
      { name: 'c', group: null, stdin: inline('5\n'), expected: null },
    ],
    ...over,
  };
}
/** Ca giả: in gấp đôi số đọc từ stdin. */
const doubler: FakeRule = (c) => (isCase(c) ? { stdout: Buffer.from(`${2 * Number(c.stdin?.toString())}\n`) } : undefined);

describe('handleExec', () => {
  it('chạy mọi ca, so NGOÀI container: pass, fail, và ran khi không có output mong đợi', async () => {
    const r = await handleExec(job(), testDeps(new FakeDocker([doubler]), workRoot()), null);
    expect(r.unavailable).toBeNull();
    expect(r.compile?.ok).toBe(true);
    expect(r.cases.map((c) => c.status)).toEqual(['pass', 'fail', 'ran']);
    expect(r.cases[1].diff).toMatch(/mong đợi "7", nhận "6"/);
    expect(r.cases[2].stdout).toBe('10\n');
  });

  it('T-ISO-5 — kết quả mang dấu vân tay máy', async () => {
    const r = await handleExec(job(), testDeps(new FakeDocker([doubler]), workRoot()), null);
    expect(r.host).toEqual(TEST_HOST);
  });

  it('biên dịch hỏng → compile.ok false, không chạy ca nào', async () => {
    const docker = new FakeDocker([(c) => (isCompile(c) ? { code: 1, stderr: 'main.cpp:1: error' } : undefined)]);
    const r = await handleExec(job(), testDeps(docker, workRoot()), null);
    expect(r.compile).toMatchObject({ ok: false });
    expect(r.compile?.log).toMatch(/error/);
    expect(r.cases).toEqual([]);
    expect(docker.calls.some(isCase)).toBe(false);
  });

  it('T-ISO-6 — output mong đợi không bao giờ nằm trong mount hay stdin của container nào', async () => {
    const MARKER = `BI_MAT_${randomUUID()}`;
    const docker = new FakeDocker([doubler]);
    await handleExec(
      job({ cases: [{ name: 'a', group: null, stdin: inline('2\n'), expected: inline(`${MARKER}\n`) }] }),
      testDeps(docker, workRoot()),
      null,
    );
    const seen = JSON.stringify(docker.calls.map((c) => [c.mounted, c.stdin?.toString() ?? '']));
    expect(seen).not.toContain(MARKER);
  });

  it('Review Focus 2 — docker trả 125 kèm lời daemon ở một ca → cả job unavailable, không có ca fail nào', async () => {
    const docker = new FakeDocker([
      (c) => (isCase(c) ? { code: 125, stderr: 'docker: Error response from daemon: no space left on device' } : undefined),
    ]);
    const r = await handleExec(job(), testDeps(docker, workRoot()), null);
    expect(r.unavailable).toMatch(/docker lỗi/);
    expect(r.cases).toEqual([]);
  });

  it('T-DOWN-1 (phía worker) — docker không chạy → unavailable', async () => {
    const docker = new FakeDocker([], { throwOnFirst: new DockerUnavailableError('ENOENT') });
    const r = await handleExec(job(), testDeps(docker, workRoot()), null);
    expect(r.unavailable).toMatch(/không gọi được docker/);
  });

  it('checker chưa cài → unavailable ngay, không khởi động container nào', async () => {
    const docker = new FakeDocker([doubler]);
    const r = await handleExec(job({ comparator: { kind: 'checker', name: 'duong_di' } }), testDeps(docker, workRoot()), null);
    expect(r.unavailable).toMatch(/checker/);
    expect(docker.calls).toEqual([]);
  });

  it('job sai schema → unavailable nêu lý do, giữ jobId nếu đọc được', async () => {
    const bad = { ...job(), language: 'java' };
    const r = await handleExec(bad, testDeps(new FakeDocker([]), workRoot()), null);
    expect(r.unavailable).toMatch(/sai schema/);
    expect(r.jobId).toBe(bad.jobId);
  });

  it('sanitizer: biên dịch có -fsanitize, ca chạy với trần RAM gấp ba', async () => {
    const docker = new FakeDocker([doubler]);
    await handleExec(job(), testDeps(docker, workRoot()), null);
    expect(docker.calls.find(isCompile)!.args.join(' ')).toContain('-fsanitize=address,undefined');
    expect(docker.calls.find(isCase)!.args.join(' ')).toContain('--memory 1536m');
    expect(docker.calls.find(isCase)!.args).toContain('ASAN_OPTIONS=detect_leaks=0');
  });

  it('Python: kiểm cú pháp thay biên dịch; driver chạy thay bài, qua cine_run.py', async () => {
    const docker = new FakeDocker([doubler]);
    const r = await handleExec(
      job({
        language: 'python',
        program: { files: [{ path: 'bai.py', ref: inline('def f(x): return 2 * x') }], driver: inline('from bai import f'), entry: null },
      }),
      testDeps(docker, workRoot()),
      null,
    );
    expect(r.unavailable).toBeNull();
    expect(docker.calls.find(isCompile)!.args.join(' ')).toContain('check_syntax.py');
    expect(docker.calls.find(isCase)!.args.join(' ')).toContain('/opt/cine/cine_run.py /work/__cine_driver.py');
  });

  it('Python không driver: entry phải có trong bài nộp, không thì unavailable', async () => {
    const r = await handleExec(
      job({ language: 'python', program: { files: [{ path: 'bai.py', ref: inline('') }], driver: null, entry: 'khac.py' } }),
      testDeps(new FakeDocker([doubler]), workRoot()),
      null,
    );
    expect(r.unavailable).toMatch(/khac\.py/);
  });

  const posix = process.platform === 'win32' ? it.skip : it;
  posix('Review Focus 5 — thư mục job 0755, thư mục ra của bước biên dịch 0777', async () => {
    const modes: Record<string, number> = {};
    const docker = new FakeDocker([
      (c) => {
        if (!isCompile(c)) return undefined;
        const out = mountSource(c, '/out')!;
        modes.out = statSync(out).mode & 0o777;
        modes.job = statSync(dirname(out)).mode & 0o777;
        modes.src = statSync(mountSource(c, '/src')!).mode & 0o777;
        return undefined;
      },
      doubler,
    ]);
    await handleExec(job(), testDeps(docker, workRoot()), null);
    expect(modes).toEqual({ out: 0o777, job: 0o755, src: 0o755 });
  });

  it('review I1 — bài tự in lời của daemon rồi thoát 125 → runtime_crash, không unavailable', async () => {
    const docker = new FakeDocker([
      (c) => (isCase(c) ? { code: 125, stderr: 'docker: Error response from daemon: giả' } : undefined),
      // Container ĐÃ chạy, không có lỗi của runtime, và mã thoát là của chính nó.
      (c) => (c.args[0] === 'inspect' ? { stdout: Buffer.from('false|2026-09-24T10:00:00.1Z|125|\n') } : undefined),
    ]);
    const r = await handleExec(job(), testDeps(docker, workRoot()), null);
    expect(r.unavailable).toBeNull();
    expect(r.cases.map((c) => c.status)).toEqual(['runtime_crash', 'runtime_crash', 'runtime_crash']);
  });

  it('review I3 — hết ngân sách thời gian giữa chừng → dừng, trả các ca đã chạy, aborted budget', async () => {
    let t = 0;
    const deps = { ...testDeps(new FakeDocker([doubler]), workRoot()), now: () => (t += 400) };
    const r = await handleExec(job({ budgetMs: 1_000 }), deps, null);
    expect(r.unavailable).toBeNull();
    expect(r.aborted).toBe('budget');
    expect(r.cases.length).toBeGreaterThan(0);
    expect(r.cases.length).toBeLessThan(3);
  });

  posix('review I9 — quyền file bài nộp không phụ thuộc umask của worker', async () => {
    const old = process.umask(0o077);
    try {
      const modes: Record<string, number> = {};
      const docker = new FakeDocker([
        (c) => {
          if (!isCompile(c)) return undefined;
          const src = mountSource(c, '/src')!;
          modes.file = statSync(join(src, 'sub', 'a.cpp')).mode & 0o777;
          modes.sub = statSync(join(src, 'sub')).mode & 0o777;
          return undefined;
        },
        doubler,
      ]);
      await handleExec(
        job({ program: { files: [{ path: 'sub/a.cpp', ref: inline('int f(int x) { return 2 * x; }') }], driver: inline('int main() {}'), entry: null } }),
        testDeps(docker, workRoot()),
        null,
      );
      expect(modes).toEqual({ file: 0o644, sub: 0o755 });
    } finally {
      process.umask(old);
    }
  });

  it('review I4 — xoá container hỏng → báo rò cho main, gồm cả container biên dịch lẫn container ca', async () => {
    const leaked: string[] = [];
    const docker = new FakeDocker([
      (c) => (c.args[0] === 'rm' ? { code: 1, stderr: 'Error response from daemon: busy' } : undefined),
      doubler,
    ]);
    const r = await handleExec(job(), { ...testDeps(docker, workRoot()), onLeak: (n: string[]) => leaked.push(...n) }, null);
    expect(r.unavailable).toBeNull();
    const started = docker.calls.filter((c) => c.args[0] === 'run').map((c) => c.args[c.args.indexOf('--name') + 1]);
    expect([...leaked].sort()).toEqual([...started].sort());
  });

  it('dọn thư mục job và mọi container, kể cả khi lỗi', async () => {
    const root = workRoot();
    const docker = new FakeDocker([(c) => (isCase(c) ? { code: 125, stderr: 'docker: Error response from daemon: x' } : undefined)]);
    await handleExec(job(), testDeps(docker, root), null);
    expect(readdirSync(root)).toEqual([]);
    const started = docker.calls.filter((c) => c.args[0] === 'run').map((c) => c.args[c.args.indexOf('--name') + 1]);
    const removed = docker.calls.filter((c) => c.args[0] === 'rm').map((c) => c.args[2]);
    expect(removed.sort()).toEqual(started.sort());
  });
});

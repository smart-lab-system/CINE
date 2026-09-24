import {
  execJob,
  execResult,
  measureJob,
  unavailableExec,
  SANDBOX_CONTRACT_VERSION,
} from './contract';

const JOB_ID = '6f1c2a4e-9d7b-4c1a-8e3f-2b5d7a9c0e11';
const inline = (content: string) => ({ kind: 'inline' as const, content });
const host = {
  hostname: 'h', cpuModel: 'c', cpuCount: 4, kernel: 'k', runtime: 'runc' as const,
  dockerVersion: '27', images: { cpp: 'sha256:a', python: 'sha256:b' }, workerVersion: 'dev',
};

describe('execJob', () => {
  const base = {
    contract: SANDBOX_CONTRACT_VERSION, kind: 'exec', jobId: JOB_ID, language: 'cpp',
    program: { files: [{ path: 'main.cpp', ref: inline('int f(){return 1;}') }], driver: null, entry: null },
    cases: [{ name: 'c1', group: 'co_ban', stdin: inline('1\n'), expected: inline('1\n') }],
  };

  it('điền mặc định: sanitizer bật, comparator exact, giới hạn chuẩn', () => {
    const job = execJob.parse(base);
    expect(job.sanitize).toBe(true);
    expect(job.comparator).toEqual({ kind: 'exact' });
    expect(job.limits).toEqual({ wallMsPerCase: 2000, memoryMb: 512, pids: 64, outputBytes: 4 * 1024 * 1024 });
  });

  it('review I3 — ngân sách thời gian của job: mặc định 120 s, có trần', () => {
    expect(execJob.parse(base).budgetMs).toBe(120_000);
    expect(execJob.safeParse({ ...base, budgetMs: 10 }).success).toBe(false);
  });

  it('từ chối đường dẫn thoát thư mục, tên dành riêng, và đường tuyệt đối', () => {
    for (const path of ['../x.cpp', 'a/../../x.cpp', '/etc/passwd', '__cine_driver.cpp', '-rf.cpp', '.hidden.cpp']) {
      const job = { ...base, program: { ...base.program, files: [{ path, ref: inline('') }] } };
      expect(execJob.safeParse(job).success).toBe(false);
    }
  });

  it('Python không driver thì phải có entry', () => {
    const py = { ...base, language: 'python', program: { files: [{ path: 'bai.py', ref: inline('print(1)') }], driver: null, entry: null } };
    expect(execJob.safeParse(py).success).toBe(false);
    expect(execJob.safeParse({ ...py, program: { ...py.program, entry: 'bai.py' } }).success).toBe(true);
  });

  it('ngôn ngữ ngoài cpp | python bị từ chối', () => {
    expect(execJob.safeParse({ ...base, language: 'java' }).success).toBe(false);
  });

  it('URL phải kèm sha256 và kích thước', () => {
    const url = { kind: 'url', url: 'https://s3.example/x', sha256: 'a'.repeat(64), bytes: 10 };
    const job = { ...base, cases: [{ ...base.cases[0], stdin: url }] };
    expect(execJob.safeParse(job).success).toBe(true);
    const bad = { ...base, cases: [{ ...base.cases[0], stdin: { ...url, sha256: 'xyz' } }] };
    expect(execJob.safeParse(bad).success).toBe(false);
  });
});

describe('measureJob', () => {
  it('lặp mặc định 5 lần, tối đa 12 điểm n', () => {
    const job = measureJob.parse({
      contract: SANDBOX_CONTRACT_VERSION, kind: 'measure', jobId: JOB_ID, language: 'cpp', timingMode: 'in_process',
      submission: { files: [{ path: 'main.cpp', ref: inline('') }], driver: inline(''), entry: null },
      reference: null,
      points: [{ n: 10, stdin: { kind: 'generate', generator: 'int_array', n: 10, lo: 0, hi: 9, seed: 1 } }],
    });
    expect(job.repeats).toBe(5);
    expect(job.budgetMs).toBe(240_000);
  });
});

describe('execResult', () => {
  it('T-ISO-5 — kết quả thật (không unavailable) phải mang dấu vân tay máy', () => {
    const ok = {
      contract: SANDBOX_CONTRACT_VERSION, kind: 'exec', jobId: JOB_ID, host, compile: null,
      cases: [], totalMs: 1, unavailable: null,
    };
    expect(execResult.safeParse(ok).success).toBe(true);
    expect(execResult.safeParse({ ...ok, host: null }).success).toBe(false);
  });

  it('unavailableExec dựng được kết quả hợp lệ kể cả khi không biết máy', () => {
    const r = unavailableExec(JOB_ID, 'docker không chạy');
    expect(execResult.parse(r).unavailable).toBe('docker không chạy');
    expect(r.cases).toEqual([]);
    expect(r.aborted).toBeNull();
  });
});

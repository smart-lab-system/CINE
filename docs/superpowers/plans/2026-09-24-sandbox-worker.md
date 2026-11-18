# Worker sandbox — Implementation Plan (bước 1 của §9)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mã sinh viên C++ và Python chạy được thật, trong container dùng một lần, trên một worker riêng không cầm khoá model hay khoá storage. Worker nối vào API qua một hợp đồng có kiểu và BullMQ. Kèm báo cáo buổi thử chọn cách cô lập: runtime nào, cách bấm giờ nào, bao nhiêu khe đo `K`.

**Architecture:** Hợp đồng `apps/api/src/sandbox/contract.ts` (kiểu + zod) là thứ duy nhất API và worker cùng import. Worker là một entry point riêng, `apps/api/src/sandbox-worker/main.ts`, chạy bằng `node dist/src/sandbox-worker/main.js` trên máy sandbox. Nó chỉ import hợp đồng, `shared/redis-connection.ts`, `bullmq`, `ioredis`, `zod` và `node:*`; một test quét import khoá lại điều đó. Mỗi job gọi Docker CLI:

- **Job kiểm tính đúng** (`exec`): mỗi ca một container mới. Worker nạp input qua stdin, và so output **ngoài** container.
- **Job đo** (`measure`): bài nộp và đáp án mẫu mỗi bên một container, giữ suốt job. Các mẫu chạy xen kẽ bằng `docker exec`, ghim vào một khe CPU riêng.

Phía API, `SandboxClient` gửi job, chờ kết quả, và từ chối mọi kết quả sai schema hay lệch `jobId`. Nối client vào công cụ của agent là việc của bước 2.

**Tech Stack:** TypeScript trong `apps/api` · BullMQ 6.3.4 + ioredis 5 (đã có) · zod 3 (đã có) · Docker CLI (Engine ≥ 24) · image `gcc:13` và `python:3.12-slim` · gVisor `runsc`, chỉ trên máy sandbox Linux · Jest 29.

**Spec:** `docs/superpowers/specs/2026-09-20-grading-agent-investigator-design.md`: §3.5 toàn bộ (đọc bản lần 9: luật 5 về container mỗi ca, container đo giữ suốt job, đồng hồ giả được, một tiến trình worker), §3.1 (vì sao đo xen kẽ, hằng số `c`), §4.5 (năm kiểu kết cục), §9 bước 1, §15.1 dòng bước 1. Hợp đồng gốc: `git show feature/code-autograder-plan-1:apps/api/src/grading/sandbox/sandbox.types.ts`.

## Global Constraints

- **Worker không bao giờ cầm khoá model, khoá storage, credential DB hay credential Redis của API** (§3.5 luật 2). Worker **từ chối khởi động** khi env có một trong các biến đó (Task 9). Bài nộp đến qua nội dung inline hoặc presigned URL trên một danh sách host cho phép.
- **Worker không mở cổng nào.** Nó chỉ kéo job từ Redis.
- **Container của bài nộp không bao giờ thấy output mong đợi, gói test hay đáp án mẫu** (§3.5 luật 4). Output mong đợi chỉ nằm trong bộ nhớ worker, không bao giờ ghi ra thư mục nào được mount.
- **Mỗi ca kiểm tính đúng một container mới** (§3.5 luật 5). Không tối ưu bằng cách chạy nhiều ca trong một container.
- **Mọi lỗi không chứng minh được là của bài làm → `unavailable` ở cấp job**, không phải một kết cục của ca (plan-1 `TestRunResult.unavailable`, §4.4). Docker chết, tải file hỏng, checker chưa cài, docker không trả lời đúng hạn — đều là `unavailable`.
- **Trần thời gian trong container là `timeout -k 1 <giây>`**: TERM trước, KILL sau 1 giây ân hạn. **Không** dùng `timeout -s KILL`. Đo trên Docker Desktop ngày 2026-09-24: với KILL, `timeout` giết cả nhóm tiến trình gồm chính nó, nên trả 137 thay vì 124, và mọi bài hết giờ trông như chạm trần RAM. Với `-k 1`, vòng lặp và fork bomb ra 124. Bài bắt TERM rồi in *"kết quả giả"* cũng ra 124, nên output giả bị bỏ. Chỉ bài **chặn** TERM ra 137, và nó phân biệt được với hết RAM bằng thời gian đã chạy (≥ trần) cùng cờ `OOMKilled`. Cờ đó đúng cả khi có `--init`: đã đo, ra `true` khi hết RAM.
- **Cờ siết container** (mọi container chạy mã sinh viên): `--network none --read-only --cap-drop ALL --security-opt no-new-privileges --pids-limit --memory = --memory-swap --cpus --user 1000:1000 --tmpfs /tmp --init --ulimit fsize --ulimit core=0`.
- **C++:** `g++ 13`, `-std=c++17 -O2`. Lượt kiểm tính đúng có `-fsanitize=address,undefined -fno-sanitize-recover=all`, kèm `ASAN_OPTIONS=detect_leaks=0` và trần RAM gấp ba (tối đa 2048 MB). Lượt đo **không** có sanitizer.
- **Python:** `python:3.12-slim`. Mọi lượt chạy đi qua `cine_run.py`: thread có stack 512 MiB, `setrecursionlimit(10**6)`, và `RecursionError` ra mã 86. Lượt kiểm tính đúng và lượt đo dùng **chung** file này.
- **Unit test không cần Docker.** Test chạm Docker thật nằm ở `test:sandbox`, bộ riêng, và **nổ** (không bỏ qua) khi thiếu Docker hay image.
- **Line ending:** `.ts` theo quy ước repo (CRLF). `Dockerfile`, `.sh`, `.py`, `.c`, `.h`, `.cpp` trong `apps/api/sandbox-images/` dùng **LF**, ghim bằng `.gitattributes`: một `\r` trong script chạy trong container là lỗi khó đọc nhất có thể.
- **Làm trong worktree riêng.** Nhiều session Claude cùng ghi vào cây làm việc chính.

## Phạm vi, và cái cố ý để sau

- **Không** merge nhánh plan-1. Bước này chỉ lấy hợp đồng (§9 bước 1, sửa lần 9). Phần còn lại merge ở bước 3.
- **Không** nối `SandboxClient` vào công cụ nào, không dựng presigned URL từ storage. Việc đó thuộc bước 2, cùng `run`, `run_tests`, `read_file`.
- **Không** khớp độ phức tạp. Job `measure` trả **mẫu thô**, gồm số đo trong, số đo ngoài và baseline. Khớp mô hình, `inconclusive`, luật mâu thuẫn trong/ngoài (`T-ISO-8` phần kết luận) là bước 4.
- **`checker`** (comparator lập trình sẵn): khai trong hợp đồng, worker trả `unavailable` *"checker chưa cài"*. Bộ checker đầu tiên đi cùng bộ dựng thước.
- **Triển khai lên máy sandbox thật** (systemd, TLS, Redis managed): Task 12 viết tài liệu và cấu hình ACL, còn việc dựng máy chờ chủ đồ án chốt máy, sau báo cáo buổi thử.

## Review Focus

1. **Output mong đợi lọt vào container.** Kỳ vọng: không có đường ghi nào đưa `expected` hay mã đáp án mẫu vào thư mục mount của bài nộp. `T-ISO-6` có test unit (theo dõi mọi lần ghi file) lẫn test tích hợp (bài tự đi tìm).
2. **Lỗi hạ tầng trông như bài sai.** Docker trả `125` kèm `docker: Error response from daemon…`, file tải về lệch sha256, checker chưa cài: cả ba phải ra `unavailable`, không ra `runtime_crash` hay `fail`. *(Task 5 có test cho từng ca.)*
3. **Mã sinh viên in dòng thời gian giả.** Kỳ vọng: dòng không mang đúng mã của mẫu bị bỏ qua, và mọi mẫu mang cả `outerNs`. *(Task 6 unit, Task 7 tích hợp.)*
4. **Tiến trình nền của bài sống qua mẫu đo.** Kỳ vọng: job đo dừng với `aborted: 'interference'`, không đo tiếp trên một khe đã bẩn. *(Task 6, Task 7.)*
5. **Quyền thư mục job trên Linux.** `mkdtemp` tạo thư mục `0700`, nên uid 1000 trong container không đọc được. Kỳ vọng: thư mục job `0755`, thư mục ra của bước biên dịch `0777`. Trên Windows không lộ; trên máy sandbox thì lộ ngay ca đầu tiên. *(Task 5 có test.)*

## File Structure

| File | Trách nhiệm |
|---|---|
| `apps/api/src/sandbox/contract.ts` | Hợp đồng: kiểu, schema zod, tên hàng đợi, kết quả `unavailable` |
| `apps/api/src/sandbox/sandbox.client.ts` | Phía API: gửi job, chờ, kiểm schema + `jobId` |
| `apps/api/src/sandbox-worker/comparators.ts` | So output ngoài container: `exact`, `unordered_lines`, `float_tolerance` |
| `apps/api/src/sandbox-worker/docker-args.ts` | Dựng tham số `docker` — thuần, test được |
| `apps/api/src/sandbox-worker/classify.ts` | Mã thoát → kết cục của ca — thuần |
| `apps/api/src/sandbox-worker/docker-cli.ts` | Gọi Docker CLI: stdin, trần stdout, trần thời gian |
| `apps/api/src/sandbox-worker/fetch-files.ts` | Hiện thực một `FileRef`: inline, URL có danh sách host, sinh mảng |
| `apps/api/src/sandbox-worker/programs.ts` | Ghi mã ra thư mục job, biên dịch, chạy một ca |
| `apps/api/src/sandbox-worker/handle-exec.ts` | Job kiểm tính đúng |
| `apps/api/src/sandbox-worker/handle-measure.ts` | Job đo |
| `apps/api/src/sandbox-worker/slots.ts` | Khe đo và semaphore chung hai nguồn |
| `apps/api/src/sandbox-worker/config.ts` | Đọc env, từ chối env nguy hiểm |
| `apps/api/src/sandbox-worker/fingerprint.ts` | Dấu vân tay máy |
| `apps/api/src/sandbox-worker/main.ts` | `startWorker()` + entry point |
| `apps/api/src/sandbox-worker/testing/fake-docker.ts` | Docker giả cho unit test — không phải `.spec.ts` |
| `apps/api/src/sandbox-spike/*` | Buổi thử: chạy, thống kê, sinh báo cáo |
| `apps/api/sandbox-images/**` | Hai image: `cine-sandbox-cpp:1`, `cine-sandbox-python:1` |
| `apps/api/test-sandbox/**` | Bộ `test:sandbox` — Docker thật |
| `docs/deploy/sandbox-worker.md` | Dựng máy sandbox, env, ACL Redis |
| `docs/superpowers/reports/2026-09-24-sandbox-isolation-spike.md` | Báo cáo buổi thử |

---

### Task 1: Hợp đồng sandbox

**Files:**
- Create: `apps/api/src/sandbox/contract.ts`
- Test: `apps/api/src/sandbox/contract.spec.ts`

**Interfaces:**
- Produces: `SANDBOX_CONTRACT_VERSION`, `QUEUE_EXEC`, `QUEUE_MEASURE`, `SANDBOX_PREFIX_DEFAULT`, `RECURSION_EXIT_CODE`; schema `fileRef`, `programSpec`, `limits`, `comparator`, `execJob`, `measureJob`, `hostFingerprint`, `execResult`, `measureResult`; kiểu `SandboxLanguage`, `FileRef`, `ProgramSpec`, `Limits`, `Comparator`, `ExecJob`, `ExecJobInput`, `MeasureJob`, `MeasureJobInput`, `HostFingerprint`, `CaseStatus`, `LimitHit`, `CompileInfo`, `ExecResult`, `MeasureResult`, `MeasureSample`; hàm `unavailableExec(jobId, reason, host?)`, `unavailableMeasure(jobId, reason, host?)`.

Khác plan-1, có chủ đích:

| plan-1 | Ở đây | Vì sao |
|---|---|---|
| `SandboxLanguage = python \| cpp \| java \| node` | `cpp \| python` | §3.5: sandbox chỉ chạy hai ngôn ngữ. Cột `required_deliverable.language` giữ enum rộng của nhánh (§14.1) |
| `status: pass \| fail \| timeout \| error` | `pass · fail · ran · timeout · runtime_crash · recursion_limit · output_limit` | §3.5, §4.5. `ran` = chạy xong, không có output mong đợi để so (công cụ `run`) |
| `compile`, `groups`, `smoke`, `limitsHit`, `unavailable` | `compile`, `cases` (có `group`), `unavailable`; không có `smoke` | Gom theo nhóm là việc của công cụ `run_tests` ở bước 2. `smoke` chính là `exec` không có output mong đợi |
| Không có job đo | `measureJob`, `measureResult` | §3.1, §3.5 |
| Không có dấu vân tay | `host` trên mọi kết quả thật | `T-ISO-5` |

- [ ] **Step 1: Viết test hỏng**

```ts
// apps/api/src/sandbox/contract.spec.ts
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
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận hỏng**

Run: `pnpm --filter api test -- sandbox/contract`
Expected: FAIL — module không tồn tại.

- [ ] **Step 3: Viết hợp đồng**

```ts
// apps/api/src/sandbox/contract.ts
import { z } from 'zod';

/**
 * Hợp đồng giữa API và worker sandbox (spec 2026-09-20 §3.5).
 *
 * Lấy từ `grading/sandbox/sandbox.types.ts` của nhánh plan-1 rồi mở rộng: kết
 * cục một ca tách `error` thành các lớp của §4.5, ngôn ngữ thu về cpp | python,
 * thêm job đo, thêm dấu vân tay máy.
 *
 * Worker import file này và KHÔNG import gì khác của API ngoài
 * `shared/redis-connection.ts` — `main.import-scan.spec.ts` khoá lại. Nên file
 * này chỉ được import `zod`.
 */

export const SANDBOX_CONTRACT_VERSION = 1 as const;
export const SANDBOX_PREFIX_DEFAULT = 'cine-sbx';
export const QUEUE_EXEC = 'sandbox-exec';
export const QUEUE_MEASURE = 'sandbox-measure';
/** `cine_run.py` thoát bằng mã này khi bài chết vì `RecursionError` (§3.5). */
export const RECURSION_EXIT_CODE = 86;

const MiB = 1024 * 1024;
export const INLINE_MAX_CHARS = 4 * MiB;

export const sandboxLanguage = z.enum(['cpp', 'python']);
export type SandboxLanguage = z.infer<typeof sandboxLanguage>;

/**
 * Đường dẫn tương đối trong bài nộp. Mỗi đoạn bắt đầu bằng chữ, số hoặc `_`:
 * không `..`, không file ẩn, không bắt đầu bằng `-` (sẽ thành cờ của g++).
 * Tiền tố `__cine_` dành cho file của harness (driver).
 */
const safePath = z
  .string()
  .min(1)
  .max(200)
  .regex(/^(?!__cine_)[A-Za-z0-9_][A-Za-z0-9_.-]*(\/[A-Za-z0-9_][A-Za-z0-9_.-]*)*$/, 'đường dẫn không hợp lệ');

export const fileRef = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('inline'), content: z.string().max(INLINE_MAX_CHARS) }),
  z.object({
    kind: z.literal('url'),
    url: z.string().url().max(4096),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    bytes: z.number().int().positive().max(64 * MiB),
  }),
  /**
   * Bộ sinh ĐÓNG — cùng tinh thần `predicate` và `checker` (§14.1): không có
   * code tự do đi qua hợp đồng. Bước 4 thêm bộ sinh mới vào đây.
   */
  z.object({
    kind: z.literal('generate'),
    generator: z.literal('int_array'),
    n: z.number().int().min(0).max(10_000_000),
    lo: z.number().int().min(-(2 ** 53) + 1),
    hi: z.number().int().max(2 ** 53 - 1),
    seed: z.number().int(),
  }),
]);
export type FileRef = z.infer<typeof fileRef>;

export const programSpec = z.object({
  files: z.array(z.object({ path: safePath, ref: fileRef })).min(1).max(200),
  /** C++: biên dịch cùng bài. Python: chạy thay bài, import bài. Từ gói test. */
  driver: fileRef.nullable(),
  /** Python không có driver: file chạy. C++: bỏ qua. */
  entry: safePath.nullable(),
});
export type ProgramSpec = z.infer<typeof programSpec>;

export const limits = z.object({
  wallMsPerCase: z.number().int().min(100).max(20_000).default(2_000),
  memoryMb: z.number().int().min(64).max(2_048).default(512),
  pids: z.number().int().min(8).max(256).default(64),
  outputBytes: z.number().int().min(1_024).max(16 * MiB).default(4 * MiB),
});
export type Limits = z.infer<typeof limits>;

/** Hình dạng ở spec §14.1. `checker` khai trước, chưa cài (worker trả `unavailable`). */
export const comparator = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('exact') }),
  z.object({ kind: z.literal('unordered_lines') }),
  z.object({ kind: z.literal('float_tolerance'), eps: z.number().positive().max(1) }),
  z.object({ kind: z.literal('checker'), name: z.string().min(1).max(64) }),
]);
export type Comparator = z.infer<typeof comparator>;

const jobId = z.string().uuid();
const contract = z.literal(SANDBOX_CONTRACT_VERSION);

function pythonNeedsEntry(language: SandboxLanguage, p: ProgramSpec): boolean {
  return language !== 'python' || p.driver !== null || p.entry !== null;
}
const PY_ENTRY = { message: 'Python không có driver thì phải khai entry' };

export const execJob = z
  .object({
    contract,
    kind: z.literal('exec'),
    jobId,
    language: sandboxLanguage,
    program: programSpec,
    sanitize: z.boolean().default(true),
    cases: z
      .array(
        z.object({
          name: z.string().regex(/^[A-Za-z0-9_.-]{1,64}$/),
          group: z.string().max(100).nullable(),
          stdin: fileRef,
          /** null = công cụ `run`: chạy và trả stdout, không so gì. */
          expected: fileRef.nullable(),
        }),
      )
      .min(1)
      .max(200),
    comparator: comparator.default({ kind: 'exact' }),
    limits: limits.default({}),
  })
  .refine((j) => pythonNeedsEntry(j.language, j.program), PY_ENTRY);
export type ExecJob = z.infer<typeof execJob>;
export type ExecJobInput = z.input<typeof execJob>;

export const measureJob = z
  .object({
    contract,
    kind: z.literal('measure'),
    jobId,
    language: sandboxLanguage,
    /** §3.5: bấm giờ quanh lời gọi hàm (driver) hay cả tiến trình (`cine-time`). */
    timingMode: z.enum(['in_process', 'process']),
    submission: programSpec,
    /** Đáp án mẫu, đo XEN KẼ trong cùng job (§3.1). null khi không có. */
    reference: programSpec.nullable(),
    points: z.array(z.object({ n: z.number().int().positive(), stdin: fileRef })).min(1).max(12),
    repeats: z.number().int().min(1).max(9).default(5),
    limits: limits.default({}),
  })
  .refine((j) => pythonNeedsEntry(j.language, j.submission), PY_ENTRY)
  .refine((j) => j.reference === null || pythonNeedsEntry(j.language, j.reference), PY_ENTRY);
export type MeasureJob = z.infer<typeof measureJob>;
export type MeasureJobInput = z.input<typeof measureJob>;

export const hostFingerprint = z.object({
  hostname: z.string(),
  cpuModel: z.string(),
  cpuCount: z.number().int().positive(),
  kernel: z.string(),
  runtime: z.enum(['runc', 'runsc']),
  dockerVersion: z.string(),
  /** ngôn ngữ → Id của image (sha256:…) */
  images: z.record(z.string(), z.string()),
  workerVersion: z.string(),
});
export type HostFingerprint = z.infer<typeof hostFingerprint>;

export const caseStatus = z.enum([
  'pass',
  'fail',
  'ran',
  'timeout',
  'runtime_crash',
  'recursion_limit',
  'output_limit',
]);
export type CaseStatus = z.infer<typeof caseStatus>;
export const limitHit = z.enum(['time', 'memory', 'output']);
export type LimitHit = z.infer<typeof limitHit>;

export const compileInfo = z.object({
  ok: z.boolean(),
  log: z.string().max(16_384),
  ms: z.number().int().nonnegative(),
});
export type CompileInfo = z.infer<typeof compileInfo>;

/** Kết quả thật (unavailable null) PHẢI mang dấu vân tay máy — T-ISO-5. */
const hostWhenAvailable = (r: { host: unknown; unavailable: string | null }) =>
  r.unavailable !== null || r.host !== null;
const HOST_MSG = { message: 'kết quả thật phải mang dấu vân tay máy sandbox' };

export const execResult = z
  .object({
    contract,
    kind: z.literal('exec'),
    jobId,
    host: hostFingerprint.nullable(),
    compile: compileInfo.nullable(),
    cases: z.array(
      z.object({
        name: z.string(),
        group: z.string().nullable(),
        status: caseStatus,
        /** Đo từ ngoài, GỒM khởi động container. */
        ms: z.number().int().nonnegative(),
        /** Chỉ khi ca không có output mong đợi (`run`). */
        stdout: z.string().max(65_536).nullable(),
        /** Dòng lệch đầu tiên, khi `fail`. */
        diff: z.string().max(1_024).nullable(),
        limitsHit: z.array(limitHit),
      }),
    ),
    totalMs: z.number().int().nonnegative(),
    unavailable: z.string().max(1_000).nullable(),
  })
  .refine(hostWhenAvailable, HOST_MSG);
export type ExecResult = z.infer<typeof execResult>;

export const measureSample = z.object({
  program: z.enum(['submission', 'reference']),
  n: z.number().int().positive(),
  repeat: z.number().int().nonnegative(),
  status: z.enum(['ok', 'timeout', 'runtime_crash', 'recursion_limit', 'output_limit']),
  /** Số đo TRONG container — giả được bởi chính bài (§3.5). null khi không đọc được dòng mang đúng mã. */
  innerNs: z.number().int().nonnegative().nullable(),
  /** Số đo NGOÀI, quanh lời gọi `docker exec` — thô nhưng không giả được. */
  outerNs: z.number().int().nonnegative(),
  checksum: z.string().max(64).nullable(),
});
export type MeasureSample = z.infer<typeof measureSample>;

export const measureResult = z
  .object({
    contract,
    kind: z.literal('measure'),
    jobId,
    host: hostFingerprint.nullable(),
    /** cpuset của khe đo đã dùng. */
    slot: z.string().nullable(),
    timingMode: z.enum(['in_process', 'process']),
    compile: z.object({ submission: compileInfo, reference: compileInfo.nullable() }).nullable(),
    /** Chương trình rỗng, đo cùng cách — hằng số `c` của §3.1. */
    baseline: z.array(
      z.object({
        program: z.enum(['submission', 'reference']),
        innerNs: z.number().int().nonnegative().nullable(),
        outerNs: z.number().int().nonnegative(),
      }),
    ),
    samples: z.array(measureSample),
    aborted: z.enum(['interference', 'compile_error']).nullable(),
    startedAt: z.string(),
    finishedAt: z.string(),
    unavailable: z.string().max(1_000).nullable(),
  })
  .refine(hostWhenAvailable, HOST_MSG);
export type MeasureResult = z.infer<typeof measureResult>;

export function unavailableExec(id: string, reason: string, host: HostFingerprint | null = null): ExecResult {
  return {
    contract: SANDBOX_CONTRACT_VERSION,
    kind: 'exec',
    jobId: id,
    host,
    compile: null,
    cases: [],
    totalMs: 0,
    unavailable: reason.slice(0, 1_000),
  };
}

export function unavailableMeasure(id: string, reason: string, host: HostFingerprint | null = null): MeasureResult {
  const now = new Date().toISOString();
  return {
    contract: SANDBOX_CONTRACT_VERSION,
    kind: 'measure',
    jobId: id,
    host,
    slot: null,
    timingMode: 'in_process',
    compile: null,
    baseline: [],
    samples: [],
    aborted: null,
    startedAt: now,
    finishedAt: now,
    unavailable: reason.slice(0, 1_000),
  };
}
```

- [ ] **Step 4: Chạy test**

Run: `pnpm --filter api test -- sandbox/contract`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/sandbox/contract.ts apps/api/src/sandbox/contract.spec.ts
git commit -m "feat(sandbox): hợp đồng API–worker, mở rộng từ sandbox.types.ts của plan-1 (§3.5)"
```

---

### Task 2: Hai image sandbox

**Files:**
- Create: `apps/api/sandbox-images/common/cine-time.c`
- Create: `apps/api/sandbox-images/cpp/Dockerfile`, `apps/api/sandbox-images/cpp/cine_timing.h`, `apps/api/sandbox-images/cpp/empty.cpp`, `apps/api/sandbox-images/cpp/empty_timed.cpp`
- Create: `apps/api/sandbox-images/python/Dockerfile`, `apps/api/sandbox-images/python/cine_run.py`, `apps/api/sandbox-images/python/cine_timing.py`, `apps/api/sandbox-images/python/check_syntax.py`, `apps/api/sandbox-images/python/empty.py`, `apps/api/sandbox-images/python/empty_timed.py`
- Modify: `.gitattributes` (gốc repo), `apps/api/package.json` (script `sandbox:images`)

**Interfaces:**
- Produces, trong image C++ `cine-sandbox-cpp:1`: `/usr/local/include/cine_timing.h` (`cine::begin()`, `cine::keep(v)`, `cine::stop()`, `cine::report(checksum)`), `/opt/cine/cine-time`, `/opt/cine/empty`, `/opt/cine/empty-timed`; user uid 1000.
- Produces, trong image Python `cine-sandbox-python:1`: `/opt/cine/cine_run.py`, `/opt/cine/cine_timing.py` (`begin()`, `stop()`, `report(checksum)`, import được nhờ `PYTHONPATH=/opt/cine`), `/opt/cine/check_syntax.py`, `/opt/cine/cine-time`, `/opt/cine/empty.py`, `/opt/cine/empty_timed.py`.
- Giao thức số đo, **chung cho mọi ngôn ngữ và cả hai cách bấm giờ**: một dòng `CINE_T <nonce> <ns> <checksum|->` ra **stderr**, với `<nonce>` lấy từ env `CINE_TIMING_NONCE`. Worker chỉ đọc dòng **cuối** mang đúng nonce.

- [ ] **Step 1: Ghim LF**

Thêm vào `.gitattributes` ở gốc repo:

```
apps/api/sandbox-images/** text eol=lf
```

- [ ] **Step 2: Bộ bấm giờ cả tiến trình**

```c
/* apps/api/sandbox-images/common/cine-time.c
 *
 * cine-time PROG [ARGS...] — bấm giờ CẢ tiến trình con bằng đồng hồ đơn điệu,
 * in "CINE_T <nonce> <ns> -" ra stderr (spec 2026-09-20 §3.5, cách bấm giờ
 * thứ hai). Không bao giờ là số đo duy nhất: bài chạy chung user, nên giả được
 * dòng này nếu cố tình — worker luôn đo thêm từ ngoài container.
 */
#define _POSIX_C_SOURCE 200809L
#include <stdio.h>
#include <stdlib.h>
#include <sys/wait.h>
#include <time.h>
#include <unistd.h>

int main(int argc, char **argv) {
  if (argc < 2) return 2;
  const char *nonce = getenv("CINE_TIMING_NONCE");
  struct timespec a, b;
  clock_gettime(CLOCK_MONOTONIC, &a);
  pid_t pid = fork();
  if (pid < 0) return 3;
  if (pid == 0) {
    execv(argv[1], argv + 1);
    _exit(127);
  }
  int status = 0;
  if (waitpid(pid, &status, 0) < 0) return 3;
  clock_gettime(CLOCK_MONOTONIC, &b);
  long long ns = (long long)(b.tv_sec - a.tv_sec) * 1000000000LL + (b.tv_nsec - a.tv_nsec);
  fprintf(stderr, "\nCINE_T %s %lld -\n", nonce ? nonce : "-", ns);
  if (WIFEXITED(status)) return WEXITSTATUS(status);
  if (WIFSIGNALED(status)) return 128 + WTERMSIG(status);
  return 1;
}
```

- [ ] **Step 3: Image C++**

```cpp
// apps/api/sandbox-images/cpp/cine_timing.h
#pragma once
// Bấm giờ TRONG tiến trình, quanh đúng lời gọi hàm của sinh viên (spec §3.5).
//
//   cine::begin();
//   auto r = f(a);
//   cine::keep(r);          // bẫy -O2: kết quả không ai dùng thì lời gọi bị bỏ
//   cine::stop();
//   cine::report(checksum(r));
//
// Số đo này giả được bởi chính bài — worker luôn đo thêm từ ngoài container.
#include <chrono>
#include <cstdio>
#include <cstdlib>

namespace cine {
inline std::chrono::steady_clock::time_point &start_() {
  static std::chrono::steady_clock::time_point t;
  return t;
}
inline std::chrono::steady_clock::time_point &stop_() {
  static std::chrono::steady_clock::time_point t;
  return t;
}
/** Như DoNotOptimize của Google Benchmark: buộc giá trị phải tồn tại thật. */
template <class T> inline void keep(T const &value) { asm volatile("" : : "r,m"(value) : "memory"); }
inline void begin() {
  asm volatile("" : : : "memory");
  start_() = std::chrono::steady_clock::now();
  asm volatile("" : : : "memory");
}
inline void stop() {
  asm volatile("" : : : "memory");
  stop_() = std::chrono::steady_clock::now();
  asm volatile("" : : : "memory");
}
inline void report(unsigned long long checksum) {
  long long ns = std::chrono::duration_cast<std::chrono::nanoseconds>(stop_() - start_()).count();
  const char *nonce = std::getenv("CINE_TIMING_NONCE");
  std::fprintf(stderr, "\nCINE_T %s %lld %llu\n", nonce ? nonce : "-", ns, checksum);
}
} // namespace cine
```

```cpp
// apps/api/sandbox-images/cpp/empty.cpp
int main() { return 0; }
```

```cpp
// apps/api/sandbox-images/cpp/empty_timed.cpp
#include <cine_timing.h>
int main() {
  cine::begin();
  cine::stop();
  cine::report(0);
  return 0;
}
```

```dockerfile
# apps/api/sandbox-images/cpp/Dockerfile — build context: apps/api/sandbox-images
FROM gcc:13
RUN useradd --uid 1000 --no-create-home --shell /usr/sbin/nologin sandbox
COPY cpp/cine_timing.h /usr/local/include/cine_timing.h
COPY common/cine-time.c cpp/empty.cpp cpp/empty_timed.cpp /opt/cine/src/
RUN gcc -O2 -o /opt/cine/cine-time /opt/cine/src/cine-time.c \
 && g++ -std=c++17 -O2 -o /opt/cine/empty /opt/cine/src/empty.cpp \
 && g++ -std=c++17 -O2 -o /opt/cine/empty-timed /opt/cine/src/empty_timed.cpp \
 && rm -rf /opt/cine/src
USER 1000:1000
```

- [ ] **Step 4: Image Python**

```python
# apps/api/sandbox-images/python/cine_run.py
"""Chạy bài Python trong một thread có stack lớn (spec 2026-09-20 §3.5).

Nâng setrecursionlimit thôi thì hết RecursionError nhưng tràn stack C, trình
thông dịch segfault, và bài đúng rơi vào "sập lúc chạy". Chạy trong một thread
có threading.stack_size lớn thì qua cả hai. run_tests và run_scaled dùng CHUNG
file này: khác cấu hình thì một bài qua test nhưng sập lúc đo.

RecursionError còn sót thoát bằng mã 86 để worker xếp riêng (recursion_limit),
không lẫn vào luật về tính đúng.
"""
import os
import runpy
import sys
import threading
import traceback

RECURSION_EXIT = 86
STACK_BYTES = 512 * 1024 * 1024
RECURSION_LIMIT = 1_000_000


def main() -> None:
    if len(sys.argv) < 2:
        os._exit(2)
    target = sys.argv[1]
    sys.argv = sys.argv[1:]
    sys.path.insert(0, os.path.dirname(os.path.abspath(target)))
    sys.setrecursionlimit(RECURSION_LIMIT)
    threading.stack_size(STACK_BYTES)
    outcome = {"code": 0}

    def run() -> None:
        try:
            runpy.run_path(target, run_name="__main__")
        except SystemExit as exc:
            code = exc.code
            outcome["code"] = code if isinstance(code, int) else (0 if code is None else 1)
        except RecursionError:
            traceback.print_exc()
            outcome["code"] = RECURSION_EXIT
        except BaseException:  # noqa: BLE001 — mọi lỗi của bài đều là "sập", không phải lỗi của harness
            traceback.print_exc()
            outcome["code"] = 1

    worker = threading.Thread(target=run)
    worker.start()
    worker.join()
    sys.stdout.flush()
    sys.stderr.flush()
    os._exit(outcome["code"])


main()
```

```python
# apps/api/sandbox-images/python/cine_timing.py
"""Bấm giờ trong tiến trình cho driver Python — cùng giao thức với cine_timing.h."""
import os
import sys
import time

_start = 0
_stop = 0


def begin() -> None:
    global _start
    _start = time.perf_counter_ns()


def stop() -> None:
    global _stop
    _stop = time.perf_counter_ns()


def report(checksum: object = "-") -> None:
    nonce = os.environ.get("CINE_TIMING_NONCE", "-")
    sys.stderr.write(f"\nCINE_T {nonce} {_stop - _start} {checksum}\n")
    sys.stderr.flush()
```

```python
# apps/api/sandbox-images/python/check_syntax.py
"""Bước "biên dịch" của Python: chỉ parse, không ghi .pyc (thư mục bài chỉ đọc)."""
import ast
import sys

bad = 0
for path in sys.argv[1:]:
    try:
        with open(path, encoding="utf-8") as handle:
            ast.parse(handle.read(), filename=path)
    except SyntaxError as exc:
        print(f"{path}:{exc.lineno}: {exc.msg}", file=sys.stderr)
        bad = 1
    except UnicodeDecodeError:
        print(f"{path}: không đọc được bằng UTF-8", file=sys.stderr)
        bad = 1
sys.exit(bad)
```

```python
# apps/api/sandbox-images/python/empty.py
```

(File rỗng, 0 byte.)

```python
# apps/api/sandbox-images/python/empty_timed.py
import cine_timing

cine_timing.begin()
cine_timing.stop()
cine_timing.report(0)
```

```dockerfile
# apps/api/sandbox-images/python/Dockerfile — build context: apps/api/sandbox-images
FROM gcc:13 AS build
COPY common/cine-time.c /src/cine-time.c
RUN gcc -O2 -static -o /cine-time /src/cine-time.c

FROM python:3.12-slim
RUN useradd --uid 1000 --no-create-home --shell /usr/sbin/nologin sandbox
COPY --from=build /cine-time /opt/cine/cine-time
COPY python/cine_run.py python/cine_timing.py python/check_syntax.py python/empty.py python/empty_timed.py /opt/cine/
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONHASHSEED=0 PYTHONPATH=/opt/cine
USER 1000:1000
```

- [ ] **Step 5: Script dựng image**

`apps/api/package.json` → `scripts`:

```json
"sandbox:images": "docker build -t cine-sandbox-cpp:1 -f sandbox-images/cpp/Dockerfile sandbox-images && docker build -t cine-sandbox-python:1 -f sandbox-images/python/Dockerfile sandbox-images",
```

- [ ] **Step 6: Dựng và thử tay**

Bật Docker. Run: `pnpm --filter api sandbox:images`
Expected: hai image dựng xong.

Run:

```bash
docker run --rm -e CINE_TIMING_NONCE=abc cine-sandbox-cpp:1 /opt/cine/empty-timed
docker run --rm -e CINE_TIMING_NONCE=abc cine-sandbox-python:1 /opt/cine/cine-time /usr/local/bin/python3 /opt/cine/cine_run.py /opt/cine/empty_timed.py
docker run --rm cine-sandbox-python:1 python3 /opt/cine/cine_run.py -c 2>/dev/null; echo "exit=$?"
```

Expected: dòng 1 in `CINE_T abc <số> 0`; dòng 2 in **hai** dòng `CINE_T abc …` (một của `cine_timing`, một của `cine-time`); dòng 3 in `exit=1` (`-c` không phải file). Kiểm `docker run --rm cine-sandbox-cpp:1 id -u` in `1000`.

- [ ] **Step 7: Commit**

```bash
git add .gitattributes apps/api/sandbox-images apps/api/package.json
git commit -m "feat(sandbox): image C++ và Python — bộ bấm giờ, cine_run.py chống tràn đệ quy (§3.5)"
```

---

### Task 3: Phần thuần của worker — tham số docker, phân loại kết cục, so output

**Files:**
- Create: `apps/api/src/sandbox-worker/docker-args.ts`, `apps/api/src/sandbox-worker/classify.ts`, `apps/api/src/sandbox-worker/comparators.ts`
- Test: `apps/api/src/sandbox-worker/docker-args.spec.ts`, `apps/api/src/sandbox-worker/classify.spec.ts`, `apps/api/src/sandbox-worker/comparators.spec.ts`

**Interfaces:**
- Consumes: `Comparator`, `SandboxLanguage`, `LimitHit`, `RECURSION_EXIT_CODE` (Task 1).
- Produces:

```ts
// docker-args.ts
export type Runtime = 'runc' | 'runsc';
export interface Hardening { runtime: Runtime; cpuset: string | null; cpus: number; memoryMb: number; pids: number; fsizeBytes: number }
export interface Mount { source: string; target: string; readonly: boolean }
export function hardenedFlags(h: Hardening): string[];
export function runArgs(p: { name: string; image: string; hardening: Hardening; mounts: Mount[]; env: Record<string, string>; interactive: boolean; detach: boolean; command: string[] }): string[];
export function execArgs(p: { container: string; env: Record<string, string>; command: string[] }): string[];
export function timeoutCommand(ms: number, command: string[]): string[];   // ['timeout', '-k', '1', '2.000', …]
// classify.ts
export type RunOutcome = 'ran' | 'timeout' | 'runtime_crash' | 'recursion_limit' | 'output_limit';
export function classifyExit(p: { exitCode: number; oomKilled: boolean | null; outputTruncated: boolean; language: SandboxLanguage; elapsedMs: number; wallMs: number }): { status: RunOutcome; limitsHit: LimitHit[] };
export function isDockerFailure(exitCode: number, stderr: string): boolean;
// comparators.ts
export class CheckerUnavailableError extends Error {}
export function normalizeLines(s: string): string[];
export function compareOutput(expected: string, got: string, c: Comparator): { equal: boolean; diff: string | null };
```

- [ ] **Step 1: Viết test hỏng**

```ts
// apps/api/src/sandbox-worker/docker-args.spec.ts
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
```

```ts
// apps/api/src/sandbox-worker/classify.spec.ts
import { classifyExit, isDockerFailure } from './classify';

const base = {
  exitCode: 0, oomKilled: false as boolean | null, outputTruncated: false, language: 'cpp' as const,
  elapsedMs: 100, wallMs: 2_000,
};

describe('classifyExit', () => {
  it('0 → ran', () => expect(classifyExit(base)).toEqual({ status: 'ran', limitsHit: [] }));
  it('124 (timeout) → timeout', () => expect(classifyExit({ ...base, exitCode: 124 }).status).toBe('timeout'));
  it('OOM → runtime_crash + memory', () =>
    expect(classifyExit({ ...base, exitCode: 137, oomKilled: true })).toEqual({ status: 'runtime_crash', limitsHit: ['memory'] }));
  it('137 sau khi đã chạy hết trần → bài chặn SIGTERM, bị KILL sau ân hạn → timeout (đã đo)', () =>
    expect(classifyExit({ ...base, exitCode: 137, elapsedMs: 3_500 })).toEqual({ status: 'timeout', limitsHit: ['time'] }));
  it('137 sớm, docker nói không OOM → runtime_crash, không gán trần nào', () =>
    expect(classifyExit({ ...base, exitCode: 137 })).toEqual({ status: 'runtime_crash', limitsHit: [] }));
  it('137 sớm qua docker exec (không có cờ OOM để hỏi) → coi là chạm trần RAM', () =>
    expect(classifyExit({ ...base, exitCode: 137, oomKilled: null }).limitsHit).toEqual(['memory']));
  it('vượt trần output thắng mọi mã thoát', () =>
    expect(classifyExit({ ...base, exitCode: 0, outputTruncated: true }).status).toBe('output_limit'));
  it('Python 86 → recursion_limit; C++ 86 → runtime_crash', () => {
    expect(classifyExit({ ...base, language: 'python', exitCode: 86 }).status).toBe('recursion_limit');
    expect(classifyExit({ ...base, exitCode: 86 }).status).toBe('runtime_crash');
  });
  it('mã khác 0 còn lại (ASan, UBSan, main trả 1) → runtime_crash', () =>
    expect(classifyExit({ ...base, exitCode: 1 }).status).toBe('runtime_crash'));
});

describe('isDockerFailure — Review Focus 2', () => {
  it('125 kèm lời của daemon → lỗi hạ tầng', () => {
    expect(isDockerFailure(125, 'docker: Error response from daemon: …')).toBe(true);
  });
  it('bài tự thoát 125 mà không có lời của docker → không phải lỗi hạ tầng', () => {
    expect(isDockerFailure(125, 'Segmentation fault')).toBe(false);
  });
  it('mã thường → không phải', () => expect(isDockerFailure(1, 'docker: x')).toBe(false));
});
```

```ts
// apps/api/src/sandbox-worker/comparators.spec.ts
import { CheckerUnavailableError, compareOutput } from './comparators';

describe('compareOutput', () => {
  it('exact: bỏ qua CRLF và khoảng trắng cuối dòng, không bỏ qua thứ tự', () => {
    expect(compareOutput('1 2 3\n', '1 2 3 \r\n', { kind: 'exact' }).equal).toBe(true);
    const r = compareOutput('1 2 3\n4\n', '1 2 3\n5\n', { kind: 'exact' });
    expect(r.equal).toBe(false);
    expect(r.diff).toMatch(/dòng 2/);
  });

  it('exact: thiếu dòng cũng là lệch', () => {
    expect(compareOutput('a\nb\n', 'a\n', { kind: 'exact' }).equal).toBe(false);
  });

  it('unordered_lines: cùng tập dòng, khác thứ tự → bằng', () => {
    expect(compareOutput('a\nb\nc\n', 'c\na\nb\n', { kind: 'unordered_lines' }).equal).toBe(true);
    expect(compareOutput('a\nb\n', 'a\na\n', { kind: 'unordered_lines' }).equal).toBe(false);
  });

  it('float_tolerance: số lệch trong eps → bằng; chữ phải khớp đúng', () => {
    const c = { kind: 'float_tolerance' as const, eps: 1e-6 };
    expect(compareOutput('0.333333\n', '0.3333333\n', c).equal).toBe(true);
    expect(compareOutput('0.3\n', '0.31\n', c).equal).toBe(false);
    expect(compareOutput('YES 1.0\n', 'NO 1.0\n', c).equal).toBe(false);
  });

  it('checker → CheckerUnavailableError, để worker trả unavailable (Review Focus 2)', () => {
    expect(() => compareOutput('', '', { kind: 'checker', name: 'duong_di' })).toThrow(CheckerUnavailableError);
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận hỏng**

Run: `pnpm --filter api test -- sandbox-worker`
Expected: FAIL — module không tồn tại.

- [ ] **Step 3: Viết code**

```ts
// apps/api/src/sandbox-worker/docker-args.ts
export type Runtime = 'runc' | 'runsc';

export interface Hardening {
  runtime: Runtime;
  cpuset: string | null;
  cpus: number;
  memoryMb: number;
  pids: number;
  fsizeBytes: number;
}

export interface Mount {
  source: string;
  target: string;
  readonly: boolean;
}

/**
 * Cờ siết cho MỌI container chạy mã sinh viên (spec 2026-09-20 §3.5).
 *
 * `--memory-swap` bằng `--memory`: không có thì swap làm trần RAM thành trần
 * RAM + swap, và một bài cấp phát vô hạn chạy chậm dần tới hết giờ thay vì
 * chạm trần — sai lớp kết cục (§4.5).
 */
export function hardenedFlags(h: Hardening): string[] {
  const flags = [
    '--network', 'none',
    '--read-only',
    '--cap-drop', 'ALL',
    '--security-opt', 'no-new-privileges',
    '--pids-limit', String(h.pids),
    '--memory', `${h.memoryMb}m`,
    '--memory-swap', `${h.memoryMb}m`,
    '--cpus', String(h.cpus),
    '--user', '1000:1000',
    '--tmpfs', '/tmp:rw,nosuid,nodev,size=64m',
    '--workdir', '/tmp',
    '--ulimit', `fsize=${h.fsizeBytes}`,
    '--ulimit', 'core=0',
    '--init',
  ];
  if (h.cpuset) flags.push('--cpuset-cpus', h.cpuset);
  if (h.runtime === 'runsc') flags.push('--runtime', 'runsc');
  return flags;
}

export function runArgs(p: {
  name: string;
  image: string;
  hardening: Hardening;
  mounts: Mount[];
  env: Record<string, string>;
  interactive: boolean;
  detach: boolean;
  command: string[];
}): string[] {
  return [
    'run',
    ...(p.interactive ? ['-i'] : []),
    ...(p.detach ? ['-d'] : []),
    '--name', p.name,
    ...hardenedFlags(p.hardening),
    ...p.mounts.flatMap((m) => [
      '--mount',
      `type=bind,source=${m.source},target=${m.target}${m.readonly ? ',readonly' : ''}`,
    ]),
    ...Object.entries(p.env).flatMap(([k, v]) => ['--env', `${k}=${v}`]),
    p.image,
    ...p.command,
  ];
}

export function execArgs(p: { container: string; env: Record<string, string>; command: string[] }): string[] {
  return ['exec', '-i', ...Object.entries(p.env).flatMap(([k, v]) => ['--env', `${k}=${v}`]), p.container, ...p.command];
}

/**
 * Trần thời gian đặt TRONG container: TERM khi hết giờ, KILL sau 1 giây nếu bài
 * chặn TERM. KHÔNG dùng `-s KILL`: khi đó `timeout` giết cả nhóm tiến trình gồm
 * chính nó và trả 137 thay vì 124 — mọi bài hết giờ trông như chạm trần RAM
 * (đo 2026-09-24).
 */
export function timeoutCommand(ms: number, command: string[]): string[] {
  return ['timeout', '-k', '1', (ms / 1000).toFixed(3), ...command];
}
```

```ts
// apps/api/src/sandbox-worker/classify.ts
import { LimitHit, RECURSION_EXIT_CODE, SandboxLanguage } from '../sandbox/contract';

export type RunOutcome = 'ran' | 'timeout' | 'runtime_crash' | 'recursion_limit' | 'output_limit';

/**
 * Mã thoát → kết cục của một ca (spec §4.5). Thứ tự các nhánh là có chủ đích:
 * vượt trần output thắng mọi thứ (worker đã tự giết container), rồi tới trần
 * RAM, rồi tới hết giờ.
 *
 * 137 = bị SIGKILL. Trong container không mạng chỉ có hai nguồn, đã đo cả hai
 * (2026-09-24): `timeout -k` giết bài chặn TERM sau khi đã chạy HẾT trần, và
 * OOM killer — `State.OOMKilled` ra `true` cho ca này, kể cả khi có `--init`.
 * `oomKilled: null` = không có cờ để hỏi (job đo dùng `docker exec`): khi đó
 * một cú KILL sớm được coi là trần RAM.
 */
export function classifyExit(p: {
  exitCode: number;
  oomKilled: boolean | null;
  outputTruncated: boolean;
  language: SandboxLanguage;
  elapsedMs: number;
  wallMs: number;
}): { status: RunOutcome; limitsHit: LimitHit[] } {
  if (p.outputTruncated) return { status: 'output_limit', limitsHit: ['output'] };
  if (p.oomKilled === true) return { status: 'runtime_crash', limitsHit: ['memory'] };
  if (p.exitCode === 0) return { status: 'ran', limitsHit: [] };
  if (p.exitCode === 124) return { status: 'timeout', limitsHit: ['time'] };
  if (p.exitCode === 137) {
    if (p.elapsedMs >= p.wallMs) return { status: 'timeout', limitsHit: ['time'] };
    return { status: 'runtime_crash', limitsHit: p.oomKilled === null ? ['memory'] : [] };
  }
  if (p.language === 'python' && p.exitCode === RECURSION_EXIT_CODE) {
    return { status: 'recursion_limit', limitsHit: [] };
  }
  return { status: 'runtime_crash', limitsHit: [] };
}

/**
 * Docker tự thất bại (125 = daemon lỗi, 126/127 = không chạy được lệnh), khác
 * với bài thoát bằng đúng mã đó. Phân biệt bằng lời của docker trên stderr:
 * không có lời đó thì coi là mã của bài. Nghiêng về phía "lỗi hạ tầng" chỉ khi
 * có bằng chứng — ngược lại thì một bài `return 125;` sẽ luôn ra unavailable.
 */
export function isDockerFailure(exitCode: number, stderr: string): boolean {
  if (exitCode < 125 || exitCode > 127) return false;
  return /^docker: |Error response from daemon|OCI runtime/m.test(stderr);
}
```

```ts
// apps/api/src/sandbox-worker/comparators.ts
import { Comparator } from '../sandbox/contract';

export class CheckerUnavailableError extends Error {
  constructor(name: string) {
    super(`checker "${name}" chưa được cài ở worker`);
    this.name = 'CheckerUnavailableError';
  }
}

export function normalizeLines(s: string): string[] {
  const lines = s.replace(/\r\n/g, '\n').split('\n').map((l) => l.replace(/[ \t]+$/, ''));
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

const clip = (s: string | undefined) =>
  s === undefined ? '(không có dòng)' : JSON.stringify(s.length > 200 ? `${s.slice(0, 200)}…` : s);

function firstLineDiff(expected: string[], got: string[]): string | null {
  const n = Math.max(expected.length, got.length);
  for (let i = 0; i < n; i++) {
    if (expected[i] !== got[i]) return `dòng ${i + 1}: mong đợi ${clip(expected[i])}, nhận ${clip(got[i])}`;
  }
  return null;
}

function numbersClose(a: string, b: string, eps: number): boolean {
  if (a === b) return true;
  const x = Number(a);
  const y = Number(b);
  if (!Number.isFinite(x) || !Number.isFinite(y) || a.trim() === '' || b.trim() === '') return false;
  return Math.abs(x - y) <= eps * Math.max(1, Math.abs(x));
}

/**
 * So output NGOÀI container (spec §3.5 luật 4): container của bài không bao
 * giờ thấy output mong đợi, nên phép so không thể chạy ở trong.
 */
export function compareOutput(expected: string, got: string, c: Comparator): { equal: boolean; diff: string | null } {
  switch (c.kind) {
    case 'exact': {
      const diff = firstLineDiff(normalizeLines(expected), normalizeLines(got));
      return { equal: diff === null, diff: diff?.slice(0, 1_024) ?? null };
    }
    case 'unordered_lines': {
      const a = normalizeLines(expected).sort();
      const b = normalizeLines(got).sort();
      const equal = firstLineDiff(a, b) === null;
      return { equal, diff: equal ? null : `tập dòng khác nhau (${a.length} dòng mong đợi, ${b.length} dòng nhận)` };
    }
    case 'float_tolerance': {
      const a = expected.trim().split(/\s+/);
      const b = got.trim().split(/\s+/);
      if (a.length !== b.length) {
        return { equal: false, diff: `số token khác nhau: mong đợi ${a.length}, nhận ${b.length}` };
      }
      const i = a.findIndex((tok, k) => !numbersClose(tok, b[k], c.eps));
      return i === -1
        ? { equal: true, diff: null }
        : { equal: false, diff: `token ${i + 1}: mong đợi ${clip(a[i])}, nhận ${clip(b[i])}` };
    }
    case 'checker':
      throw new CheckerUnavailableError(c.name);
  }
}
```

- [ ] **Step 4: Chạy test**

Run: `pnpm --filter api test -- sandbox-worker`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/sandbox-worker
git commit -m "feat(sandbox): cờ siết container, phân loại kết cục, so output ngoài container"
```

---

### Task 4: Gọi Docker CLI, và hiện thực một `FileRef`

**Files:**
- Create: `apps/api/src/sandbox-worker/docker-cli.ts`, `apps/api/src/sandbox-worker/fetch-files.ts`
- Test: `apps/api/src/sandbox-worker/docker-cli.spec.ts`, `apps/api/src/sandbox-worker/fetch-files.spec.ts`

**Interfaces:**
- Produces:

```ts
// docker-cli.ts
export interface CliResult { code: number; stdout: Buffer; stderr: string; stdoutTruncated: boolean; wallTimedOut: boolean; ns: bigint }
export interface CliOptions { stdin?: Buffer; maxStdoutBytes: number; wallMs: number; onStdoutCap?: () => void }
export interface DockerCli { run(args: string[], opts: CliOptions): Promise<CliResult> }
export class DockerUnavailableError extends Error {}
export function spawnCli(bin?: string): DockerCli;
// fetch-files.ts
export interface FetchPolicy { allowedHosts: string[]; allowHttp: boolean; maxBytes: number; fetchImpl?: typeof fetch }
export class FileFetchError extends Error {}
export function generateIntArray(n: number, lo: number, hi: number, seed: number): string;
export function materialize(ref: FileRef, policy: FetchPolicy): Promise<Buffer>;
```

Test `docker-cli` bằng chính `node` làm "docker" giả: `spawnCli(process.execPath)` với tham số `-e …`. Nhờ vậy phần trần stdout và trần thời gian được kiểm trên mọi máy, không cần Docker.

- [ ] **Step 1: Viết test hỏng**

```ts
// apps/api/src/sandbox-worker/docker-cli.spec.ts
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
```

```ts
// apps/api/src/sandbox-worker/fetch-files.spec.ts
import { createHash } from 'node:crypto';
import { FileFetchError, generateIntArray, materialize } from './fetch-files';

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const body = Buffer.from('int main() {}\n');

function fakeFetch(bytes: Buffer, status = 200) {
  return jest.fn(async () => new Response(bytes, { status })) as unknown as typeof fetch;
}
const policy = (f: typeof fetch) => ({ allowedHosts: ['files.example'], allowHttp: false, maxBytes: 1_000, fetchImpl: f });

describe('materialize', () => {
  it('inline → đúng byte', async () => {
    expect((await materialize({ kind: 'inline', content: 'ab' }, policy(fakeFetch(body)))).toString()).toBe('ab');
  });

  it('URL đúng host, đúng sha256 → nội dung', async () => {
    const f = fakeFetch(body);
    const ref = { kind: 'url' as const, url: 'https://files.example/x', sha256: sha(body), bytes: body.length };
    expect((await materialize(ref, policy(f))).equals(body)).toBe(true);
    expect(f).toHaveBeenCalledWith('https://files.example/x', expect.objectContaining({ redirect: 'error' }));
  });

  it('host ngoài danh sách → FileFetchError, không gọi mạng (chống SSRF)', async () => {
    const f = fakeFetch(body);
    const ref = { kind: 'url' as const, url: 'https://169.254.169.254/latest', sha256: sha(body), bytes: body.length };
    await expect(materialize(ref, policy(f))).rejects.toThrow(FileFetchError);
    expect(f).not.toHaveBeenCalled();
  });

  it('http khi không cho phép → FileFetchError', async () => {
    const ref = { kind: 'url' as const, url: 'http://files.example/x', sha256: sha(body), bytes: body.length };
    await expect(materialize(ref, policy(fakeFetch(body)))).rejects.toThrow(/https/);
  });

  it('lệch sha256 → FileFetchError (Review Focus 2)', async () => {
    const ref = { kind: 'url' as const, url: 'https://files.example/x', sha256: 'a'.repeat(64), bytes: body.length };
    await expect(materialize(ref, policy(fakeFetch(body)))).rejects.toThrow(/sha256/);
  });

  it('lớn hơn trần → FileFetchError', async () => {
    const big = Buffer.alloc(2_000, 97);
    const ref = { kind: 'url' as const, url: 'https://files.example/x', sha256: sha(big), bytes: big.length };
    await expect(materialize(ref, policy(fakeFetch(big)))).rejects.toThrow(/trần/);
  });
});

describe('generateIntArray', () => {
  it('tất định theo seed, đúng n phần tử, trong [lo, hi]', () => {
    const a = generateIntArray(1_000, -5, 5, 7);
    expect(a).toBe(generateIntArray(1_000, -5, 5, 7));
    const [n, nums] = a.trim().split('\n');
    expect(Number(n)).toBe(1_000);
    const xs = nums.split(' ').map(Number);
    expect(xs).toHaveLength(1_000);
    expect(xs.every((x) => x >= -5 && x <= 5)).toBe(true);
  });
  it('n = 0 → chỉ có dòng n', () => {
    expect(generateIntArray(0, 0, 1, 1)).toBe('0\n\n');
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận hỏng**

Run: `pnpm --filter api test -- docker-cli fetch-files`
Expected: FAIL.

- [ ] **Step 3: Viết code**

```ts
// apps/api/src/sandbox-worker/docker-cli.ts
import { spawn } from 'node:child_process';

export interface CliResult {
  code: number;
  stdout: Buffer;
  stderr: string;
  stdoutTruncated: boolean;
  wallTimedOut: boolean;
  /** Thời gian đo từ NGOÀI, quanh cả lời gọi CLI. */
  ns: bigint;
}

export interface CliOptions {
  stdin?: Buffer;
  maxStdoutBytes: number;
  wallMs: number;
  /** Gọi đúng một lần khi stdout chạm trần — người gọi giết container ở đây. */
  onStdoutCap?: () => void;
}

export interface DockerCli {
  run(args: string[], opts: CliOptions): Promise<CliResult>;
}

export class DockerUnavailableError extends Error {
  constructor(detail: string) {
    super(`không gọi được docker: ${detail}`);
    this.name = 'DockerUnavailableError';
  }
}

const MAX_STDERR = 64 * 1024;

/**
 * Gọi Docker CLI. Giết tiến trình CLI khi quá trần thời gian KHÔNG giết
 * container — người gọi luôn `docker rm -f` trong `finally`.
 */
export function spawnCli(bin = 'docker'): DockerCli {
  return {
    run(args, opts) {
      return new Promise((resolve, reject) => {
        const started = process.hrtime.bigint();
        const child = spawn(bin, args, { windowsHide: true });
        const chunks: Buffer[] = [];
        let size = 0;
        let truncated = false;
        let stderr = '';
        let timedOut = false;

        const timer = setTimeout(() => {
          timedOut = true;
          child.kill('SIGKILL');
        }, opts.wallMs);

        child.stdout.on('data', (d: Buffer) => {
          if (truncated) return;
          const room = opts.maxStdoutBytes - size;
          if (d.length > room) {
            chunks.push(d.subarray(0, room));
            size += room;
            truncated = true;
            opts.onStdoutCap?.();
            return;
          }
          chunks.push(d);
          size += d.length;
        });
        child.stderr.on('data', (d: Buffer) => {
          if (stderr.length < MAX_STDERR) stderr += d.toString('utf8').slice(0, MAX_STDERR - stderr.length);
        });
        // Bài đóng stdin sớm là chuyện bình thường, không phải lỗi của lời gọi.
        child.stdin.on('error', () => undefined);
        child.on('error', (error) => {
          clearTimeout(timer);
          reject(new DockerUnavailableError(error.message));
        });
        child.on('close', (code) => {
          clearTimeout(timer);
          resolve({
            code: code ?? -1,
            stdout: Buffer.concat(chunks),
            stderr,
            stdoutTruncated: truncated,
            wallTimedOut: timedOut,
            ns: process.hrtime.bigint() - started,
          });
        });

        if (opts.stdin) child.stdin.end(opts.stdin);
        else child.stdin.end();
      });
    },
  };
}
```

```ts
// apps/api/src/sandbox-worker/fetch-files.ts
import { createHash } from 'node:crypto';
import { FileRef, INLINE_MAX_CHARS } from '../sandbox/contract';

export interface FetchPolicy {
  allowedHosts: string[];
  /** Chỉ cho MinIO local trong test. Máy sandbox thật: false. */
  allowHttp: boolean;
  maxBytes: number;
  fetchImpl?: typeof fetch;
}

export class FileFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FileFetchError';
  }
}

/** xorshift32 — tất định, giống bộ sinh của fixture eval. */
function rng(seed: number) {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    return x;
  };
}

/** `n` rồi `n` số nguyên đều trong [lo, hi] — định dạng mọi driver đọc. */
export function generateIntArray(n: number, lo: number, hi: number, seed: number): string {
  const next = rng(seed);
  const span = hi - lo + 1;
  const out: string[] = new Array(n);
  for (let i = 0; i < n; i++) {
    // Hai lượt 32 bit cho dải rộng hơn 2^32.
    const r = next() * 4294967296 + next();
    out[i] = String(lo + (r % span));
  }
  return `${n}\n${out.join(' ')}\n`;
}

async function readCapped(res: Response, max: number): Promise<Buffer> {
  if (!res.body) return Buffer.alloc(0);
  const reader = res.body.getReader();
  const parts: Buffer[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) {
      await reader.cancel();
      throw new FileFetchError(`file vượt trần ${max} byte`);
    }
    parts.push(Buffer.from(value));
  }
  return Buffer.concat(parts);
}

/**
 * Biến một `FileRef` thành byte. Mọi lỗi ở đây là lỗi HẠ TẦNG (FileFetchError
 * → job `unavailable`), không bao giờ là lỗi của bài.
 */
export async function materialize(ref: FileRef, policy: FetchPolicy): Promise<Buffer> {
  switch (ref.kind) {
    case 'inline': {
      if (ref.content.length > INLINE_MAX_CHARS) throw new FileFetchError('nội dung inline vượt trần');
      return Buffer.from(ref.content, 'utf8');
    }
    case 'generate':
      return Buffer.from(generateIntArray(ref.n, ref.lo, ref.hi, ref.seed), 'utf8');
    case 'url': {
      let url: URL;
      try {
        url = new URL(ref.url);
      } catch {
        throw new FileFetchError('URL không hợp lệ');
      }
      if (url.protocol !== 'https:' && !(policy.allowHttp && url.protocol === 'http:')) {
        throw new FileFetchError('chỉ tải qua https');
      }
      // So cả host lẫn cổng: allowlist ghi `host` hoặc `host:port`.
      if (!policy.allowedHosts.includes(url.host) && !policy.allowedHosts.includes(url.hostname)) {
        throw new FileFetchError(`host ${url.host} không nằm trong SANDBOX_ALLOWED_DOWNLOAD_HOSTS`);
      }
      const max = Math.min(policy.maxBytes, ref.bytes);
      const f = policy.fetchImpl ?? fetch;
      let res: Response;
      try {
        res = await f(ref.url, { redirect: 'error', signal: AbortSignal.timeout(30_000) });
      } catch (error) {
        throw new FileFetchError(`tải file thất bại: ${error instanceof Error ? error.message : String(error)}`);
      }
      if (!res.ok) throw new FileFetchError(`tải file trả HTTP ${res.status}`);
      const bytes = await readCapped(res, max);
      if (createHash('sha256').update(bytes).digest('hex') !== ref.sha256) {
        throw new FileFetchError('sha256 của file tải về không khớp');
      }
      return bytes;
    }
  }
}
```

- [ ] **Step 4: Chạy test**

Run: `pnpm --filter api test -- docker-cli fetch-files`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/sandbox-worker/docker-cli.ts apps/api/src/sandbox-worker/docker-cli.spec.ts apps/api/src/sandbox-worker/fetch-files.ts apps/api/src/sandbox-worker/fetch-files.spec.ts
git commit -m "feat(sandbox): gọi Docker CLI có trần stdout và thời gian; tải file theo allowlist + sha256"
```

---

### Task 5: Biên dịch, chạy một ca, và job kiểm tính đúng

**Files:**
- Create: `apps/api/src/sandbox-worker/programs.ts`, `apps/api/src/sandbox-worker/handle-exec.ts`, `apps/api/src/sandbox-worker/testing/fake-docker.ts`
- Test: `apps/api/src/sandbox-worker/handle-exec.spec.ts`

**Interfaces:**
- Consumes: Task 1, 3, 4.
- Produces:

```ts
// programs.ts
export class InfraError extends Error {}
export interface RunnerEnv { docker: DockerCli; runtime: Runtime; images: Record<SandboxLanguage, string>; fetchPolicy: FetchPolicy }
export const DRIVER_FILE: Record<SandboxLanguage, string>;           // __cine_driver.cpp / .py
export const COMPILE_MS = 60_000;
export const DOCKER_SLACK_MS = 20_000;
export function containerName(): string;
export function removeContainer(docker: DockerCli, name: string): Promise<void>;
export function writeProgram(dir: string, language: SandboxLanguage, program: ProgramSpec, policy: FetchPolicy): Promise<{ entry: string }>;
export function compile(env: RunnerEnv, p: { language: SandboxLanguage; srcDir: string; outDir: string; sanitize: boolean; cpuset: string | null }): Promise<CompileInfo>;
export function runCase(env: RunnerEnv, p: { language: SandboxLanguage; workDir: string; entry: string; stdin: Buffer; limits: Limits; sanitize: boolean; cpuset: string | null }): Promise<{ status: RunOutcome; stdout: Buffer; ms: number; limitsHit: LimitHit[] }>;
// handle-exec.ts
export interface WorkerDeps { runner: RunnerEnv; host: HostFingerprint; workRoot: string }
export function jobIdOf(raw: unknown): string;
export function describeError(error: unknown): string;
export function handleExec(raw: unknown, deps: WorkerDeps, cpuset: string | null): Promise<ExecResult>;
// testing/fake-docker.ts
export interface FakeCall { args: string[]; stdin: Buffer | undefined; mounted: Record<string, string> }
export type FakeRule = (call: FakeCall) => Partial<CliResult> | undefined;
export class FakeDocker implements DockerCli { calls: FakeCall[]; constructor(rules: FakeRule[], opts?: { throwOnFirst?: Error }) }
export const TEST_HOST: HostFingerprint;
export function testDeps(docker: DockerCli, workRoot: string): WorkerDeps;
export const isCompile, isCase, isExec, isTop, isDetachedRun: (c: FakeCall) => boolean;
export function envOf(c: FakeCall, key: string): string | null;
export function mountSource(c: FakeCall, target: string): string | null;
```

Bố cục một job trên đĩa, và **cái gì được mount vào đâu**. Đây là toàn bộ nội dung của cô lập đọc (§3.5 luật 4):

| Thư mục | Chứa | Mount vào container nào |
|---|---|---|
| `<job>/src` | Mã bài nộp + driver (`__cine_driver.*`) | Container biên dịch (`/src`, chỉ đọc); Python: cả container của ca (`/work`, chỉ đọc) |
| `<job>/bin` | `a.out` do bước biên dịch ghi | Container biên dịch (`/out`, ghi được); C++: container của ca (`/work`, chỉ đọc) |
| — | Input của ca | **Không mount** — đi qua stdin |
| — | Output mong đợi | **Không bao giờ ra đĩa** — chỉ nằm trong bộ nhớ worker |

- [ ] **Step 1: Docker giả cho unit test**

```ts
// apps/api/src/sandbox-worker/testing/fake-docker.ts
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { HostFingerprint } from '../../sandbox/contract';
import { CliOptions, CliResult, DockerCli } from '../docker-cli';
import { WorkerDeps } from '../handle-exec';

export interface FakeCall {
  args: string[];
  stdin: Buffer | undefined;
  /** Mọi file container NÀY sẽ thấy qua mount, chụp đúng lúc gọi: `<target>/<đường dẫn>` → nội dung. */
  mounted: Record<string, string>;
}
export type FakeRule = (call: FakeCall) => Partial<CliResult> | undefined;

function snapshot(dir: string, target: string, into: Record<string, string>) {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of names) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) snapshot(path, target, into);
    else into[`${target}/${relative(dir, path).replace(/\\/g, '/')}`] = readFileSync(path, 'utf8');
  }
}

export function mountSource(c: FakeCall, target: string): string | null {
  for (let i = 0; i < c.args.length - 1; i++) {
    if (c.args[i] !== '--mount') continue;
    const fields = Object.fromEntries(c.args[i + 1].split(',').map((kv) => kv.split('=') as [string, string]));
    if (fields.target === target) return fields.source;
  }
  return null;
}

/** Docker giả: ghi lại mọi lời gọi, trả lời theo luật đầu tiên khớp. Không luật nào khớp → mã 0, rỗng. */
export class FakeDocker implements DockerCli {
  readonly calls: FakeCall[] = [];
  constructor(
    private readonly rules: FakeRule[],
    private readonly opts: { throwOnFirst?: Error } = {},
  ) {}

  async run(args: string[], opts: CliOptions): Promise<CliResult> {
    if (this.opts.throwOnFirst && this.calls.length === 0) {
      this.calls.push({ args, stdin: opts.stdin, mounted: {} });
      throw this.opts.throwOnFirst;
    }
    const mounted: Record<string, string> = {};
    for (let i = 0; i < args.length - 1; i++) {
      if (args[i] !== '--mount') continue;
      const fields = Object.fromEntries(args[i + 1].split(',').map((kv) => kv.split('=') as [string, string]));
      snapshot(fields.source, fields.target, mounted);
    }
    const call = { args, stdin: opts.stdin, mounted };
    this.calls.push(call);
    for (const rule of this.rules) {
      const r = rule(call);
      if (r) {
        return { code: 0, stdout: Buffer.alloc(0), stderr: '', stdoutTruncated: false, wallTimedOut: false, ns: 1_000_000n, ...r };
      }
    }
    return { code: 0, stdout: Buffer.alloc(0), stderr: '', stdoutTruncated: false, wallTimedOut: false, ns: 1_000_000n };
  }
}

const text = (c: FakeCall) => c.args.join(' ');
export const isCompile = (c: FakeCall) => c.args[0] === 'run' && /g\+\+ |check_syntax\.py/.test(text(c));
export const isCase = (c: FakeCall) => c.args[0] === 'run' && c.args.includes('-i');
export const isDetachedRun = (c: FakeCall) => c.args[0] === 'run' && c.args.includes('-d');
export const isExec = (c: FakeCall) => c.args[0] === 'exec';
export const isTop = (c: FakeCall) => c.args[0] === 'top';

export function envOf(c: FakeCall, key: string): string | null {
  for (let i = 0; i < c.args.length - 1; i++) {
    if (c.args[i] === '--env' && c.args[i + 1].startsWith(`${key}=`)) return c.args[i + 1].slice(key.length + 1);
  }
  return null;
}

export const TEST_HOST: HostFingerprint = {
  hostname: 'test', cpuModel: 'test', cpuCount: 4, kernel: 'test', runtime: 'runc',
  dockerVersion: 'test', images: { cpp: 'sha256:cpp', python: 'sha256:py' }, workerVersion: 'test',
};

export function testDeps(docker: DockerCli, workRoot: string): WorkerDeps {
  return {
    runner: {
      docker,
      runtime: 'runc',
      images: { cpp: 'cpp-img', python: 'py-img' },
      fetchPolicy: { allowedHosts: [], allowHttp: false, maxBytes: 1_000_000 },
    },
    host: TEST_HOST,
    workRoot,
  };
}
```

- [ ] **Step 2: Viết test hỏng**

```ts
// apps/api/src/sandbox-worker/handle-exec.spec.ts
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
```

- [ ] **Step 3: Chạy test, xác nhận hỏng**

Run: `pnpm --filter api test -- handle-exec`
Expected: FAIL — module không tồn tại.

- [ ] **Step 4: Viết `programs.ts`**

```ts
// apps/api/src/sandbox-worker/programs.ts
import { randomBytes } from 'node:crypto';
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { CompileInfo, LimitHit, Limits, ProgramSpec, SandboxLanguage } from '../sandbox/contract';
import { classifyExit, isDockerFailure, RunOutcome } from './classify';
import { Mount, Runtime, runArgs, timeoutCommand } from './docker-args';
import { DockerCli } from './docker-cli';
import { FetchPolicy, materialize } from './fetch-files';

const MiB = 1024 * 1024;
export const COMPILE_MS = 60_000;
/** Docker phải trả lời trong trần của ca cộng khoảng này; không thì là lỗi hạ tầng. */
export const DOCKER_SLACK_MS = 20_000;

/** Lỗi không chứng minh được là của bài → job `unavailable` (spec §4.4). */
export class InfraError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InfraError';
  }
}

export interface RunnerEnv {
  docker: DockerCli;
  runtime: Runtime;
  images: Record<SandboxLanguage, string>;
  fetchPolicy: FetchPolicy;
}

export const DRIVER_FILE: Record<SandboxLanguage, string> = {
  cpp: '__cine_driver.cpp',
  python: '__cine_driver.py',
};

export function containerName(): string {
  return `cine-${randomBytes(6).toString('hex')}`;
}

export async function removeContainer(docker: DockerCli, name: string): Promise<void> {
  await docker.run(['rm', '-f', name], { maxStdoutBytes: 1_024, wallMs: 30_000 }).catch(() => undefined);
}

async function oomKilled(docker: DockerCli, name: string): Promise<boolean> {
  const r = await docker.run(['inspect', '--format', '{{.State.OOMKilled}}', name], { maxStdoutBytes: 64, wallMs: 30_000 });
  return r.code === 0 && r.stdout.toString('utf8').trim() === 'true';
}

/**
 * Ghi mã của MỘT chương trình ra `dir`. Chỉ mã bài và driver — không bao giờ
 * input hay output mong đợi của ca nào (spec §3.5 luật 4).
 */
export async function writeProgram(
  dir: string,
  language: SandboxLanguage,
  program: ProgramSpec,
  policy: FetchPolicy,
): Promise<{ entry: string }> {
  await mkdir(dir, { recursive: true });
  await chmod(dir, 0o755);
  for (const file of program.files) {
    const target = join(dir, ...file.path.split('/'));
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, await materialize(file.ref, policy), { mode: 0o644 });
  }
  if (program.driver) {
    await writeFile(join(dir, DRIVER_FILE[language]), await materialize(program.driver, policy), { mode: 0o644 });
  }
  if (language === 'cpp') return { entry: 'a.out' };
  if (program.driver) return { entry: DRIVER_FILE.python };
  const entry = program.entry!;
  if (!program.files.some((f) => f.path === entry)) {
    throw new InfraError(`entry ${entry} không có trong bài nộp — job dựng sai`);
  }
  return { entry };
}

/**
 * C++: g++ vào `outDir/a.out`. Python: chỉ parse (`check_syntax.py`) — thư mục
 * bài chỉ đọc nên không ghi được .pyc, và cũng không cần.
 *
 * Tên file đã qua `safePath` của hợp đồng (không khoảng trắng, không ký tự
 * shell), nên `sh -c` với `$(find …)` ở đây không tách sai được.
 */
export async function compile(
  env: RunnerEnv,
  p: { language: SandboxLanguage; srcDir: string; outDir: string; sanitize: boolean; cpuset: string | null },
): Promise<CompileInfo> {
  const started = Date.now();
  const name = containerName();
  let script: string;
  const mounts: Mount[] = [{ source: p.srcDir, target: '/src', readonly: true }];
  if (p.language === 'cpp') {
    await mkdir(p.outDir, { recursive: true });
    // uid 1000 trong container phải ghi được a.out vào đây (Review Focus 5).
    await chmod(p.outDir, 0o777);
    mounts.push({ source: p.outDir, target: '/out', readonly: false });
    const flags = ['-std=c++17', '-O2', ...(p.sanitize ? ['-fsanitize=address,undefined', '-fno-sanitize-recover=all'] : [])];
    script = `g++ ${flags.join(' ')} -I/src -o /out/a.out $(find /src -name '*.cpp' | sort)`;
  } else {
    script = "find /src -name '*.py' | sort | xargs -r python3 /opt/cine/check_syntax.py";
  }
  const args = runArgs({
    name,
    image: env.images[p.language],
    hardening: { runtime: env.runtime, cpuset: p.cpuset, cpus: 1, memoryMb: 1_536, pids: 128, fsizeBytes: 256 * MiB },
    mounts,
    env: {},
    interactive: false,
    detach: false,
    command: timeoutCommand(COMPILE_MS, ['sh', '-c', script]),
  });
  try {
    const r = await env.docker.run(args, { maxStdoutBytes: 64 * 1_024, wallMs: COMPILE_MS + DOCKER_SLACK_MS });
    if (r.wallTimedOut) throw new InfraError('docker không trả lời trong hạn biên dịch');
    if (isDockerFailure(r.code, r.stderr)) throw new InfraError(`docker lỗi khi biên dịch: ${r.stderr.slice(0, 300)}`);
    const log = r.code === 124 ? 'biên dịch quá 60 giây' : `${r.stdout.toString('utf8')}${r.stderr}`;
    return { ok: r.code === 0, log: log.slice(0, 16_384), ms: Date.now() - started };
  } finally {
    await removeContainer(env.docker, name);
  }
}

/**
 * Chạy MỘT ca trong một container MỚI (spec §3.5 luật 5). Input qua stdin,
 * không bao giờ qua mount. Trần thời gian đặt trong container (`timeout`);
 * trần của worker chỉ bắt docker treo.
 */
export async function runCase(
  env: RunnerEnv,
  p: {
    language: SandboxLanguage;
    workDir: string;
    entry: string;
    stdin: Buffer;
    limits: Limits;
    sanitize: boolean;
    cpuset: string | null;
  },
): Promise<{ status: RunOutcome; stdout: Buffer; ms: number; limitsHit: LimitHit[] }> {
  const name = containerName();
  // ASan ăn RAM gấp 2–3 lần (§3.5): lượt có sanitizer có trần riêng.
  const memoryMb = p.sanitize ? Math.min(p.limits.memoryMb * 3, 2_048) : p.limits.memoryMb;
  const target =
    p.language === 'cpp' ? ['/work/a.out'] : ['python3', '/opt/cine/cine_run.py', `/work/${p.entry}`];
  const args = runArgs({
    name,
    image: env.images[p.language],
    hardening: { runtime: env.runtime, cpuset: p.cpuset, cpus: 1, memoryMb, pids: p.limits.pids, fsizeBytes: 64 * MiB },
    mounts: [{ source: p.workDir, target: '/work', readonly: true }],
    env: { ASAN_OPTIONS: 'detect_leaks=0', UBSAN_OPTIONS: 'print_stacktrace=0' },
    interactive: true,
    detach: false,
    command: timeoutCommand(p.limits.wallMsPerCase, target),
  });
  try {
    const r = await env.docker.run(args, {
      stdin: p.stdin,
      maxStdoutBytes: p.limits.outputBytes,
      wallMs: p.limits.wallMsPerCase + DOCKER_SLACK_MS,
      onStdoutCap: () => void env.docker.run(['kill', name], { maxStdoutBytes: 64, wallMs: 30_000 }).catch(() => undefined),
    });
    if (r.wallTimedOut) throw new InfraError('docker không trả lời trong hạn của ca');
    if (isDockerFailure(r.code, r.stderr)) throw new InfraError(`docker lỗi: ${r.stderr.slice(0, 300)}`);
    const ms = Number(r.ns / 1_000_000n);
    const c = classifyExit({
      exitCode: r.code,
      oomKilled: await oomKilled(env.docker, name),
      outputTruncated: r.stdoutTruncated,
      language: p.language,
      elapsedMs: ms,
      wallMs: p.limits.wallMsPerCase,
    });
    return { ...c, stdout: r.stdout, ms };
  } finally {
    await removeContainer(env.docker, name);
  }
}
```

- [ ] **Step 5: Viết `handle-exec.ts`**

```ts
// apps/api/src/sandbox-worker/handle-exec.ts
import { chmod, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import {
  CaseStatus,
  execJob,
  ExecResult,
  HostFingerprint,
  SANDBOX_CONTRACT_VERSION,
  unavailableExec,
} from '../sandbox/contract';
import { compareOutput } from './comparators';
import { materialize } from './fetch-files';
import { compile, RunnerEnv, runCase, writeProgram } from './programs';

export interface WorkerDeps {
  runner: RunnerEnv;
  host: HostFingerprint;
  workRoot: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

/** jobId của một payload chưa qua kiểm — để kết quả unavailable vẫn trỏ đúng job. */
export function jobIdOf(raw: unknown): string {
  const id = (raw as { jobId?: unknown } | null)?.jobId;
  return typeof id === 'string' && UUID.test(id) ? id : NIL_UUID;
}

export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Job kiểm tính đúng. Mọi lỗi ném ra từ đây đều thành `unavailable` — kể cả
 * lỗi lập trình của chính worker — vì luật chốt của §4.4: không CHỨNG MINH
 * được lỗi thuộc về bài thì không được để nó trông như bài sai.
 */
export async function handleExec(raw: unknown, deps: WorkerDeps, cpuset: string | null): Promise<ExecResult> {
  const parsed = execJob.safeParse(raw);
  if (!parsed.success) {
    return unavailableExec(jobIdOf(raw), `job sai schema: ${parsed.error.issues[0]?.message ?? 'không rõ'}`, deps.host);
  }
  const job = parsed.data;
  if (job.comparator.kind === 'checker') {
    return unavailableExec(job.jobId, `checker "${job.comparator.name}" chưa được cài ở worker`, deps.host);
  }

  const started = Date.now();
  const dir = await mkdtemp(join(deps.workRoot, 'exec-'));
  try {
    // mkdtemp tạo 0700 — uid 1000 trong container không vào được (Review Focus 5).
    await chmod(dir, 0o755);
    const src = join(dir, 'src');
    const bin = join(dir, 'bin');
    const { entry } = await writeProgram(src, job.language, job.program, deps.runner.fetchPolicy);
    const sanitize = job.language === 'cpp' && job.sanitize;
    const compiled = await compile(deps.runner, { language: job.language, srcDir: src, outDir: bin, sanitize, cpuset });
    const base = {
      contract: SANDBOX_CONTRACT_VERSION,
      kind: 'exec' as const,
      jobId: job.jobId,
      host: deps.host,
      compile: compiled,
      unavailable: null,
    };
    if (!compiled.ok) return { ...base, cases: [], totalMs: Date.now() - started };

    const cases: ExecResult['cases'] = [];
    for (const c of job.cases) {
      const r = await runCase(deps.runner, {
        language: job.language,
        workDir: job.language === 'cpp' ? bin : src,
        entry,
        stdin: await materialize(c.stdin, deps.runner.fetchPolicy),
        limits: job.limits,
        sanitize,
        cpuset,
      });
      let status: CaseStatus = r.status;
      let diff: string | null = null;
      let stdout: string | null = null;
      if (r.status === 'ran') {
        if (c.expected === null) {
          stdout = r.stdout.toString('utf8').slice(0, 65_536);
        } else {
          // Output mong đợi hiện thực SAU khi container của ca đã bị xoá, và chỉ
          // trong bộ nhớ (§3.5 luật 4).
          const expected = (await materialize(c.expected, deps.runner.fetchPolicy)).toString('utf8');
          const cmp = compareOutput(expected, r.stdout.toString('utf8'), job.comparator);
          status = cmp.equal ? 'pass' : 'fail';
          diff = cmp.diff;
        }
      }
      cases.push({ name: c.name, group: c.group, status, ms: r.ms, stdout, diff, limitsHit: r.limitsHit });
    }
    return { ...base, cases, totalMs: Date.now() - started };
  } catch (error) {
    return unavailableExec(job.jobId, describeError(error), deps.host);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
```

- [ ] **Step 6: Chạy test**

Run: `pnpm --filter api test -- handle-exec`
Expected: PASS (ca Review Focus 5 là *skipped* trên Windows; chạy lại trên máy Linux ở Task 9).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/sandbox-worker
git commit -m "feat(sandbox): job kiểm tính đúng — mỗi ca một container, so ngoài, lỗi hạ tầng ra unavailable (T-ISO-6 unit)"
```

---

### Task 6: Job đo

**Files:**
- Create: `apps/api/src/sandbox-worker/handle-measure.ts`
- Create: `apps/api/src/sandbox-worker/slots.ts` (chỉ `cpusetCores`, `cpusetSize` ở task này; Task 8 thêm phần còn lại)
- Test: `apps/api/src/sandbox-worker/handle-measure.spec.ts`

**Interfaces:**
- Consumes: Task 1, 3, 4, 5.
- Produces:

```ts
// handle-measure.ts
export const BASELINE_RUNS = 5;
export const EXPECTED_PROCESSES = 2;   // docker-init + sleep
export function parseTiming(stderr: string, nonce: string): { ns: number; checksum: string | null } | null;
export function timedCommand(language: SandboxLanguage, mode: 'in_process' | 'process', entry: string | null): string[];
export function handleMeasure(raw: unknown, deps: WorkerDeps, slot: string | null): Promise<MeasureResult>;
// slots.ts
export function cpusetCores(set: string): number[];   // "2-3,5" → [2, 3, 5]
export function cpusetSize(set: string): number;
```

Thứ tự đo trong một job, viết ra vì cả hai chốt của §3.1 dựa vào nó:

1. Biên dịch bài và đáp án mẫu, **không** sanitizer, ghim vào khe đo.
2. Khởi động hai container, mỗi bên một (`sleep infinity` sau `--init`).
3. Baseline: chạy chương trình rỗng `BASELINE_RUNS` lần trong **mỗi** container, cùng cách bấm giờ. Đây là hằng số `c`.
4. Lượt `r` = 0…`repeats`−1, với mỗi điểm `n`: lượt chẵn đo bài rồi tới đáp án mẫu, lượt lẻ đo đáp án mẫu trước. Đổi thứ tự như vậy để trôi nhiệt hay trôi tần số CPU không luôn rơi vào cùng một bên.
5. Sau **mỗi** mẫu: đếm tiến trình trong container. Có tiến trình dư, hoặc container đã chết: nếu là bài thì dừng với `aborted: 'interference'`; nếu là đáp án mẫu thì `unavailable`.

- [ ] **Step 1: Viết test hỏng**

```ts
// apps/api/src/sandbox-worker/handle-measure.spec.ts
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
    const docker = new FakeDocker([
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
```

`targetOf` đọc tên container trong lời gọi `exec`: theo `execArgs`, tên container đứng ngay sau cặp `--env CINE_TIMING_NONCE=…`.

- [ ] **Step 2: Chạy test, xác nhận hỏng**

Run: `pnpm --filter api test -- handle-measure`
Expected: FAIL.

- [ ] **Step 3: Viết `slots.ts` (phần cpuset)**

```ts
// apps/api/src/sandbox-worker/slots.ts
const CPUSET = /^\d+(-\d+)?(,\d+(-\d+)?)*$/;

/** "2-3,5" → [2, 3, 5]. Cú pháp của `--cpuset-cpus`. */
export function cpusetCores(set: string): number[] {
  if (!CPUSET.test(set)) throw new Error(`cpuset không hợp lệ: ${JSON.stringify(set)}`);
  const cores = new Set<number>();
  for (const part of set.split(',')) {
    const [a, b] = part.split('-').map(Number);
    for (let c = a; c <= (b ?? a); c++) cores.add(c);
  }
  return [...cores].sort((x, y) => x - y);
}

export function cpusetSize(set: string): number {
  return cpusetCores(set).length;
}
```

- [ ] **Step 4: Viết `handle-measure.ts`**

```ts
// apps/api/src/sandbox-worker/handle-measure.ts
import { randomBytes } from 'node:crypto';
import { chmod, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import {
  CompileInfo,
  MeasureJob,
  measureJob,
  MeasureResult,
  MeasureSample,
  ProgramSpec,
  SANDBOX_CONTRACT_VERSION,
  SandboxLanguage,
  unavailableMeasure,
} from '../sandbox/contract';
import { classifyExit, isDockerFailure } from './classify';
import { execArgs, runArgs, timeoutCommand } from './docker-args';
import { materialize } from './fetch-files';
import { describeError, jobIdOf, WorkerDeps } from './handle-exec';
import { compile, containerName, DOCKER_SLACK_MS, InfraError, removeContainer, writeProgram } from './programs';
import { cpusetSize } from './slots';

const MiB = 1024 * 1024;
export const BASELINE_RUNS = 5;
/** docker-init (PID 1, do `--init`) + `sleep infinity`. Hơn thế là tiến trình nền của bài. */
export const EXPECTED_PROCESSES = 2;
const MAX_TIMED_STDOUT = 64 * 1024;

type Who = 'submission' | 'reference';
interface Running {
  who: Who;
  container: string;
  entry: string;
}

/** Container của bài biến mất giữa chừng — chính bài đã giết nó. */
class ContainerGone extends Error {}

/**
 * Dòng số đo CUỐI mang đúng mã của mẫu. Mã chặn các lệnh in vô tình; nó
 * không chặn được bài cố tình đọc env — việc đó là của số đo ngoài (§3.5).
 */
export function parseTiming(stderr: string, nonce: string): { ns: number; checksum: string | null } | null {
  let found: { ns: number; checksum: string | null } | null = null;
  for (const m of stderr.matchAll(/^CINE_T (\S+) (\d+) (\S+)$/gm)) {
    if (m[1] !== nonce) continue;
    found = { ns: Number(m[2]), checksum: m[3] === '-' ? null : m[3].slice(0, 64) };
  }
  return found;
}

/** `entry` null = baseline: chương trình rỗng của image, cùng cách bấm giờ. */
export function timedCommand(language: SandboxLanguage, mode: 'in_process' | 'process', entry: string | null): string[] {
  let target: string[];
  if (language === 'cpp') {
    target = [entry === null ? (mode === 'in_process' ? '/opt/cine/empty-timed' : '/opt/cine/empty') : `/work/${entry}`];
  } else {
    const file = entry === null ? (mode === 'in_process' ? '/opt/cine/empty_timed.py' : '/opt/cine/empty.py') : `/work/${entry}`;
    target = ['/usr/local/bin/python3', '/opt/cine/cine_run.py', file];
  }
  // cine-time execv đường dẫn tuyệt đối — nên python3 phải là đường dẫn đầy đủ.
  return mode === 'process' ? ['/opt/cine/cine-time', ...target] : target;
}

async function startContainer(deps: WorkerDeps, job: MeasureJob, name: string, workDir: string, slot: string | null) {
  const args = runArgs({
    name,
    image: deps.runner.images[job.language],
    hardening: {
      runtime: deps.runner.runtime,
      cpuset: slot,
      cpus: slot ? cpusetSize(slot) : 1,
      memoryMb: job.limits.memoryMb,
      pids: job.limits.pids,
      fsizeBytes: 64 * MiB,
    },
    mounts: [{ source: workDir, target: '/work', readonly: true }],
    env: {},
    interactive: false,
    detach: true,
    command: ['sleep', 'infinity'],
  });
  const r = await deps.runner.docker.run(args, { maxStdoutBytes: 4_096, wallMs: 60_000 });
  if (r.code !== 0) throw new InfraError(`không khởi động được container đo: ${r.stderr.slice(0, 300)}`);
}

async function isRunning(deps: WorkerDeps, container: string): Promise<boolean> {
  const r = await deps.runner.docker.run(['inspect', '--format', '{{.State.Running}}', container], {
    maxStdoutBytes: 64,
    wallMs: 30_000,
  });
  if (r.code !== 0 && !/No such (object|container)/i.test(r.stderr)) {
    throw new InfraError(`docker inspect lỗi: ${r.stderr.slice(0, 300)}`);
  }
  return r.code === 0 && r.stdout.toString('utf8').trim() === 'true';
}

/** Container còn sạch: còn chạy, và chỉ có docker-init + sleep. */
async function isClean(deps: WorkerDeps, container: string): Promise<boolean> {
  const r = await deps.runner.docker.run(['top', container], { maxStdoutBytes: 64 * 1024, wallMs: 30_000 });
  if (r.code !== 0) {
    if (await isRunning(deps, container)) throw new InfraError(`docker top lỗi: ${r.stderr.slice(0, 300)}`);
    return false;
  }
  const rows = r.stdout.toString('utf8').split('\n').filter((l) => l.trim() !== '');
  return rows.length - 1 <= EXPECTED_PROCESSES;
}

async function sample(
  deps: WorkerDeps,
  job: MeasureJob,
  p: Running,
  stdin: Buffer | null,
): Promise<Pick<MeasureSample, 'status' | 'innerNs' | 'outerNs' | 'checksum'>> {
  const nonce = randomBytes(8).toString('hex');
  const command = timeoutCommand(job.limits.wallMsPerCase, timedCommand(job.language, job.timingMode, stdin === null ? null : p.entry));
  const r = await deps.runner.docker.run(
    // Chỉ mã của mẫu: lượt đo không có sanitizer (§3.5), nên không cần ASAN_OPTIONS.
    execArgs({ container: p.container, env: { CINE_TIMING_NONCE: nonce }, command }),
    { stdin: stdin ?? undefined, maxStdoutBytes: MAX_TIMED_STDOUT, wallMs: job.limits.wallMsPerCase + DOCKER_SLACK_MS },
  );
  if (r.wallTimedOut) throw new InfraError('docker exec không trả lời trong hạn');
  if (isDockerFailure(r.code, r.stderr)) {
    if (!(await isRunning(deps, p.container))) throw new ContainerGone();
    throw new InfraError(`docker exec lỗi: ${r.stderr.slice(0, 300)}`);
  }
  const c = classifyExit({
    exitCode: r.code,
    oomKilled: null, // docker exec: không có cờ OOM theo từng lần chạy
    outputTruncated: r.stdoutTruncated,
    language: job.language,
    elapsedMs: Number(r.ns / 1_000_000n),
    wallMs: job.limits.wallMsPerCase,
  });
  const timing = c.status === 'ran' ? parseTiming(r.stderr, nonce) : null;
  const stdoutChecksum = job.timingMode === 'process' ? r.stdout.toString('utf8').trim().slice(0, 64) || null : null;
  return {
    status: c.status === 'ran' ? 'ok' : c.status,
    innerNs: timing?.ns ?? null,
    outerNs: Number(r.ns),
    checksum: timing?.checksum ?? stdoutChecksum,
  };
}

/**
 * Job đo (spec §3.1, §3.5). Trả MẪU THÔ — khớp độ phức tạp là việc của bước 4.
 * Khác job kiểm: mỗi chương trình giữ MỘT container suốt job, vì khởi động
 * container mỗi mẫu nhét nhiễu của Docker vào đúng phép đo.
 */
export async function handleMeasure(raw: unknown, deps: WorkerDeps, slot: string | null): Promise<MeasureResult> {
  const parsed = measureJob.safeParse(raw);
  if (!parsed.success) {
    return unavailableMeasure(jobIdOf(raw), `job sai schema: ${parsed.error.issues[0]?.message ?? 'không rõ'}`, deps.host);
  }
  const job = parsed.data;
  const startedAt = new Date().toISOString();
  const base = {
    contract: SANDBOX_CONTRACT_VERSION,
    kind: 'measure' as const,
    jobId: job.jobId,
    host: deps.host,
    slot,
    timingMode: job.timingMode,
    startedAt,
  };
  const dir = await mkdtemp(join(deps.workRoot, 'measure-'));
  const containers: string[] = [];
  try {
    await chmod(dir, 0o755);
    const programs: { who: Who; spec: ProgramSpec }[] = [
      { who: 'submission', spec: job.submission },
      ...(job.reference ? [{ who: 'reference' as const, spec: job.reference }] : []),
    ];
    const compiled: Partial<Record<Who, CompileInfo>> = {};
    const running: Running[] = [];
    for (const p of programs) {
      const src = join(dir, `${p.who}-src`);
      const bin = join(dir, `${p.who}-bin`);
      const { entry } = await writeProgram(src, job.language, p.spec, deps.runner.fetchPolicy);
      const info = await compile(deps.runner, { language: job.language, srcDir: src, outDir: bin, sanitize: false, cpuset: slot });
      compiled[p.who] = info;
      if (!info.ok) {
        if (p.who === 'reference') throw new InfraError('đáp án mẫu không biên dịch được — lỗi của gói chấm, không phải của bài');
        return {
          ...base,
          compile: { submission: info, reference: null },
          baseline: [],
          samples: [],
          aborted: 'compile_error',
          finishedAt: new Date().toISOString(),
          unavailable: null,
        };
      }
      const name = containerName();
      containers.push(name);
      await startContainer(deps, job, name, job.language === 'cpp' ? bin : src, slot);
      running.push({ who: p.who, container: name, entry });
    }

    const inputs = await Promise.all(job.points.map((pt) => materialize(pt.stdin, deps.runner.fetchPolicy)));

    const baseline: MeasureResult['baseline'] = [];
    for (const p of running) {
      for (let i = 0; i < BASELINE_RUNS; i++) {
        const s = await sample(deps, job, p, null);
        baseline.push({ program: p.who, innerNs: s.innerNs, outerNs: s.outerNs });
      }
    }

    const samples: MeasureSample[] = [];
    let aborted: 'interference' | null = null;
    measuring: for (let r = 0; r < job.repeats; r++) {
      for (const [i, point] of job.points.entries()) {
        const order = r % 2 === 0 ? running : [...running].reverse();
        for (const p of order) {
          let s: Awaited<ReturnType<typeof sample>>;
          try {
            s = await sample(deps, job, p, inputs[i]);
          } catch (error) {
            if (error instanceof ContainerGone && p.who === 'submission') {
              aborted = 'interference';
              break measuring;
            }
            throw error instanceof ContainerGone ? new InfraError('container của đáp án mẫu chết giữa chừng') : error;
          }
          samples.push({ program: p.who, n: point.n, repeat: r, ...s });
          if (!(await isClean(deps, p.container))) {
            if (p.who === 'reference') throw new InfraError('đáp án mẫu để lại tiến trình nền — lỗi của gói chấm');
            aborted = 'interference';
            break measuring;
          }
        }
      }
    }

    return {
      ...base,
      compile: { submission: compiled.submission!, reference: compiled.reference ?? null },
      baseline,
      samples,
      aborted,
      finishedAt: new Date().toISOString(),
      unavailable: null,
    };
  } catch (error) {
    return { ...unavailableMeasure(job.jobId, describeError(error), deps.host), slot, timingMode: job.timingMode, startedAt };
  } finally {
    for (const c of containers) await removeContainer(deps.runner.docker, c);
    await rm(dir, { recursive: true, force: true });
  }
}
```

- [ ] **Step 5: Chạy test**

Run: `pnpm --filter api test -- handle-measure handle-exec`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/sandbox-worker
git commit -m "feat(sandbox): job đo — hai container xen kẽ, số đo trong + ngoài, dừng khi có tiến trình nền"
```

---

### Task 7: Bộ `test:sandbox` — Docker thật: `T-LANG-1…3`, `T-ISO-1/2/3/6`, `T-ISO-8` phần sandbox

**Files:**
- Create: `apps/api/test-sandbox/jest-sandbox.json`, `apps/api/test-sandbox/global-setup.ts`, `apps/api/test-sandbox/helpers.ts`
- Create: `apps/api/test-sandbox/lang.sandbox-spec.ts`, `apps/api/test-sandbox/isolation.sandbox-spec.ts`, `apps/api/test-sandbox/measure.sandbox-spec.ts`
- Modify: `apps/api/package.json` (script `test:sandbox`)

Bộ này chạy được trên Docker Desktop (runtime `runc`). Trên máy sandbox, chạy lại với `SANDBOX_RUNTIME=runsc` (Task 9). Nó **không** tự bỏ qua khi thiếu Docker: một bộ test an ninh im lặng xanh vì không chạy là tệ hơn không có.

- [ ] **Step 1: Cấu hình**

```json
// apps/api/test-sandbox/jest-sandbox.json
{
  "rootDir": "..",
  "testRegex": "test-sandbox/.*\\.sandbox-spec\\.ts$",
  "transform": { "^.+\\.(t|j)s$": "ts-jest" },
  "testEnvironment": "node",
  "globalSetup": "<rootDir>/test-sandbox/global-setup.ts",
  "testTimeout": 180000
}
```

(JSON không có chú thích — bỏ dòng đầu khi tạo file.)

`apps/api/package.json` → `scripts`:

```json
"test:sandbox": "jest --config test-sandbox/jest-sandbox.json --runInBand",
```

```ts
// apps/api/test-sandbox/global-setup.ts
import { execFileSync } from 'node:child_process';

/** Nổ, không bỏ qua: một bộ test an ninh xanh vì không chạy là tệ hơn không có. */
export default async function globalSetup(): Promise<void> {
  try {
    execFileSync('docker', ['version', '--format', '{{.Server.Version}}'], { stdio: 'pipe' });
  } catch {
    throw new Error('test:sandbox cần Docker đang chạy — bộ này KHÔNG tự bỏ qua. Bật Docker rồi chạy lại.');
  }
  for (const image of ['cine-sandbox-cpp:1', 'cine-sandbox-python:1']) {
    try {
      execFileSync('docker', ['image', 'inspect', image], { stdio: 'pipe' });
    } catch {
      throw new Error(`thiếu image ${image} — chạy: pnpm --filter api sandbox:images`);
    }
  }
  if (process.env.SANDBOX_RUNTIME === 'runsc') {
    const runtimes = execFileSync('docker', ['info', '--format', '{{json .Runtimes}}'], { encoding: 'utf8' });
    if (!runtimes.includes('"runsc"')) throw new Error('SANDBOX_RUNTIME=runsc nhưng Docker chưa đăng ký runsc');
  }
}
```

```ts
// apps/api/test-sandbox/helpers.ts
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import { HostFingerprint, SANDBOX_CONTRACT_VERSION } from '../src/sandbox/contract';
import { spawnCli } from '../src/sandbox-worker/docker-cli';
import { WorkerDeps } from '../src/sandbox-worker/handle-exec';

export const RUNTIME: 'runc' | 'runsc' = process.env.SANDBOX_RUNTIME === 'runsc' ? 'runsc' : 'runc';

export const HOST: HostFingerprint = {
  hostname: hostname(), cpuModel: 'test', cpuCount: 1, kernel: 'test', runtime: RUNTIME,
  dockerVersion: 'test', images: {}, workerVersion: 'test',
};

export function realDeps(): WorkerDeps {
  const workRoot = join(tmpdir(), 'cine-sandbox-test');
  mkdirSync(workRoot, { recursive: true });
  return {
    runner: {
      docker: spawnCli(),
      runtime: RUNTIME,
      images: { cpp: 'cine-sandbox-cpp:1', python: 'cine-sandbox-python:1' },
      fetchPolicy: { allowedHosts: [], allowHttp: false, maxBytes: 64 * 1024 * 1024 },
    },
    host: HOST,
    workRoot,
  };
}

export const inline = (content: string) => ({ kind: 'inline' as const, content });
export const gen = (n: number, seed = 1, lo = 0, hi = 1_000_000) =>
  ({ kind: 'generate' as const, generator: 'int_array' as const, n, lo, hi, seed });

export function execJobOf(p: Record<string, unknown>) {
  return { contract: SANDBOX_CONTRACT_VERSION, kind: 'exec', jobId: randomUUID(), ...p };
}
export function measureJobOf(p: Record<string, unknown>) {
  return { contract: SANDBOX_CONTRACT_VERSION, kind: 'measure', jobId: randomUUID(), ...p };
}

/** Driver C++ bấm giờ trong tiến trình quanh `work(a)` — dùng kết quả (T-LANG-1). */
export const CPP_TIMED_DRIVER = `#include <cstdio>
#include <vector>
#include <cine_timing.h>
unsigned long long work(const std::vector<long long>& a);
int main() {
  int n;
  if (std::scanf("%d", &n) != 1) return 1;
  std::vector<long long> a(n);
  for (auto& x : a) std::scanf("%lld", &x);
  cine::begin();
  unsigned long long r = work(a);
  cine::keep(r);
  cine::stop();
  cine::report(r);
  return 0;
}
`;

export const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};
```

- [ ] **Step 2: `T-LANG-1…3`**

```ts
// apps/api/test-sandbox/lang.sandbox-spec.ts
import { generateIntArray } from '../src/sandbox-worker/fetch-files';
import { handleExec } from '../src/sandbox-worker/handle-exec';
import { handleMeasure } from '../src/sandbox-worker/handle-measure';
import { CPP_TIMED_DRIVER, execJobOf, gen, inline, measureJobOf, median, realDeps } from './helpers';

const deps = realDeps();

describe('T-LANG — bẫy riêng của từng ngôn ngữ (§3.5)', () => {
  it('T-LANG-1 — C++ -O2, hàm O(n): driver dùng kết quả, n gấp 8 thì thời gian KHÔNG đứng yên', async () => {
    const linear = `#include <vector>
unsigned long long work(const std::vector<long long>& a) {
  unsigned long long s = 0;
  for (long long x : a) s += (unsigned long long)x * 2654435761ULL;
  return s;
}
`;
    const r = await handleMeasure(
      measureJobOf({
        language: 'cpp', timingMode: 'in_process',
        submission: { files: [{ path: 'main.cpp', ref: inline(linear) }], driver: inline(CPP_TIMED_DRIVER), entry: null },
        reference: null,
        points: [{ n: 1 << 17, stdin: gen(1 << 17) }, { n: 1 << 20, stdin: gen(1 << 20) }],
        repeats: 5,
      }),
      deps,
      null,
    );
    expect(r.unavailable).toBeNull();
    expect(r.aborted).toBeNull();
    const at = (n: number) => median(r.samples.filter((s) => s.n === n).map((s) => s.innerNs!));
    const ratio = at(1 << 20) / at(1 << 17);
    expect(ratio).toBeGreaterThan(4);
    expect(ratio).toBeLessThan(16);
    expect(r.samples.every((s) => s.checksum !== null)).toBe(true);
  });

  it('T-LANG-2 — C++ đúng nhưng rò bộ nhớ: lượt sanitizer KHÔNG tính là sập (detect_leaks=0)', async () => {
    const leaky = `#include <cstdio>
int main() {
  for (int i = 0; i < 100; i++) { int* p = new int[1000]; p[0] = i; }
  std::puts("ok");
  return 0;
}
`;
    const r = await handleExec(
      execJobOf({
        language: 'cpp',
        program: { files: [{ path: 'main.cpp', ref: inline(leaky) }], driver: null, entry: null },
        cases: [{ name: 'a', group: null, stdin: inline(''), expected: inline('ok\n') }],
      }),
      deps,
      null,
    );
    expect(r.compile?.ok).toBe(true);
    expect(r.cases[0].status).toBe('pass');
  });

  it('T-LANG-3 — Python đệ quy đúng, sâu 10^5: chạy được ở cả kiểm lẫn đo, không RecursionError, không segfault', async () => {
    const mod = `def tong(xs, i=0):
    return 0 if i == len(xs) else xs[i] + tong(xs, i + 1)
`;
    const runDriver = `import sys
from bai import tong
sys.stdin.readline()
print(tong(list(map(int, sys.stdin.readline().split()))))
`;
    const timeDriver = `import sys
import cine_timing
from bai import tong
sys.stdin.readline()
xs = list(map(int, sys.stdin.readline().split()))
cine_timing.begin()
r = tong(xs)
cine_timing.stop()
cine_timing.report(r)
`;
    const n = 100_000;
    const input = generateIntArray(n, 0, 9, 3);
    const expected = input.trim().split('\n')[1].split(' ').reduce((s, x) => s + Number(x), 0);

    const exec = await handleExec(
      execJobOf({
        language: 'python',
        program: { files: [{ path: 'bai.py', ref: inline(mod) }], driver: inline(runDriver), entry: null },
        cases: [{ name: 'sau', group: null, stdin: gen(n, 3, 0, 9), expected: inline(`${expected}\n`) }],
        limits: { wallMsPerCase: 10_000 },
      }),
      deps,
      null,
    );
    expect(exec.cases[0].status).toBe('pass');

    const measure = await handleMeasure(
      measureJobOf({
        language: 'python', timingMode: 'in_process',
        submission: { files: [{ path: 'bai.py', ref: inline(mod) }], driver: inline(timeDriver), entry: null },
        reference: null,
        points: [{ n, stdin: gen(n, 3, 0, 9) }],
        repeats: 1,
        limits: { wallMsPerCase: 10_000 },
      }),
      deps,
      null,
    );
    expect(measure.samples.map((s) => s.status)).toEqual(['ok']);
    expect(measure.samples[0].checksum).toBe(String(expected));
  });
});
```

- [ ] **Step 3: `T-ISO-1/2/3/6`**

```ts
// apps/api/test-sandbox/isolation.sandbox-spec.ts
import { randomUUID } from 'node:crypto';
import { handleExec } from '../src/sandbox-worker/handle-exec';
import { execJobOf, inline, realDeps } from './helpers';

const deps = realDeps();
const cpp = (code: string, cases: unknown[], extra: Record<string, unknown> = {}) =>
  handleExec(
    execJobOf({ language: 'cpp', program: { files: [{ path: 'main.cpp', ref: inline(code) }], driver: null, entry: null }, cases, ...extra }),
    deps,
    null,
  );
const py = (code: string, cases: unknown[], extra: Record<string, unknown> = {}) =>
  handleExec(
    execJobOf({ language: 'python', program: { files: [{ path: 'bai.py', ref: inline(code) }], driver: null, entry: 'bai.py' }, cases, ...extra }),
    deps,
    null,
  );
const one = (expected: string | null, stdin = '') => [{ name: 'a', group: null, stdin: inline(stdin), expected: expected === null ? null : inline(expected) }];

describe('T-ISO — mô hình đe doạ (§3.5)', () => {
  it('T-ISO-1 — mở kết nối mạng thất bại (C++ và Python)', async () => {
    const c = await cpp(
      `#include <arpa/inet.h>
#include <cstdio>
#include <netinet/in.h>
#include <sys/socket.h>
int main() {
  int s = socket(AF_INET, SOCK_STREAM, 0);
  if (s < 0) { std::puts("NO_NET"); return 0; }
  sockaddr_in a{}; a.sin_family = AF_INET; a.sin_port = htons(53);
  inet_pton(AF_INET, "1.1.1.1", &a.sin_addr);
  std::puts(connect(s, (sockaddr*)&a, sizeof a) == 0 ? "NET_OK" : "NO_NET");
}
`,
      one('NO_NET\n'),
    );
    expect(c.cases[0].status).toBe('pass');
    const p = await py(
      `import socket
s = socket.socket()
s.settimeout(2)
try:
    s.connect(("1.1.1.1", 53)); print("NET_OK")
except OSError:
    print("NO_NET")
`,
      one('NO_NET\n'),
    );
    expect(p.cases[0].status).toBe('pass');
  });

  it('T-ISO-2 — cấp phát vô hạn và fork bomb chạm trần của ĐÚNG ca đó; ca sau chạy bình thường', async () => {
    const r = await cpp(
      `#include <cstdio>
#include <cstring>
#include <string>
#include <unistd.h>
#include <vector>
int main() {
  char mode[16] = {0};
  if (std::scanf("%15s", mode) != 1) return 1;
  if (!std::strcmp(mode, "mem")) { std::vector<std::string> v; for (;;) v.emplace_back(1 << 24, 'x'); }
  if (!std::strcmp(mode, "fork")) { for (;;) fork(); }
  std::puts("ok");
}
`,
      [
        { name: 'mem', group: null, stdin: inline('mem\n'), expected: inline('ok\n') },
        { name: 'fork', group: null, stdin: inline('fork\n'), expected: inline('ok\n') },
        { name: 'ok', group: null, stdin: inline('ok\n'), expected: inline('ok\n') },
      ],
      { sanitize: false, limits: { memoryMb: 256, pids: 32, wallMsPerCase: 2_000 } },
    );
    expect(r.unavailable).toBeNull();
    expect(r.cases[0]).toMatchObject({ status: 'runtime_crash', limitsHit: ['memory'] });
    // Đo 2026-09-24: fork bomb với --pids-limit ra 124 (hết giờ), không phải sập.
    expect(r.cases[1].status).toBe('timeout');
    expect(r.cases[2].status).toBe('pass');
  });

  it('T-ISO-3 — ghi ra ngoài /tmp thất bại (hệ thống file chỉ đọc); /tmp ghi được', async () => {
    const r = await py(
      `import os
blocked = 0
for path in ["/work/x", "/x", "/etc/x", "/usr/x", "/home/x"]:
    try:
        open(path, "w").write("x")
    except OSError:
        blocked += 1
open("/tmp/x", "w").write("x")
print("RO_OK" if blocked == 5 and os.path.exists("/tmp/x") else "WRITE_LEAK")
`,
      one('RO_OK\n'),
    );
    expect(r.cases[0].status).toBe('pass');
  });

  it('T-ISO-6 — output mong đợi của ca khác và của chính ca này không có trong container', async () => {
    // Dấu hiệu KHÔNG xuất hiện nguyên văn trong mã bài: bài ghép nó lúc chạy.
    const id = randomUUID();
    const marker = `BI_MAT_${id}`;
    const search = `import os
m = "BI_" + "MAT_" + ${JSON.stringify(id)}
found = any(m in v for v in os.environ.values())
for root, dirs, files in os.walk("/"):
    if root.startswith(("/proc", "/sys", "/dev")):
        dirs[:] = []
        continue
    for f in files:
        p = os.path.join(root, f)
        try:
            if os.path.getsize(p) < 2_000_000 and m.encode() in open(p, "rb").read():
                found = True
        except OSError:
            pass
print("FOUND" if found else "NOT_FOUND")
`;
    // Duyệt cả hệ thống file của image mất vài giây — trần mặc định 2 giây không đủ.
    const r = await py(
      search,
      [
        { name: 'dich', group: null, stdin: inline(''), expected: inline(`${marker}\n`) },
        { name: 'do', group: null, stdin: inline(''), expected: null },
      ],
      { limits: { wallMsPerCase: 20_000 } },
    );
    expect(r.cases[1].status).toBe('ran');
    expect(r.cases[1].stdout).toBe('NOT_FOUND\n');
  });
});
```

- [ ] **Step 4: Job đo thật — `T-ISO-8` phần sandbox, và tiến trình nền**

```ts
// apps/api/test-sandbox/measure.sandbox-spec.ts
import { handleMeasure } from '../src/sandbox-worker/handle-measure';
import { CPP_TIMED_DRIVER, gen, inline, measureJobOf, realDeps } from './helpers';

const deps = realDeps();
const measure = (work: string, over: Record<string, unknown> = {}) =>
  handleMeasure(
    measureJobOf({
      language: 'cpp', timingMode: 'in_process',
      submission: { files: [{ path: 'main.cpp', ref: inline(work) }], driver: inline(CPP_TIMED_DRIVER), entry: null },
      reference: null,
      points: [{ n: 1_000, stdin: gen(1_000) }],
      repeats: 3,
      ...over,
    }),
    deps,
    null,
  );

describe('job đo trên Docker thật', () => {
  it('T-ISO-8 (phần sandbox) — dòng thời gian giả mang mã sai bị bỏ qua; mọi mẫu có số đo ngoài', async () => {
    const liar = `#include <cstdio>
#include <cstdlib>
#include <vector>
static void fake() { std::fprintf(stderr, "\\nCINE_T 0000000000000000 1 1\\n"); }
unsigned long long work(const std::vector<long long>& a) {
  std::atexit(fake);   // in SAU dòng thật của driver
  fake();              // và cả TRƯỚC
  unsigned long long s = 0;
  for (long long x : a) s += x;
  return s;
}
`;
    const r = await measure(liar);
    expect(r.unavailable).toBeNull();
    expect(r.samples.every((s) => s.innerNs !== null && s.innerNs !== 1)).toBe(true);
    expect(r.samples.every((s) => s.outerNs > 0)).toBe(true);
    expect(r.baseline.length).toBeGreaterThan(0);
  });

  it('Review Focus 4 — bài để lại tiến trình nền → aborted interference', async () => {
    const forker = `#include <unistd.h>
#include <vector>
unsigned long long work(const std::vector<long long>& a) {
  if (fork() == 0) { setsid(); for (;;) sleep(1); }
  return a.size();
}
`;
    const r = await measure(forker);
    expect(r.aborted).toBe('interference');
  });

  it('bấm giờ cả tiến trình: có số đo trong từ cine-time, checksum từ stdout', async () => {
    const plainDriver = `#include <cstdio>
#include <vector>
unsigned long long work(const std::vector<long long>& a);
int main() {
  int n; if (std::scanf("%d", &n) != 1) return 1;
  std::vector<long long> a(n); for (auto& x : a) std::scanf("%lld", &x);
  std::printf("%llu\\n", work(a));
}
`;
    const r = await handleMeasure(
      measureJobOf({
        language: 'cpp', timingMode: 'process',
        submission: {
          files: [{ path: 'main.cpp', ref: inline('#include <vector>\nunsigned long long work(const std::vector<long long>& a){return a.size();}\n') }],
          driver: inline(plainDriver), entry: null,
        },
        reference: null,
        points: [{ n: 1_000, stdin: gen(1_000) }],
        repeats: 2,
      }),
      deps,
      null,
    );
    expect(r.samples.every((s) => s.innerNs !== null && s.checksum === '1000')).toBe(true);
  });
});
```

- [ ] **Step 5: Chạy bộ**

Bật Docker, dựng image (Task 2). Run: `pnpm --filter api test:sandbox`
Expected: PASS toàn bộ trên `runc`.

Nếu `T-ISO-2` ca `mem` ra `runtime_crash` nhưng `limitsHit` rỗng, thì `State.OOMKilled` không lên trên máy này. Trên Docker Desktop nó đã lên (đo 2026-09-24). Ghi mã thoát và cờ thật vào PR, xem lại `classifyExit`, và đừng nới test.

- [ ] **Step 6: Commit**

```bash
git add apps/api/test-sandbox apps/api/package.json
git commit -m "test(sandbox): bộ test:sandbox trên Docker thật — T-LANG-1…3, T-ISO-1/2/3/6, T-ISO-8 phần sandbox"
```

---

### Task 8: Khe đo, cấu hình, dấu vân tay, và `startWorker`

**Files:**
- Modify: `apps/api/src/sandbox-worker/slots.ts` (thêm `SlotPool`)
- Create: `apps/api/src/sandbox-worker/config.ts`, `apps/api/src/sandbox-worker/fingerprint.ts`, `apps/api/src/sandbox-worker/main.ts`
- Test: `apps/api/src/sandbox-worker/slots.spec.ts`, `apps/api/src/sandbox-worker/config.spec.ts`, `apps/api/src/sandbox-worker/fingerprint.spec.ts`, `apps/api/src/sandbox-worker/main.import-scan.spec.ts`

**Interfaces:**
- Produces:

```ts
// slots.ts (thêm)
export interface Lease<T> { item: T; release(): void }
export class SlotPool<T> { readonly size: number; constructor(items: T[]); acquire(): Promise<Lease<T>> }
// config.ts
export const FORBIDDEN_ENV: RegExp[];
export function forbiddenEnvKeys(env: NodeJS.ProcessEnv): string[];
export interface Source { name: 'real' | 'eval'; redisUrl: string; prefix: string }
export interface WorkerConfig {
  sources: Source[]; runtime: Runtime; images: Record<SandboxLanguage, string>;
  timingCpusets: (string | null)[]; generalCpuset: string | null; execConcurrency: number;
  workRoot: string; allowedDownloadHosts: string[]; allowHttpDownloads: boolean; version: string; warnings: string[];
}
export function readWorkerConfig(env: NodeJS.ProcessEnv): WorkerConfig;
// fingerprint.ts
export function readFingerprint(docker: DockerCli, cfg: Pick<WorkerConfig, 'runtime' | 'images' | 'version'>): Promise<HostFingerprint>;
// main.ts
export interface RunningWorker { host: HostFingerprint; close(): Promise<void> }
export function startWorker(cfg: WorkerConfig, opts?: { docker?: DockerCli; log?: (line: string) => void }): Promise<RunningWorker>;
```

Env của worker — **toàn bộ**, không có biến nào khác được đọc:

| Biến | Mặc định | Ghi chú |
|---|---|---|
| `SANDBOX_REDIS_URL` | — (bắt buộc) | `rediss://<user ACL>:<pass>@host:port` của hàng đợi thật |
| `SANDBOX_EVAL_REDIS_URL` | không có | Redis **riêng** của eval (§3.5). Vắng thì worker chỉ kéo hàng đợi thật |
| `SANDBOX_PREFIX`, `SANDBOX_EVAL_PREFIX` | `cine-sbx` | Prefix khoá BullMQ — khớp với luật ACL (Task 12) |
| `SANDBOX_RUNTIME` | `runc` | `runc` \| `runsc`. Đổi theo báo cáo buổi thử |
| `SANDBOX_IMAGE_CPP`, `SANDBOX_IMAGE_PYTHON` | `cine-sandbox-cpp:1`, `cine-sandbox-python:1` | |
| `SANDBOX_TIMING_CPUSETS` | không ghim (cảnh báo) | Các khe đo, ngăn bằng `\|`, ví dụ `2\|3`. `K` = số khe |
| `SANDBOX_GENERAL_CPUSET` | không ghim | Lõi cho job kiểm tính đúng. Không được chồng lên khe đo |
| `SANDBOX_CONCURRENCY` | số lõi của `SANDBOX_GENERAL_CPUSET`, hoặc số lõi máy − 1 | Số job kiểm chạy cùng lúc, **chung** cho cả hai nguồn (§3.5) |
| `SANDBOX_WORK_DIR` | `<tmp>/cine-sandbox` | |
| `SANDBOX_ALLOWED_DOWNLOAD_HOSTS` | rỗng | Host của presigned URL, ngăn bằng dấu phẩy |
| `SANDBOX_ALLOW_HTTP_DOWNLOADS` | `false` | Chỉ cho MinIO local khi thử |
| `SANDBOX_WORKER_VERSION` | `dev` | Ghi vào dấu vân tay — đặt bằng git sha lúc deploy |

- [ ] **Step 1: Viết test hỏng**

```ts
// apps/api/src/sandbox-worker/slots.spec.ts
import { SlotPool } from './slots';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('SlotPool', () => {
  it('trao khe theo thứ tự đến, không bao giờ hai người cùng giữ một khe', async () => {
    const pool = new SlotPool(['2']);
    const log: string[] = [];
    const job = async (who: string) => {
      const lease = await pool.acquire();
      log.push(`${who}+`);
      await sleep(20);
      log.push(`${who}-`);
      lease.release();
    };
    await Promise.all([job('a'), job('b'), job('c')]);
    expect(log).toEqual(['a+', 'a-', 'b+', 'b-', 'c+', 'c-']);
  });

  it('T-ISO-7 (unit) — job đo của hai nguồn, K = 1: các khoảng giữ khe không chồng nhau', async () => {
    const pool = new SlotPool<string | null>([null]);
    const spans: [number, number][] = [];
    const measure = async () => {
      const lease = await pool.acquire();
      const start = performance.now();
      await sleep(15);
      spans.push([start, performance.now()]);
      lease.release();
    };
    await Promise.all([measure(), measure(), measure(), measure()]);
    spans.sort((x, y) => x[0] - y[0]);
    for (let i = 1; i < spans.length; i++) expect(spans[i][0]).toBeGreaterThanOrEqual(spans[i - 1][1]);
  });

  it('K = 2: hai job chạy song song, trên hai khe khác nhau', async () => {
    const pool = new SlotPool(['2', '3']);
    const [a, b] = await Promise.all([pool.acquire(), pool.acquire()]);
    expect(new Set([a.item, b.item])).toEqual(new Set(['2', '3']));
  });

  it('trả khe hai lần không tạo ra khe thứ hai', async () => {
    const pool = new SlotPool(['2']);
    const a = await pool.acquire();
    a.release();
    a.release();
    await pool.acquire();
    let second = false;
    void pool.acquire().then(() => (second = true));
    await sleep(10);
    expect(second).toBe(false);
  });
});
```

```ts
// apps/api/src/sandbox-worker/config.spec.ts
import { forbiddenEnvKeys, readWorkerConfig } from './config';

const base = { SANDBOX_REDIS_URL: 'rediss://sbx:pw@redis.example:6380' };

describe('forbiddenEnvKeys — §3.5 luật 2', () => {
  it('bắt khoá model, storage, DB, JWT, Redis của API và token GitHub; bỏ qua biến rỗng', () => {
    const env = {
      ...base,
      ANTHROPIC_API_KEY: 'x', GRADING_TIER1_API_KEY: 'x', STORAGE_SECRET_KEY: 'x', STORAGE_ACCESS_KEY: 'x',
      DATABASE_URL: 'x', ACCESS_TOKEN_SECRET: 'x', REDIS_URL: 'x', REDIS_PASSWORD: '', PATH: '/usr/bin',
      GITHUB_TOKEN: 'ghu_x',
    };
    expect(forbiddenEnvKeys(env)).toEqual([
      'ACCESS_TOKEN_SECRET', 'ANTHROPIC_API_KEY', 'DATABASE_URL', 'GITHUB_TOKEN', 'GRADING_TIER1_API_KEY',
      'REDIS_URL', 'STORAGE_ACCESS_KEY', 'STORAGE_SECRET_KEY',
    ]);
  });
});

describe('readWorkerConfig', () => {
  it('thiếu SANDBOX_REDIS_URL → nổ, nêu tên biến', () => {
    expect(() => readWorkerConfig({})).toThrow(/SANDBOX_REDIS_URL/);
  });

  it('không đặt khe đo → một khe không ghim, kèm cảnh báo', () => {
    const cfg = readWorkerConfig(base);
    expect(cfg.timingCpusets).toEqual([null]);
    expect(cfg.warnings.join(' ')).toMatch(/không ghim/);
    expect(cfg.sources).toEqual([{ name: 'real', redisUrl: base.SANDBOX_REDIS_URL, prefix: 'cine-sbx' }]);
  });

  it('đọc khe đo, lõi chung, và nguồn eval', () => {
    const cfg = readWorkerConfig({
      ...base, SANDBOX_TIMING_CPUSETS: '2|3', SANDBOX_GENERAL_CPUSET: '0-1',
      SANDBOX_EVAL_REDIS_URL: 'rediss://eval:pw@eval.example:6380', SANDBOX_RUNTIME: 'runsc',
    });
    expect(cfg.timingCpusets).toEqual(['2', '3']);
    expect(cfg.execConcurrency).toBe(2);
    expect(cfg.runtime).toBe('runsc');
    expect(cfg.sources.map((s) => s.name)).toEqual(['real', 'eval']);
  });

  it('khe đo chồng lên lõi chung → nổ, nêu lõi bị chồng', () => {
    expect(() => readWorkerConfig({ ...base, SANDBOX_TIMING_CPUSETS: '1|2', SANDBOX_GENERAL_CPUSET: '0-1' })).toThrow(/lõi 1/);
  });

  it('eval dùng CHUNG Redis và prefix với hàng đợi thật → nổ (§3.5)', () => {
    expect(() => readWorkerConfig({ ...base, SANDBOX_EVAL_REDIS_URL: base.SANDBOX_REDIS_URL })).toThrow(/Redis riêng/);
  });

  it('runtime lạ → nổ', () => {
    expect(() => readWorkerConfig({ ...base, SANDBOX_RUNTIME: 'kata' })).toThrow(/SANDBOX_RUNTIME/);
  });
});
```

```ts
// apps/api/src/sandbox-worker/fingerprint.spec.ts
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
```

```ts
// apps/api/src/sandbox-worker/main.import-scan.spec.ts
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

/**
 * Worker không được import gì của API ngoài hợp đồng và redis-connection:
 * mỗi import thêm là một đường để một khoá model, một DataSource hay một
 * ConfigService lọt lên máy dễ bị tấn công nhất (spec §3.5 luật 2).
 */
const SRC = resolve(__dirname, '..');
const ALLOWED_FILES = new Set(['sandbox/contract.ts', 'shared/redis-connection.ts']);
const ALLOWED_PACKAGES = new Set(['bullmq', 'ioredis', 'zod']);

function specifiers(file: string): string[] {
  const src = readFileSync(file, 'utf8');
  return [...src.matchAll(/(?:from\s+|import\s*\(\s*|require\(\s*|^import\s+)['"]([^'"]+)['"]/gm)].map((m) => m[1]);
}

function resolveTs(from: string, spec: string): string {
  const base = resolve(dirname(from), spec);
  for (const candidate of [`${base}.ts`, join(base, 'index.ts')]) if (existsSync(candidate)) return candidate;
  throw new Error(`không tìm thấy ${spec} từ ${from}`);
}

describe('worker sandbox — phạm vi import', () => {
  it('main.ts chỉ với tới sandbox-worker/, hợp đồng, redis-connection, bullmq, ioredis, zod, node:*', () => {
    const violations: string[] = [];
    const seen = new Set<string>();
    const queue = [join(SRC, 'sandbox-worker', 'main.ts')];
    while (queue.length > 0) {
      const file = queue.pop()!;
      if (seen.has(file)) continue;
      seen.add(file);
      for (const spec of specifiers(file)) {
        if (spec.startsWith('node:')) continue;
        if (!spec.startsWith('.')) {
          const pkg = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
          if (!ALLOWED_PACKAGES.has(pkg)) violations.push(`${relative(SRC, file)} → ${spec}`);
          continue;
        }
        const target = resolveTs(file, spec);
        const rel = relative(SRC, target).replace(/\\/g, '/');
        const inWorker = rel.startsWith('sandbox-worker/') && !rel.includes('/testing/') && !rel.endsWith('.spec.ts');
        if (!inWorker && !ALLOWED_FILES.has(rel)) {
          violations.push(`${relative(SRC, file)} → ${rel}`);
          continue;
        }
        queue.push(target);
      }
    }
    expect(violations).toEqual([]);
    expect(seen.size).toBeGreaterThan(5);
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận hỏng**

Run: `pnpm --filter api test -- slots config fingerprint import-scan`
Expected: FAIL.

- [ ] **Step 3: Viết code**

Thêm vào cuối `apps/api/src/sandbox-worker/slots.ts`:

```ts
export interface Lease<T> {
  item: T;
  release(): void;
}

/**
 * Semaphore có tên khe. Dùng hai chỗ: khe đo (mỗi khe một cpuset, `K` khe) và
 * lượt kiểm tính đúng (`SANDBOX_CONCURRENCY` lượt, cùng một cpuset chung).
 * MỘT pool cho CẢ hai nguồn (thật và eval) — đó là toàn bộ `T-ISO-7`.
 */
export class SlotPool<T> {
  readonly size: number;
  private readonly free: T[];
  private readonly waiters: ((item: T) => void)[] = [];

  constructor(items: T[]) {
    if (items.length === 0) throw new Error('SlotPool cần ít nhất một khe');
    this.size = items.length;
    this.free = [...items];
  }

  acquire(): Promise<Lease<T>> {
    if (this.free.length > 0) return Promise.resolve(this.lease(this.free.shift() as T));
    return new Promise((resolve) => this.waiters.push((item) => resolve(this.lease(item))));
  }

  private lease(item: T): Lease<T> {
    let released = false;
    return {
      item,
      release: () => {
        if (released) return;
        released = true;
        const next = this.waiters.shift();
        if (next) next(item);
        else this.free.push(item);
      },
    };
  }
}
```

```ts
// apps/api/src/sandbox-worker/config.ts
import { cpus, tmpdir } from 'node:os';
import { join } from 'node:path';
import { SANDBOX_PREFIX_DEFAULT, SandboxLanguage } from '../sandbox/contract';
import { Runtime } from './docker-args';
import { cpusetCores } from './slots';

/**
 * Biến mà máy sandbox KHÔNG BAO GIỜ được cầm (spec §3.5 luật 2). Thấy một
 * biến trong số này thì worker từ chối khởi động: thà không chạy còn hơn chạy
 * với khoá model trên đúng cái máy mà mã sinh viên đang cố thoát ra.
 */
export const FORBIDDEN_ENV: RegExp[] = [
  /^ANTHROPIC_/,
  /^OPENAI_/,
  /^GRADING_TIER\d+_API_KEY$/,
  /^DATABASE_/,
  /^STORAGE_(ACCESS|SECRET)_KEY$/,
  /^AWS_SECRET_ACCESS_KEY$/,
  /^MINIO_ROOT_PASSWORD$/,
  /_TOKEN_SECRET$/,
  /^REDIS_(URL|HOST|PASSWORD|USERNAME)$/,
  // Codespaces và CI đặt sẵn token GitHub có quyền GHI repo — thoát container ở
  // đó là đẩy được code vào chính repo đồ án.
  /^(GITHUB|GH)_TOKEN$/,
];

export function forbiddenEnvKeys(env: NodeJS.ProcessEnv): string[] {
  return Object.keys(env)
    .filter((k) => env[k]?.trim() && FORBIDDEN_ENV.some((re) => re.test(k)))
    .sort();
}

export interface Source {
  name: 'real' | 'eval';
  redisUrl: string;
  prefix: string;
}

export interface WorkerConfig {
  sources: Source[];
  runtime: Runtime;
  images: Record<SandboxLanguage, string>;
  timingCpusets: (string | null)[];
  generalCpuset: string | null;
  execConcurrency: number;
  workRoot: string;
  allowedDownloadHosts: string[];
  allowHttpDownloads: boolean;
  version: string;
  warnings: string[];
}

export function readWorkerConfig(env: NodeJS.ProcessEnv): WorkerConfig {
  const problems: string[] = [];
  const warnings: string[] = [];
  const get = (key: string) => env[key]?.trim() || undefined;

  const sources: Source[] = [];
  const real = get('SANDBOX_REDIS_URL');
  if (real) sources.push({ name: 'real', redisUrl: real, prefix: get('SANDBOX_PREFIX') ?? SANDBOX_PREFIX_DEFAULT });
  else problems.push('thiếu SANDBOX_REDIS_URL');
  const evalUrl = get('SANDBOX_EVAL_REDIS_URL');
  if (evalUrl) {
    const prefix = get('SANDBOX_EVAL_PREFIX') ?? SANDBOX_PREFIX_DEFAULT;
    if (evalUrl === real && prefix === sources[0]?.prefix) {
      problems.push('hàng đợi eval trùng cả Redis lẫn prefix với hàng đợi thật — eval phải có Redis riêng (§3.5)');
    }
    sources.push({ name: 'eval', redisUrl: evalUrl, prefix });
  }

  const runtime = get('SANDBOX_RUNTIME') ?? 'runc';
  if (runtime !== 'runc' && runtime !== 'runsc') problems.push(`SANDBOX_RUNTIME phải là runc hoặc runsc, đang là ${JSON.stringify(runtime)}`);

  let timingCpusets: (string | null)[] = [null];
  const timingRaw = get('SANDBOX_TIMING_CPUSETS');
  if (timingRaw) timingCpusets = timingRaw.split('|').map((s) => s.trim());
  else warnings.push('SANDBOX_TIMING_CPUSETS chưa đặt — job đo KHÔNG ghim lõi; số đo chỉ để thử, không dùng cho chấm thật (§3.5)');
  const generalCpuset = get('SANDBOX_GENERAL_CPUSET') ?? null;

  const owner = new Map<number, string>();
  let generalSize = 0;
  for (const set of [...timingCpusets, generalCpuset]) {
    if (set === null) continue;
    try {
      const cores = cpusetCores(set);
      if (set === generalCpuset) generalSize = cores.length;
      for (const core of cores) {
        const prev = owner.get(core);
        if (prev !== undefined) problems.push(`lõi ${core} nằm ở cả "${prev}" lẫn "${set}" — mỗi khe đo phải có lõi riêng`);
        owner.set(core, set);
      }
    } catch (error) {
      problems.push(error instanceof Error ? error.message : String(error));
    }
  }

  const concurrencyRaw = get('SANDBOX_CONCURRENCY');
  const execConcurrency = concurrencyRaw ? Number(concurrencyRaw) : Math.max(1, generalSize || cpus().length - 1);
  if (!Number.isInteger(execConcurrency) || execConcurrency < 1) {
    problems.push(`SANDBOX_CONCURRENCY phải là số nguyên dương, đang là ${JSON.stringify(concurrencyRaw)}`);
  }

  if (problems.length > 0) throw new Error(`Cấu hình worker sandbox sai:\n- ${problems.join('\n- ')}`);

  return {
    sources,
    runtime: runtime as Runtime,
    images: {
      cpp: get('SANDBOX_IMAGE_CPP') ?? 'cine-sandbox-cpp:1',
      python: get('SANDBOX_IMAGE_PYTHON') ?? 'cine-sandbox-python:1',
    },
    timingCpusets,
    generalCpuset,
    execConcurrency,
    workRoot: get('SANDBOX_WORK_DIR') ?? join(tmpdir(), 'cine-sandbox'),
    allowedDownloadHosts: (get('SANDBOX_ALLOWED_DOWNLOAD_HOSTS') ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    allowHttpDownloads: get('SANDBOX_ALLOW_HTTP_DOWNLOADS') === 'true',
    version: get('SANDBOX_WORKER_VERSION') ?? 'dev',
    warnings,
  };
}
```

```ts
// apps/api/src/sandbox-worker/fingerprint.ts
import { cpus, hostname, release, type } from 'node:os';
import { HostFingerprint } from '../sandbox/contract';
import { WorkerConfig } from './config';
import { DockerCli, DockerUnavailableError } from './docker-cli';

const opts = { maxStdoutBytes: 64 * 1024, wallMs: 30_000 };

/**
 * Dấu vân tay máy (spec §3.5, T-ISO-5): đổi máy là đo lại `c`, nên mọi kết quả
 * phải nói nó đo ở đâu. Chạy MỘT lần lúc khởi động — image hay runtime đổi
 * giữa chừng thì phải khởi động lại worker, và đó là điều đúng.
 */
export async function readFingerprint(
  docker: DockerCli,
  cfg: Pick<WorkerConfig, 'runtime' | 'images' | 'version'>,
): Promise<HostFingerprint> {
  const version = await docker.run(['version', '--format', '{{.Server.Version}}'], opts);
  if (version.code !== 0) throw new DockerUnavailableError(version.stderr.trim() || `docker version thoát ${version.code}`);

  if (cfg.runtime === 'runsc') {
    const info = await docker.run(['info', '--format', '{{json .Runtimes}}'], opts);
    if (!info.stdout.toString('utf8').includes('"runsc"')) {
      throw new Error('SANDBOX_RUNTIME=runsc nhưng Docker chưa đăng ký runtime runsc — xem docs/deploy/sandbox-worker.md');
    }
  }

  const images: Record<string, string> = {};
  for (const [language, tag] of Object.entries(cfg.images)) {
    const r = await docker.run(['image', 'inspect', '--format', '{{.Id}}', tag], opts);
    if (r.code !== 0) throw new Error(`thiếu image ${tag} — chạy pnpm --filter api sandbox:images`);
    images[language] = r.stdout.toString('utf8').trim();
  }

  const cpuList = cpus();
  return {
    hostname: hostname(),
    cpuModel: cpuList[0]?.model ?? 'unknown',
    cpuCount: cpuList.length || 1,
    kernel: `${type()} ${release()}`,
    runtime: cfg.runtime,
    dockerVersion: version.stdout.toString('utf8').trim(),
    images,
    workerVersion: cfg.version,
  };
}
```

```ts
// apps/api/src/sandbox-worker/main.ts
import { mkdir } from 'node:fs/promises';
import { Worker } from 'bullmq';
import { HostFingerprint, QUEUE_EXEC, QUEUE_MEASURE } from '../sandbox/contract';
import { buildRedisConnection } from '../shared/redis-connection';
import { forbiddenEnvKeys, readWorkerConfig, WorkerConfig } from './config';
import { DockerCli, spawnCli } from './docker-cli';
import { readFingerprint } from './fingerprint';
import { handleExec, WorkerDeps } from './handle-exec';
import { handleMeasure } from './handle-measure';
import { SlotPool } from './slots';

const MiB = 1024 * 1024;

export interface RunningWorker {
  host: HostFingerprint;
  close(): Promise<void>;
}

/**
 * MỘT tiến trình, kéo từ mọi nguồn trong cấu hình (thật, và eval nếu có), với
 * CHUNG một pool khe đo và một pool lượt kiểm (spec §3.5, sửa lần 9): eval và
 * chấm thật không bao giờ cùng đo trên một khe (T-ISO-7).
 */
export async function startWorker(
  cfg: WorkerConfig,
  opts: { docker?: DockerCli; log?: (line: string) => void } = {},
): Promise<RunningWorker> {
  const log = opts.log ?? (() => undefined);
  const docker = opts.docker ?? spawnCli();
  const host = await readFingerprint(docker, cfg);
  await mkdir(cfg.workRoot, { recursive: true });

  const deps: WorkerDeps = {
    runner: {
      docker,
      runtime: cfg.runtime,
      images: cfg.images,
      fetchPolicy: { allowedHosts: cfg.allowedDownloadHosts, allowHttp: cfg.allowHttpDownloads, maxBytes: 64 * MiB },
    },
    host,
    workRoot: cfg.workRoot,
  };
  const timing = new SlotPool(cfg.timingCpusets);
  const general = new SlotPool(Array.from({ length: cfg.execConcurrency }, () => cfg.generalCpuset));

  const workers: Worker[] = [];
  for (const source of cfg.sources) {
    const common = {
      connection: buildRedisConnection({ REDIS_URL: source.redisUrl }),
      prefix: source.prefix,
      // Luật ACL (Task 12) cấm INFO nếu phải — kiểm phiên bản Redis không đáng
      // bằng một quyền rộng hơn trên máy dễ bị tấn công nhất.
      skipVersionCheck: true,
    };
    workers.push(
      new Worker(
        QUEUE_EXEC,
        async (job) => {
          const lease = await general.acquire();
          try {
            return await handleExec(job.data, deps, lease.item);
          } finally {
            lease.release();
          }
        },
        { ...common, concurrency: cfg.execConcurrency },
      ),
      new Worker(
        QUEUE_MEASURE,
        async (job) => {
          const lease = await timing.acquire();
          try {
            return await handleMeasure(job.data, deps, lease.item);
          } finally {
            lease.release();
          }
        },
        { ...common, concurrency: timing.size },
      ),
    );
  }

  for (const w of cfg.warnings) log(`CẢNH BÁO: ${w}`);
  log(
    `worker sandbox: nguồn ${cfg.sources.map((s) => s.name).join(' + ')} · runtime ${host.runtime} · ` +
      `${timing.size} khe đo · ${cfg.execConcurrency} lượt kiểm song song · docker ${host.dockerVersion}`,
  );
  return {
    host,
    close: async () => {
      await Promise.all(workers.map((w) => w.close()));
    },
  };
}

async function main(): Promise<void> {
  const forbidden = forbiddenEnvKeys(process.env);
  if (forbidden.length > 0) {
    console.error(
      `Từ chối khởi động: env có ${forbidden.join(', ')}. Worker sandbox không được cầm khoá model, ` +
        'storage, DB hay Redis của API (spec §3.5 luật 2).',
    );
    process.exit(2);
  }
  const worker = await startWorker(readWorkerConfig(process.env), { log: (line) => console.log(line) });
  const stop = () => {
    void worker.close().then(() => process.exit(0));
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
```

- [ ] **Step 4: Chạy test, build, lint**

Run: `pnpm --filter api test -- sandbox && pnpm --filter api build && pnpm --filter api lint`
Expected: PASS, build và lint sạch. Kiểm `apps/api/dist/src/sandbox-worker/main.js` tồn tại.

- [ ] **Step 5: Thử khởi động trên máy dev**

Bật `docker compose up -d redis`. Run:

```bash
cd apps/api && SANDBOX_REDIS_URL=redis://localhost:6390 node dist/src/sandbox-worker/main.js
```

Expected: in dòng cảnh báo *"SANDBOX_TIMING_CPUSETS chưa đặt"* và dòng *"worker sandbox: nguồn real · runtime runc · 1 khe đo …"*; Ctrl+C thoát sạch. Thử lại với `ANTHROPIC_API_KEY=x` trong env → *"Từ chối khởi động: env có ANTHROPIC_API_KEY"*, mã thoát 2.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/sandbox-worker
git commit -m "feat(sandbox): startWorker — một tiến trình, hai nguồn, chung khe đo; từ chối env nguy hiểm; chặn import (T-ISO-5, T-ISO-7 unit)"
```

---

### Task 9: Buổi thử chọn cách cô lập — trên máy sandbox

§9 bước 1 viết *"mở đầu bằng buổi thử"*. Buổi thử ở plan này đứng **sau** các task dựng đường đo, và có chủ đích: nó chạy **đúng** `handleMeasure` và `handleExec` mà worker sẽ chạy. Một buổi thử đo trên script dựng riêng là đo một cài đặt khác cài đặt sẽ chạy thật. Nó vẫn đứng trước mọi task còn lại.

**Luật quyết định — chốt TRƯỚC khi đo** (§15, luật chung):

| Mã | Quyết định | Luật |
|---|---|---|
| D1 | Cách bấm giờ | `in_process` nếu, với `runc` ở K = 1, độ lệch chuẩn độ dốc log–log của nó **≤** của `process` ở **mọi** chương trình. Không thì `process`. `process` luôn được giữ cho đề chỉ có dạng stdin/stdout |
| D2 | Runtime | `runsc` nếu **cả năm** điều sau cùng đúng: (a) `test:sandbox` xanh trên `runsc`; (b) phát hiện tiến trình nền chạy được trên `runsc`; (c) p95 chi phí một ca kiểm ≤ 1,5 s; (d) ở cách bấm giờ của D1, K = 1, với mọi chương trình: độ lệch chuẩn độ dốc(`runsc`) ≤ 1,2 × của `runc`; (e) và CV trung bình(`runsc`) ≤ 1,2 × của `runc`. Không thì `runc` đã siết |
| D3 | Số khe `K` | K lớn nhất trong {1, 2, 4} (không quá số khe có trên máy) mà với mọi chương trình: độ lệch chuẩn độ dốc(K) ≤ 1,1 × của K = 1, **và** CV trung bình(K) ≤ 1,1 × của K = 1 |
| D4 | Dùng được không | Ở cấu hình đã chọn, K = 1: độ lệch chuẩn độ dốc ≤ 0,10 với **mọi** chương trình C++. Không đạt thì ghi vào báo cáo là chặn, và sửa rủi ro 1 của spec §11 |

Các ngưỡng 1,2 · 1,1 · 0,10 · 1,5 s là **đoán có lý do**, không phải số đo. Đổi ngưỡng sau khi đo thì phải ghi lý do trong PR.

**Files:**
- Create: `apps/api/src/sandbox-spike/programs.ts`, `apps/api/src/sandbox-spike/stats.ts`, `apps/api/src/sandbox-spike/stats.spec.ts`, `apps/api/src/sandbox-spike/spike.ts`, `apps/api/src/sandbox-spike/report.ts`
- Create: `docs/superpowers/reports/2026-09-24-sandbox-isolation-spike.md`
- Modify: `apps/api/package.json` (script `sandbox:spike`)

**Interfaces:**
- Consumes: `handleExec`, `handleMeasure`, `readFingerprint`, `spawnCli`, `generateIntArray` (Task 4–8).
- Produces:

```ts
// stats.ts
export function median(xs: number[]): number;
export function mean(xs: number[]): number;
export function std(xs: number[]): number;                        // mẫu, n − 1
export function logLogSlope(points: { n: number; t: number }[]): number;
export interface Session { perN: Map<number, number>; slope: number }
export function sessionOf(r: MeasureResult, field: 'innerNs' | 'outerNs'): Session | null;
export interface Summary { sessions: number; failed: number; slopeMean: number; slopeStd: number; meanCv: number }
export function summarize(sessions: (Session | null)[]): Summary;
export interface RuntimeFacts { isoPassed: boolean; interferenceDetected: boolean; caseP95Ms: number }
export interface Decision { mode: 'in_process' | 'process'; runtime: 'runc' | 'runsc'; k: number; usable: boolean; reasons: string[] }
export function decide(input: {
  summaries: Map<string, Summary>;          // khoá `${runtime}|${mode}|${k}|${program}`
  facts: Partial<Record<'runc' | 'runsc', RuntimeFacts>>;
  programs: string[]; cppPrograms: string[]; ks: number[];
}): Decision;
```

- [ ] **Step 1: Chuẩn bị máy sandbox**

Buổi thử phải chạy trên **chính máy sẽ làm máy sandbox** (§3.5: một máy duy nhất; đổi máy là đo lại). Chủ đồ án chọn máy: máy demo hay VPS. Chưa chốt được thì chạy trên một **máy tạm**, và ghi *"máy tạm — đo lại khi chốt máy"* lên đầu báo cáo.

**Máy tạm đã chốt (2026-09-24): GitHub Codespace của chủ đồ án.** Dùng được cho buổi thử và cho `test:sandbox` trên Linux thật, vì đó là *"phát triển và kiểm thử"* phần mềm của repo. **Không** dùng làm máy sandbox chấm thật, vì bốn lý do:

1. Điều khoản của Codespaces cấm *"host any kind of production-facing application"* và mọi việc *"unrelated to the development or testing"* của repo.
2. Codespace tự tắt sau tối đa 240 phút không có người dùng, và tắt là dừng mọi tiến trình. Worker chết thì mọi lời gọi công cụ ra `unavailable`.
3. Codespace mang sẵn `GITHUB_TOKEN` có quyền ghi repo. Thoát được container là đẩy được code vào chính repo đồ án. Worker từ chối khởi động khi thấy biến này (Task 8).
4. Tài liệu không hứa bật lại vẫn là cùng một máy vật lý, nên ngưỡng đo trên đó không chuyển sang máy thật được.

Trong codespace: Docker là docker-in-docker. gVisor có thể không cài được trong môi trường lồng; khi đó pha A chỉ có `runc`, và D2 ghi *"runsc chưa cài"*. Để chạy lệnh vào codespace từ máy dev: `gh auth refresh -h github.com -s codespace`, rồi `gh codespace ssh -c <tên> -- <lệnh>`.

Yêu cầu:

- Linux, Docker Engine ≥ 24, Node 22, pnpm.
- `nproc` ≥ 3: một lõi cho job kiểm, ít nhất hai lõi cho khe đo.
- gVisor: cài theo hướng dẫn chính thức ở `https://gvisor.dev/docs/user_guide/install/`. **Kiểm lại lệnh cài lúc làm**; plan này không chép lệnh để khỏi cũ.
- Đăng ký runtime trong `/etc/docker/daemon.json` (`"runtimes": { "runsc": { "path": "/usr/local/bin/runsc" } }`, đường dẫn theo nơi cài thật), rồi `sudo systemctl restart docker`.

Kiểm:

```bash
docker info --format '{{json .Runtimes}}'        # có "runsc"
docker run --rm --runtime runsc hello-world
```

Clone repo ở commit của worktree, `pnpm install`, rồi `pnpm --filter api sandbox:images`.

- [ ] **Step 2: `test:sandbox` trên cả hai runtime**

Run:

```bash
pnpm --filter api test:sandbox 2>&1 | tee spike-iso-runc.txt
SANDBOX_RUNTIME=runsc pnpm --filter api test:sandbox 2>&1 | tee spike-iso-runsc.txt
pnpm --filter api test -- handle-exec          # ca Review Focus 5 chạy thật trên Linux
```

Ghi kết quả vào báo cáo (điều D2a). Test nào đỏ trên `runsc` mà xanh trên `runc` thì ghi đích danh. `runsc` vì thế trượt D2, trừ khi sửa được mà không nới test.

- [ ] **Step 3: Viết test hỏng cho phần thống kê**

```ts
// apps/api/src/sandbox-spike/stats.spec.ts
import { decide, logLogSlope, median, std, Summary, summarize } from './stats';

describe('thống kê buổi thử', () => {
  it('median, std mẫu', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(std([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 3);
    expect(std([5])).toBe(0);
  });

  it('độ dốc log–log: t = n² → 2; t = n → 1', () => {
    const ns = [1, 2, 4, 8, 16, 32];
    expect(logLogSlope(ns.map((n) => ({ n, t: n * n })))).toBeCloseTo(2, 6);
    expect(logLogSlope(ns.map((n) => ({ n, t: 3 * n })))).toBeCloseTo(1, 6);
  });

  it('summarize bỏ lượt hỏng nhưng đếm nó', () => {
    const s = summarize([
      { perN: new Map([[1, 10], [2, 20]]), slope: 1 },
      null,
      { perN: new Map([[1, 12], [2, 22]]), slope: 1.1 },
    ]);
    expect(s).toMatchObject({ sessions: 2, failed: 1 });
    expect(s.slopeMean).toBeCloseTo(1.05, 6);
  });
});

describe('decide — luật D1–D4, chốt trước khi đo', () => {
  const S = (slopeStd: number, meanCv: number): Summary => ({ sessions: 8, failed: 0, slopeMean: 1, slopeStd, meanCv });
  const facts = { isoPassed: true, interferenceDetected: true, caseP95Ms: 900 };
  const base = () =>
    new Map<string, Summary>([
      ['runc|in_process|1|p', S(0.02, 0.05)], ['runc|process|1|p', S(0.05, 0.08)],
      ['runsc|in_process|1|p', S(0.022, 0.055)], ['runsc|process|1|p', S(0.09, 0.2)],
      ['runsc|in_process|2|p', S(0.021, 0.054)], ['runsc|in_process|4|p', S(0.03, 0.07)],
    ]);
  const input = (summaries = base(), f = { runc: facts, runsc: facts }) =>
    ({ summaries, facts: f, programs: ['p'], cppPrograms: ['p'], ks: [1, 2, 4] });

  it('in_process ổn định hơn → D1 chọn in_process; runsc trong 1,2× → D2 chọn runsc; K = 4 lệch quá 1,1× → D3 chọn 2', () => {
    expect(decide(input())).toMatchObject({ mode: 'in_process', runtime: 'runsc', k: 2, usable: true });
  });

  it('runsc trượt test:sandbox → runc, dù đo đẹp', () => {
    expect(decide(input(base(), { runc: facts, runsc: { ...facts, isoPassed: false } })).runtime).toBe('runc');
  });

  it('runsc không phát hiện được tiến trình nền → runc', () => {
    expect(decide(input(base(), { runc: facts, runsc: { ...facts, interferenceDetected: false } })).runtime).toBe('runc');
  });

  it('chưa đo runsc → runc, và nói ra', () => {
    const d = decide(input(base(), { runc: facts } as never));
    expect(d.runtime).toBe('runc');
    expect(d.reasons.join(' ')).toMatch(/runsc/);
  });

  it('D4: độ tản quá 0,10 ở cấu hình đã chọn → usable false', () => {
    const m = base();
    m.set('runc|in_process|1|p', S(0.2, 0.3));
    m.set('runc|process|1|p', S(0.3, 0.3));
    m.set('runsc|in_process|1|p', S(0.2, 0.3));
    const d = decide(input(m));
    expect(d).toMatchObject({ mode: 'in_process', runtime: 'runsc', usable: false });
  });
});
```

- [ ] **Step 4: Chạy test, xác nhận hỏng**

Run: `pnpm --filter api test -- sandbox-spike`
Expected: FAIL.

- [ ] **Step 5: Viết `stats.ts`**

```ts
// apps/api/src/sandbox-spike/stats.ts
import { MeasureResult } from '../sandbox/contract';

export const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
export const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
export function std(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}

/** Bình phương tối thiểu của ln t theo ln n. Chỉ để đo ĐỘ TẢN — bước 4 khớp nhiều mô hình (§3.1). */
export function logLogSlope(points: { n: number; t: number }[]): number {
  const x = points.map((p) => Math.log(p.n));
  const y = points.map((p) => Math.log(p.t));
  const mx = mean(x);
  const my = mean(y);
  const num = x.reduce((a, xi, i) => a + (xi - mx) * (y[i] - my), 0);
  const den = x.reduce((a, xi) => a + (xi - mx) ** 2, 0);
  return num / den;
}

export interface Session {
  perN: Map<number, number>;
  slope: number;
}

/**
 * Một job đo → một lượt: trung vị theo từng n của BÀI, trừ hằng số `c`
 * (trung vị baseline). Lượt bị dừng, hỏng, hay có mẫu không `ok` → null.
 */
export function sessionOf(r: MeasureResult, field: 'innerNs' | 'outerNs'): Session | null {
  if (r.unavailable || r.aborted) return null;
  const mine = r.samples.filter((s) => s.program === 'submission');
  if (mine.length === 0 || mine.some((s) => s.status !== 'ok' || s[field] === null)) return null;
  const base = r.baseline.filter((b) => b.program === 'submission').map((b) => b[field]).filter((v): v is number => v !== null);
  const c = base.length ? median(base) : 0;
  const perN = new Map<number, number>();
  for (const n of [...new Set(mine.map((s) => s.n))].sort((a, b) => a - b)) {
    perN.set(n, Math.max(1, median(mine.filter((s) => s.n === n).map((s) => s[field] as number)) - c));
  }
  return { perN, slope: logLogSlope([...perN].map(([n, t]) => ({ n, t }))) };
}

export interface Summary {
  sessions: number;
  failed: number;
  slopeMean: number;
  slopeStd: number;
  meanCv: number;
}

export function summarize(sessions: (Session | null)[]): Summary {
  const ok = sessions.filter((s): s is Session => s !== null);
  const ns = ok.length ? [...ok[0].perN.keys()] : [];
  const cvs = ns.map((n) => {
    const ts = ok.map((s) => s.perN.get(n)!).filter((t) => t !== undefined);
    return std(ts) / mean(ts);
  });
  return {
    sessions: ok.length,
    failed: sessions.length - ok.length,
    slopeMean: ok.length ? mean(ok.map((s) => s.slope)) : NaN,
    slopeStd: std(ok.map((s) => s.slope)),
    meanCv: cvs.length ? mean(cvs) : NaN,
  };
}

export interface RuntimeFacts {
  isoPassed: boolean;
  interferenceDetected: boolean;
  caseP95Ms: number;
}

export interface Decision {
  mode: 'in_process' | 'process';
  runtime: 'runc' | 'runsc';
  k: number;
  usable: boolean;
  reasons: string[];
}

const key = (runtime: string, mode: string, k: number, program: string) => `${runtime}|${mode}|${k}|${program}`;

/** Luật D1–D4 của plan 2026-09-24-sandbox-worker, Task 9 — chốt trước khi đo. */
export function decide(input: {
  summaries: Map<string, Summary>;
  facts: Partial<Record<'runc' | 'runsc', RuntimeFacts>>;
  programs: string[];
  cppPrograms: string[];
  ks: number[];
}): Decision {
  const { summaries: S, facts, programs } = input;
  const get = (r: string, m: string, k: number, p: string) => S.get(key(r, m, k, p));
  const reasons: string[] = [];

  // D1
  const inProcessWins = programs.every((p) => {
    const a = get('runc', 'in_process', 1, p);
    const b = get('runc', 'process', 1, p);
    return a !== undefined && b !== undefined && a.slopeStd <= b.slopeStd;
  });
  const mode = inProcessWins ? 'in_process' : 'process';
  reasons.push(`D1: ${mode} (${inProcessWins ? 'ổn định ít nhất bằng' : 'kém ổn định hơn'} bấm giờ cả tiến trình trên runc)`);

  // D2
  let runtime: 'runc' | 'runsc' = 'runc';
  const f = facts.runsc;
  if (!f) {
    reasons.push('D2: runc — không có số đo của runsc (chưa cài hoặc chưa chạy)');
  } else {
    const checks: [boolean, string][] = [
      [f.isoPassed, 'test:sandbox xanh'],
      [f.interferenceDetected, 'phát hiện tiến trình nền'],
      [f.caseP95Ms <= 1_500, `p95 một ca ${Math.round(f.caseP95Ms)} ms ≤ 1500`],
      ...programs.map((p): [boolean, string] => {
        const a = get('runsc', mode, 1, p);
        const b = get('runc', mode, 1, p);
        const ok = !!a && !!b && a.slopeStd <= 1.2 * b.slopeStd && a.meanCv <= 1.2 * b.meanCv;
        return [ok, `${p}: độ tản trong 1,2× runc`];
      }),
    ];
    const failed = checks.filter(([ok]) => !ok).map(([, label]) => label);
    runtime = failed.length === 0 ? 'runsc' : 'runc';
    reasons.push(failed.length === 0 ? 'D2: runsc — qua cả năm điều kiện' : `D2: runc — runsc trượt: ${failed.join('; ')}`);
  }

  // D3
  let k = 1;
  for (const candidate of [...input.ks].sort((a, b) => a - b)) {
    if (candidate === 1) continue;
    const ok = programs.every((p) => {
      const a = get(runtime, mode, candidate, p);
      const b = get(runtime, mode, 1, p);
      return !!a && !!b && a.slopeStd <= 1.1 * b.slopeStd && a.meanCv <= 1.1 * b.meanCv;
    });
    if (!ok) break;
    k = candidate;
  }
  reasons.push(`D3: K = ${k}`);

  // D4
  const usable = input.cppPrograms.every((p) => (get(runtime, mode, 1, p)?.slopeStd ?? Infinity) <= 0.1);
  reasons.push(usable ? 'D4: dùng được — độ lệch chuẩn độ dốc ≤ 0,10 ở mọi chương trình C++' : 'D4: KHÔNG dùng được — ghi vào rủi ro 1 của spec §11');

  return { mode, runtime, k, usable, reasons };
}
```

- [ ] **Step 6: Chương trình đo, bộ chạy, bộ sinh báo cáo**

```ts
// apps/api/src/sandbox-spike/programs.ts
import { ProgramSpec, SandboxLanguage } from '../sandbox/contract';

export interface SpikeProgram {
  id: string;
  language: SandboxLanguage;
  ns: number[];
  work: string;
}

const pow2 = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => 2 ** (from + i));
const inline = (content: string) => ({ kind: 'inline' as const, content });

const CPP_CHECKSUM = `static unsigned long long checksum(const std::vector<long long>& a) {
  unsigned long long s = 0;
  for (size_t i = 0; i < a.size(); i++) s = s * 1000003ULL + (unsigned long long)a[i];
  return s;
}
`;
const CPP_WORK = {
  linear: `#include <vector>
unsigned long long work(std::vector<long long>& a) {
  unsigned long long s = 0;
  for (long long x : a) s += (unsigned long long)x * 2654435761ULL;
  return s;
}
`,
  nlogn: `#include <vector>
${CPP_CHECKSUM}static void sort_(std::vector<long long>& a, std::vector<long long>& t, size_t l, size_t r) {
  if (r - l < 2) return;
  size_t m = l + (r - l) / 2;
  sort_(a, t, l, m); sort_(a, t, m, r);
  size_t i = l, j = m, k = l;
  while (i < m && j < r) t[k++] = a[i] <= a[j] ? a[i++] : a[j++];
  while (i < m) t[k++] = a[i++];
  while (j < r) t[k++] = a[j++];
  for (size_t q = l; q < r; q++) a[q] = t[q];
}
unsigned long long work(std::vector<long long>& a) {
  std::vector<long long> t(a.size());
  sort_(a, t, 0, a.size());
  return checksum(a);
}
`,
  quadratic: `#include <vector>
${CPP_CHECKSUM}unsigned long long work(std::vector<long long>& a) {
  for (size_t i = 1; i < a.size(); i++) {
    long long x = a[i]; size_t j = i;
    while (j > 0 && a[j - 1] > x) { a[j] = a[j - 1]; j--; }
    a[j] = x;
  }
  return checksum(a);
}
`,
};

const CPP_READ = `  int n;
  if (std::scanf("%d", &n) != 1) return 1;
  std::vector<long long> a(n);
  for (auto& x : a) std::scanf("%lld", &x);
`;
const CPP_DRIVER = {
  in_process: `#include <cstdio>
#include <vector>
#include <cine_timing.h>
unsigned long long work(std::vector<long long>& a);
int main() {
${CPP_READ}  cine::begin();
  unsigned long long r = work(a);
  cine::keep(r);
  cine::stop();
  cine::report(r);
}
`,
  process: `#include <cstdio>
#include <vector>
unsigned long long work(std::vector<long long>& a);
int main() {
${CPP_READ}  std::printf("%llu\\n", work(a));
}
`,
};

const PY_WORK = {
  nlogn: `def _merge(a):
    if len(a) < 2:
        return a
    m = len(a) // 2
    left, right = _merge(a[:m]), _merge(a[m:])
    out, i, j = [], 0, 0
    while i < len(left) and j < len(right):
        if left[i] <= right[j]:
            out.append(left[i]); i += 1
        else:
            out.append(right[j]); j += 1
    out.extend(left[i:]); out.extend(right[j:])
    return out


def work(a):
    s = 0
    for x in _merge(a):
        s = (s * 1000003 + x) % (1 << 61)
    return s
`,
  quadratic: `def work(a):
    for i in range(1, len(a)):
        x, j = a[i], i
        while j > 0 and a[j - 1] > x:
            a[j] = a[j - 1]; j -= 1
        a[j] = x
    s = 0
    for x in a:
        s = (s * 1000003 + x) % (1 << 61)
    return s
`,
};
const PY_READ = `import sys
sys.stdin.readline()
a = list(map(int, sys.stdin.readline().split()))
`;
const PY_DRIVER = {
  in_process: `${PY_READ}import cine_timing
from bai import work
cine_timing.begin()
r = work(a)
cine_timing.stop()
cine_timing.report(r)
`,
  process: `${PY_READ}from bai import work
print(work(a))
`,
};

export const SPIKE_PROGRAMS: SpikeProgram[] = [
  { id: 'cpp-linear', language: 'cpp', ns: pow2(16, 21), work: CPP_WORK.linear },
  { id: 'cpp-nlogn', language: 'cpp', ns: pow2(14, 19), work: CPP_WORK.nlogn },
  { id: 'cpp-quadratic', language: 'cpp', ns: pow2(10, 15), work: CPP_WORK.quadratic },
  { id: 'py-nlogn', language: 'python', ns: pow2(10, 15), work: PY_WORK.nlogn },
  { id: 'py-quadratic', language: 'python', ns: pow2(7, 12), work: PY_WORK.quadratic },
];

export function specOf(p: Pick<SpikeProgram, 'language' | 'work'>, mode: 'in_process' | 'process'): ProgramSpec {
  return p.language === 'cpp'
    ? { files: [{ path: 'main.cpp', ref: inline(p.work) }], driver: inline(CPP_DRIVER[mode]), entry: null }
    : { files: [{ path: 'bai.py', ref: inline(p.work) }], driver: inline(PY_DRIVER[mode]), entry: null };
}

/** Đáp án mẫu chạy xen kẽ trong mọi job đo của buổi thử: bản n log n cùng ngôn ngữ. */
export function referenceOf(language: SandboxLanguage, mode: 'in_process' | 'process'): ProgramSpec {
  return specOf({ language, work: language === 'cpp' ? CPP_WORK.nlogn : PY_WORK.nlogn }, mode);
}

/** Bài để lại tiến trình nền — để kiểm phát hiện `interference` chạy được trên runtime đang thử. */
export const CPP_FORKER = `#include <unistd.h>
#include <vector>
unsigned long long work(std::vector<long long>& a) {
  if (fork() == 0) { setsid(); for (;;) sleep(1); }
  return a.size();
}
`;
```

```ts
// apps/api/src/sandbox-spike/report.ts
import { HostFingerprint } from '../sandbox/contract';
import { Decision, RuntimeFacts, Summary } from './stats';

const f3 = (x: number) => (Number.isFinite(x) ? x.toFixed(3) : '—');

export function renderReport(p: {
  hosts: Partial<Record<string, HostFingerprint>>;
  summaries: Map<string, Summary>;
  outer: Map<string, Summary>;
  facts: Partial<Record<string, RuntimeFacts>>;
  decision: Decision;
  sessions: number;
}): string {
  const rows = [...p.summaries].sort(([a], [b]) => a.localeCompare(b)).map(([k, s]) => {
    const [runtime, mode, K, program] = k.split('|');
    const o = p.outer.get(k);
    return `| ${runtime} | ${mode} | ${K} | ${program} | ${f3(s.slopeMean)} | ${f3(s.slopeStd)} | ${f3(s.meanCv)} | ${o ? f3(o.slopeStd) : '—'} | ${s.sessions}/${s.sessions + s.failed} |`;
  });
  const hostRows = Object.entries(p.hosts).map(([r, h]) =>
    `| ${r} | ${h!.hostname} | ${h!.cpuModel} × ${h!.cpuCount} | ${h!.kernel} | ${h!.dockerVersion} | ${Object.values(h!.images).join('<br>')} |`);
  const factRows = Object.entries(p.facts).map(([r, f]) =>
    `| ${r} | ${f!.isoPassed ? 'xanh' : '**đỏ**'} | ${f!.interferenceDetected ? 'có' : '**không**'} | ${Math.round(f!.caseP95Ms)} |`);
  return [
    '## Máy',
    '',
    '| Runtime | Máy | CPU | Kernel | Docker | Image |',
    '|---|---|---|---|---|---|',
    ...hostRows,
    '',
    '## Cô lập và chi phí một ca',
    '',
    '| Runtime | `test:sandbox` | Phát hiện tiến trình nền | p95 một ca kiểm (ms) |',
    '|---|---|---|---|',
    ...factRows,
    '',
    `## Độ tản của phép đo — ${p.sessions} lượt mỗi ô`,
    '',
    'Độ dốc là độ dốc log–log của trung vị theo n sau khi trừ `c`. Chỉ dùng để đo độ tản; kết luận lớp độ phức tạp là việc của bước 4 (§3.1).',
    '',
    '| Runtime | Bấm giờ | K | Chương trình | Độ dốc TB | Độ lệch chuẩn độ dốc | CV TB | Độ lệch chuẩn độ dốc (số đo ngoài) | Lượt dùng được |',
    '|---|---|---|---|---|---|---|---|---|',
    ...rows,
    '',
    '## Quyết định theo luật D1–D4',
    '',
    ...p.decision.reasons.map((r) => `- ${r}`),
    '',
    `**Kết luận máy tính:** runtime \`${p.decision.runtime}\`, bấm giờ \`${p.decision.mode}\`, K = ${p.decision.k}, ${p.decision.usable ? 'dùng được' : '**không dùng được**'}.`,
    '',
  ].join('\n');
}
```

```ts
// apps/api/src/sandbox-spike/spike.ts
import { randomUUID } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { HostFingerprint, MeasureResult, SANDBOX_CONTRACT_VERSION } from '../sandbox/contract';
import { spawnCli } from '../sandbox-worker/docker-cli';
import { readFingerprint } from '../sandbox-worker/fingerprint';
import { handleExec, WorkerDeps } from '../sandbox-worker/handle-exec';
import { handleMeasure } from '../sandbox-worker/handle-measure';
import { CPP_FORKER, referenceOf, SPIKE_PROGRAMS, specOf, SpikeProgram } from './programs';
import { renderReport } from './report';
import { decide, RuntimeFacts, sessionOf, summarize } from './stats';

type Mode = 'in_process' | 'process';
type Runtime = 'runc' | 'runsc';
const IMAGES = { cpp: 'cine-sandbox-cpp:1', python: 'cine-sandbox-python:1' };

function arg(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
}

async function depsFor(runtime: Runtime, workRoot: string): Promise<WorkerDeps> {
  const docker = spawnCli();
  const host = await readFingerprint(docker, { runtime, images: IMAGES, version: 'spike' });
  return { runner: { docker, runtime, images: IMAGES, fetchPolicy: { allowedHosts: [], allowHttp: false, maxBytes: 1 << 26 } }, host, workRoot };
}

function measureOnce(deps: WorkerDeps, p: SpikeProgram, mode: Mode, slot: string): Promise<MeasureResult> {
  return handleMeasure(
    {
      contract: SANDBOX_CONTRACT_VERSION, kind: 'measure', jobId: randomUUID(), language: p.language, timingMode: mode,
      submission: specOf(p, mode), reference: referenceOf(p.language, mode),
      points: p.ns.map((n) => ({ n, stdin: { kind: 'generate', generator: 'int_array', n, lo: 0, hi: 1_000_000, seed: n } })),
      repeats: 5, limits: { wallMsPerCase: 20_000, memoryMb: 1_024 },
    },
    deps,
    slot,
  );
}

async function caseP95(deps: WorkerDeps, runs: number): Promise<number> {
  const ms: number[] = [];
  for (let i = 0; i < runs; i++) {
    const r = await handleExec(
      {
        contract: SANDBOX_CONTRACT_VERSION, kind: 'exec', jobId: randomUUID(), language: 'cpp', sanitize: true,
        program: { files: [{ path: 'main.cpp', ref: { kind: 'inline', content: '#include <cstdio>\nint main(){std::puts("ok");}\n' } }], driver: null, entry: null },
        cases: [{ name: 'a', group: null, stdin: { kind: 'inline', content: '' }, expected: { kind: 'inline', content: 'ok\n' } }],
      },
      deps,
      null,
    );
    if (r.cases[0]?.status !== 'pass') throw new Error(`ca thử chi phí không qua: ${JSON.stringify(r).slice(0, 300)}`);
    ms.push(r.cases[0].ms);
  }
  ms.sort((a, b) => a - b);
  return ms[Math.min(ms.length - 1, Math.floor(0.95 * ms.length))];
}

async function main() {
  const out = arg('out') ?? join(process.cwd(), 'spike-out');
  const cpusets = (arg('cpusets') ?? '').split('|').filter(Boolean);
  if (cpusets.length === 0) throw new Error('--cpusets bắt buộc, ví dụ --cpusets="2|3|4|5" — buổi thử phải ghim lõi');
  const sessions = Number(arg('sessions') ?? 8);
  const phase = arg('phase') ?? 'a';
  const workRoot = join(out, 'work');
  mkdirSync(workRoot, { recursive: true });
  const log = join(out, 'samples.jsonl');
  const factsFile = join(out, 'facts.json');
  const facts: Record<string, RuntimeFacts> = existsSync(factsFile) ? JSON.parse(readFileSync(factsFile, 'utf8')) : {};
  const hosts: Partial<Record<string, HostFingerprint>> = {};
  const record = (row: object) => appendFileSync(log, `${JSON.stringify(row)}\n`);

  if (phase === 'a') {
    const iso = new Set((arg('iso-passed') ?? '').split(',').filter(Boolean));
    for (const runtime of ['runc', 'runsc'] as Runtime[]) {
      let deps: WorkerDeps;
      try {
        deps = await depsFor(runtime, workRoot);
      } catch (error) {
        console.log(`bỏ qua ${runtime}: ${error instanceof Error ? error.message : error}`);
        continue;
      }
      hosts[runtime] = deps.host;
      const forker = await handleMeasure(
        {
          contract: SANDBOX_CONTRACT_VERSION, kind: 'measure', jobId: randomUUID(), language: 'cpp', timingMode: 'in_process',
          submission: specOf({ language: 'cpp', work: CPP_FORKER }, 'in_process'), reference: null,
          points: [{ n: 100, stdin: { kind: 'generate', generator: 'int_array', n: 100, lo: 0, hi: 9, seed: 1 } }], repeats: 1,
        },
        deps,
        cpusets[0],
      );
      facts[runtime] = { isoPassed: iso.has(runtime), interferenceDetected: forker.aborted === 'interference', caseP95Ms: await caseP95(deps, 30) };
      writeFileSync(factsFile, JSON.stringify(facts, null, 2));
      for (const mode of ['in_process', 'process'] as Mode[]) {
        for (const p of SPIKE_PROGRAMS) {
          for (let s = 0; s < sessions; s++) {
            const result = await measureOnce(deps, p, mode, cpusets[0]);
            record({ runtime, mode, k: 1, program: p.id, session: s, result });
            console.log(`${runtime} ${mode} K=1 ${p.id} #${s}: ${result.unavailable ?? result.aborted ?? 'ok'}`);
          }
        }
      }
    }
  } else {
    const runtime = arg('runtime') as Runtime;
    const mode = arg('mode') as Mode;
    const deps = await depsFor(runtime, workRoot);
    hosts[runtime] = deps.host;
    for (const k of [2, 4]) {
      if (k > cpusets.length) {
        console.log(`bỏ qua K=${k}: máy chỉ có ${cpusets.length} khe`);
        continue;
      }
      for (const p of SPIKE_PROGRAMS) {
        for (let s = 0; s < sessions; s += k) {
          const batch = await Promise.all(cpusets.slice(0, k).map((slot) => measureOnce(deps, p, mode, slot)));
          batch.forEach((result, j) => record({ runtime, mode, k, program: p.id, session: s + j, result }));
          console.log(`${runtime} ${mode} K=${k} ${p.id} #${s}…${s + k - 1}`);
        }
      }
    }
  }

  const byKey = new Map<string, MeasureResult[]>();
  for (const line of readFileSync(log, 'utf8').split('\n').filter(Boolean)) {
    const row = JSON.parse(line);
    const key = `${row.runtime}|${row.mode}|${row.k}|${row.program}`;
    byKey.set(key, [...(byKey.get(key) ?? []), row.result]);
  }
  const summaries = new Map([...byKey].map(([k, rs]) => [k, summarize(rs.map((r) => sessionOf(r, 'innerNs')))]));
  const outer = new Map([...byKey].map(([k, rs]) => [k, summarize(rs.map((r) => sessionOf(r, 'outerNs')))]));
  const ks = [...new Set([...byKey.keys()].map((k) => Number(k.split('|')[2])))];
  const decision = decide({
    summaries, facts,
    programs: SPIKE_PROGRAMS.map((p) => p.id),
    cppPrograms: SPIKE_PROGRAMS.filter((p) => p.language === 'cpp').map((p) => p.id),
    ks,
  });
  writeFileSync(join(out, 'summary.json'), JSON.stringify({ summaries: [...summaries], outer: [...outer], facts, decision }, null, 2));
  writeFileSync(join(out, 'report-draft.md'), renderReport({ hosts, summaries, outer, facts, decision, sessions }));
  console.log(decision.reasons.join('\n'));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

`apps/api/package.json` → `scripts`:

```json
"sandbox:spike": "node -r ts-node/register -r tsconfig-paths/register src/sandbox-spike/spike.ts",
```

- [ ] **Step 7: Chạy test thống kê, rồi commit phần mã**

Run: `pnpm --filter api test -- sandbox-spike && pnpm --filter api build`
Expected: PASS.

```bash
git add apps/api/src/sandbox-spike apps/api/package.json
git commit -m "feat(sandbox): buổi thử cô lập — chạy đúng đường đo production, luật D1–D4 chốt trước khi đo"
```

- [ ] **Step 8: Đo — pha A (runtime × cách bấm giờ, K = 1)**

Trên máy sandbox, chọn các khe **không** gồm lõi 0 (lõi 0 nhận ngắt của hệ thống). Ví dụ máy 6 lõi: `--cpusets="2|3|4|5"`, để lõi 0–1 cho hệ thống và job kiểm.

```bash
pnpm --filter api sandbox:spike -- --phase=a --cpusets="2|3|4|5" --sessions=8 --out=spike-out \
  --iso-passed=runc,runsc     # chỉ ghi runtime nào đã xanh ở Step 2
```

Pha này mất vài giờ (5 chương trình × 2 cách bấm giờ × 2 runtime × 8 lượt), nên chạy qua đêm được. Không dùng máy vào việc khác trong lúc đo.

- [ ] **Step 9: Đo — pha B (K = 2, 4) trên runtime và cách bấm giờ đã chọn ở pha A**

Đọc `spike-out/report-draft.md`, lấy runtime và cách bấm giờ theo D1, D2. Run:

```bash
pnpm --filter api sandbox:spike -- --phase=b --runtime=<runtime> --mode=<mode> --cpusets="2|3|4|5" --sessions=8 --out=spike-out
```

- [ ] **Step 10: Viết báo cáo**

Tạo `docs/superpowers/reports/2026-09-24-sandbox-isolation-spike.md`:

```markdown
# Buổi thử chọn cách cô lập sandbox (spec 2026-09-20 §3.5)

**Ngày đo:** … · **Commit:** … · **Máy:** … (máy thật / máy tạm — đo lại khi chốt máy)

## Câu hỏi
Chọn runtime (runc đã siết hay gVisor), cách bấm giờ (trong tiến trình hay cả tiến trình), và số
khe đo K — theo luật D1–D4 chốt trước khi đo (plan 2026-09-24-sandbox-worker, Task 9).

<!-- dán nguyên nội dung spike-out/report-draft.md ở đây -->

## Vòng job qua Redis
(điền ở Task 13)

## Hệ quả cho spec
- K = … → phần đo của một phiên 40 bài, mỗi bài một job đo khoảng … giây: … phút xếp hàng. So với
  mục tiêu 30 phút của §15.2: …
- `docker top` trên runsc: …
- Điều gì làm kết luận này sai: …
```

Dán nguyên `report-draft.md` vào chỗ đánh dấu. Viết phần *"Hệ quả cho spec"* bằng số đo, không bằng cảm giác.

- [ ] **Step 11: Commit báo cáo** (chủ đồ án commit phần docs — xem ghi chú ở cuối plan)

---

### Task 10: `SandboxClient` phía API — `T-ISO-4`, `T-DOWN-1`

**Files:**
- Create: `apps/api/src/sandbox/sandbox.client.ts`
- Test: `apps/api/src/sandbox/sandbox.client.spec.ts`

**Interfaces:**
- Consumes: hợp đồng (Task 1), `buildRedisConnection`.
- Produces:

```ts
export interface WaitableJob { waitUntilFinished(events: unknown, ttl?: number): Promise<unknown>; remove(): Promise<void> }
export interface JobQueue { add(name: string, data: unknown, opts: { jobId: string; attempts: number; removeOnComplete: { age: number }; removeOnFail: { age: number } }): Promise<WaitableJob> }
export interface Channel { queue: JobQueue; events: unknown }
export type ExecRequest = Omit<ExecJobInput, 'contract' | 'kind' | 'jobId'>;
export type MeasureRequest = Omit<MeasureJobInput, 'contract' | 'kind' | 'jobId'>;
export class SandboxClient {
  constructor(o: { exec: Channel; measure: Channel; timeoutMs: { exec: number; measure: number }; warn?: (m: string) => void });
  exec(request: ExecRequest): Promise<ExecResult>;
  measure(request: MeasureRequest): Promise<MeasureResult>;
}
export function createSandboxClient(o: { redisUrl: string; prefix?: string; timeoutMs?: { exec: number; measure: number } }): { client: SandboxClient; close(): Promise<void> };
```

`SandboxClient` **không bao giờ ném** vì sandbox. Mọi sự cố ra kết quả `unavailable`, để công cụ ở bước 2 xử lý như một kết cục hạng nhất (§4.4). Ngoại lệ duy nhất: job do chính API dựng mà sai schema. Đó là lỗi của API, nên nổ ngay, không gửi đi.

- [ ] **Step 1: Viết test hỏng**

```ts
// apps/api/src/sandbox/sandbox.client.spec.ts
import { Channel, SandboxClient, WaitableJob } from './sandbox.client';

const inline = (content: string) => ({ kind: 'inline' as const, content });
const request = {
  language: 'cpp' as const,
  program: { files: [{ path: 'main.cpp', ref: inline('int main(){}') }], driver: null, entry: null },
  cases: [{ name: 'a', group: null, stdin: inline(''), expected: inline('') }],
};
const host = {
  hostname: 'h', cpuModel: 'c', cpuCount: 2, kernel: 'k', runtime: 'runc' as const,
  dockerVersion: '27', images: { cpp: 'sha256:a' }, workerVersion: 'v',
};
const resultFor = (jobId: string) => ({
  contract: 1, kind: 'exec', jobId, host, compile: { ok: true, log: '', ms: 1 },
  cases: [{ name: 'a', group: null, status: 'pass', ms: 5, stdout: null, diff: null, limitsHit: [] }],
  totalMs: 9, unavailable: null,
});

function channel(answer: (payload: { jobId: string }) => unknown | Promise<unknown>): Channel & { sent: { jobId: string }[]; removed: number } {
  const ch = {
    sent: [] as { jobId: string }[],
    removed: 0,
    events: {},
    queue: {
      add: async (_name: string, data: unknown): Promise<WaitableJob> => {
        const payload = data as { jobId: string };
        ch.sent.push(payload);
        return {
          waitUntilFinished: async () => answer(payload),
          remove: async () => {
            ch.removed++;
          },
        };
      },
    },
  };
  return ch;
}
const client = (exec: Channel, measure: Channel = channel(() => null), timeout = 1_000) =>
  new SandboxClient({ exec, measure, timeoutMs: { exec: timeout, measure: timeout } });

describe('SandboxClient', () => {
  it('kết quả đúng schema, đúng jobId → trả nguyên', async () => {
    const ch = channel((p) => resultFor(p.jobId));
    const r = await client(ch).exec(request);
    expect(r.unavailable).toBeNull();
    expect(r.jobId).toBe(ch.sent[0].jobId);
    expect(ch.sent[0]).toMatchObject({ contract: 1, kind: 'exec', sanitize: true });
  });

  it('T-ISO-4 — kết quả mang jobId của job KHÁC → unavailable, không trả kết quả đó', async () => {
    const r = await client(channel(() => resultFor('6f1c2a4e-9d7b-4c1a-8e3f-2b5d7a9c0e11'))).exec(request);
    expect(r.unavailable).toMatch(/không khớp jobId/);
    expect(r.cases).toEqual([]);
  });

  it('T-ISO-4 — kết quả sai schema → unavailable', async () => {
    const r = await client(channel((p) => ({ ...resultFor(p.jobId), cases: [{ status: 'hacked' }] }))).exec(request);
    expect(r.unavailable).toMatch(/sai schema/);
  });

  it('T-ISO-4 — kết quả thật mà thiếu dấu vân tay máy → unavailable', async () => {
    const r = await client(channel((p) => ({ ...resultFor(p.jobId), host: null }))).exec(request);
    expect(r.unavailable).toMatch(/sai schema/);
  });

  it('T-DOWN-1 — Redis không nhận job → unavailable, KHÔNG phải một ca fail', async () => {
    const down: Channel = { events: {}, queue: { add: async () => { throw new Error('connect ECONNREFUSED'); } } };
    const r = await client(down).exec(request);
    expect(r.unavailable).toMatch(/sandbox không trả lời: connect ECONNREFUSED/);
    expect(r.cases).toEqual([]);
  });

  it('T-DOWN-1 — worker không trả lời trong hạn → unavailable, và job bị gỡ khỏi hàng đợi', async () => {
    const ch = channel(() => new Promise(() => undefined));
    const r = await client(ch, undefined, 50).exec(request);
    expect(r.unavailable).toMatch(/sandbox không trả lời/);
    expect(ch.removed).toBe(1);
  });

  it('T-DOWN-1 — add treo (Redis mất kết nối giữa chừng) → vẫn unavailable đúng hạn', async () => {
    const hang: Channel = { events: {}, queue: { add: () => new Promise(() => undefined) } };
    const started = Date.now();
    const r = await client(hang, undefined, 50).exec(request);
    expect(r.unavailable).toMatch(/sandbox không trả lời/);
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it('job do API dựng sai schema → ném NGAY, không gửi gì', async () => {
    const ch = channel((p) => resultFor(p.jobId));
    await expect(client(ch).exec({ ...request, language: 'java' as never })).rejects.toThrow();
    expect(ch.sent).toEqual([]);
  });

  it('measure đi hàng đợi measure, không đi hàng đợi exec', async () => {
    const exec = channel(() => null);
    const measure = channel((p) => ({
      contract: 1, kind: 'measure', jobId: p.jobId, host, slot: '2', timingMode: 'in_process',
      compile: null, baseline: [], samples: [], aborted: null,
      startedAt: '2026-09-24T00:00:00Z', finishedAt: '2026-09-24T00:00:01Z', unavailable: null,
    }));
    const r = await client(exec, measure).measure({
      language: 'cpp', timingMode: 'in_process',
      submission: { files: [{ path: 'main.cpp', ref: inline('') }], driver: inline(''), entry: null },
      reference: null, points: [{ n: 1, stdin: inline('1\n') }],
    });
    expect(r.unavailable).toBeNull();
    expect(exec.sent).toEqual([]);
    expect(measure.sent).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận hỏng**

Run: `pnpm --filter api test -- sandbox.client`
Expected: FAIL.

- [ ] **Step 3: Viết code**

```ts
// apps/api/src/sandbox/sandbox.client.ts
import { randomUUID } from 'node:crypto';
import { Queue, QueueEvents } from 'bullmq';
import { ZodType, ZodTypeAny, ZodTypeDef } from 'zod';
import { buildRedisConnection } from '../shared/redis-connection';
import {
  execJob,
  ExecJobInput,
  execResult,
  ExecResult,
  measureJob,
  MeasureJobInput,
  measureResult,
  MeasureResult,
  QUEUE_EXEC,
  QUEUE_MEASURE,
  SANDBOX_CONTRACT_VERSION,
  SANDBOX_PREFIX_DEFAULT,
  unavailableExec,
  unavailableMeasure,
} from './contract';

export interface WaitableJob {
  waitUntilFinished(events: unknown, ttl?: number): Promise<unknown>;
  remove(): Promise<void>;
}
export interface JobQueue {
  add(
    name: string,
    data: unknown,
    opts: { jobId: string; attempts: number; removeOnComplete: { age: number }; removeOnFail: { age: number } },
  ): Promise<WaitableJob>;
}
export interface Channel {
  queue: JobQueue;
  events: unknown;
}
export type ExecRequest = Omit<ExecJobInput, 'contract' | 'kind' | 'jobId'>;
export type MeasureRequest = Omit<MeasureJobInput, 'contract' | 'kind' | 'jobId'>;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`quá ${ms} ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

/**
 * Phía API của sandbox (spec §3.5 luật 3): gửi job, chờ, và KHÔNG tin kết quả
 * một cách mù quáng — sai schema hay lệch jobId thì từ chối. Không bao giờ
 * ném vì sandbox: mọi sự cố thành `unavailable` (T-DOWN-1), để một sự cố hạ
 * tầng không bao giờ trông như bài làm sai.
 */
export class SandboxClient {
  constructor(
    private readonly o: {
      exec: Channel;
      measure: Channel;
      timeoutMs: { exec: number; measure: number };
      warn?: (message: string) => void;
    },
  ) {}

  exec(request: ExecRequest): Promise<ExecResult> {
    return this.submit('exec', request, execJob, execResult, unavailableExec, this.o.exec, this.o.timeoutMs.exec);
  }

  measure(request: MeasureRequest): Promise<MeasureResult> {
    return this.submit('measure', request, measureJob, measureResult, unavailableMeasure, this.o.measure, this.o.timeoutMs.measure);
  }

  private async submit<R extends { jobId: string }>(
    kind: 'exec' | 'measure',
    request: object,
    jobSchema: ZodTypeAny,
    resultSchema: ZodType<R, ZodTypeDef, unknown>,
    unavailable: (jobId: string, reason: string) => R,
    channel: Channel,
    timeoutMs: number,
  ): Promise<R> {
    const jobId = randomUUID();
    // Job API dựng mà sai schema là lỗi của API: nổ ở đây, không thành một
    // lượt `unavailable` bí ẩn bên worker.
    const payload = jobSchema.parse({ contract: SANDBOX_CONTRACT_VERSION, kind, jobId, ...request });

    let job: WaitableJob | undefined;
    let raw: unknown;
    try {
      raw = await withTimeout(
        (async () => {
          job = await channel.queue.add(kind, payload, {
            jobId,
            attempts: 1,
            removeOnComplete: { age: 3_600 },
            removeOnFail: { age: 86_400 },
          });
          return job.waitUntilFinished(channel.events, timeoutMs);
        })(),
        timeoutMs + Math.min(5_000, timeoutMs),
      );
    } catch (error) {
      // Chưa ai lấy thì gỡ, để một worker sống lại không chạy job không ai chờ.
      await job?.remove().catch(() => undefined);
      return unavailable(jobId, `sandbox không trả lời: ${error instanceof Error ? error.message : String(error)}`);
    }

    const parsed = resultSchema.safeParse(raw);
    if (!parsed.success) {
      this.o.warn?.(`sandbox ${kind} ${jobId}: kết quả sai schema — ${parsed.error.issues[0]?.message}`);
      return unavailable(jobId, 'kết quả từ worker sai schema — đã từ chối');
    }
    if (parsed.data.jobId !== jobId) {
      this.o.warn?.(`sandbox ${kind} ${jobId}: kết quả mang jobId ${parsed.data.jobId}`);
      return unavailable(jobId, 'kết quả không khớp jobId — đã từ chối');
    }
    return parsed.data;
  }
}

export function createSandboxClient(o: {
  redisUrl: string;
  prefix?: string;
  timeoutMs?: { exec: number; measure: number };
}): { client: SandboxClient; close(): Promise<void> } {
  // skipVersionCheck: user ACL của sandbox (Task 12) không có INFO — cùng lý do với worker.
  const opts = { connection: buildRedisConnection({ REDIS_URL: o.redisUrl }), prefix: o.prefix ?? SANDBOX_PREFIX_DEFAULT, skipVersionCheck: true };
  const execQueue = new Queue(QUEUE_EXEC, opts);
  const execEvents = new QueueEvents(QUEUE_EXEC, opts);
  const measureQueue = new Queue(QUEUE_MEASURE, opts);
  const measureEvents = new QueueEvents(QUEUE_MEASURE, opts);
  const client = new SandboxClient({
    exec: { queue: execQueue, events: execEvents },
    measure: { queue: measureQueue, events: measureEvents },
    // Job đo có thể xếp hàng chờ khe (§3.5) — hạn của nó gồm cả thời gian chờ.
    timeoutMs: o.timeoutMs ?? { exec: 120_000, measure: 600_000 },
  });
  return {
    client,
    close: async () => {
      await Promise.all([execQueue.close(), execEvents.close(), measureQueue.close(), measureEvents.close()]);
    },
  };
}
```

Nếu tsc báo `Queue` không gán được vào `JobQueue` (kiểu `add` của BullMQ 6 khác), bọc bằng một adapter nhỏ `{ add: (n, d, opts) => execQueue.add(n, d, opts) }` thay vì ép kiểu.

- [ ] **Step 4: Chạy test, build**

Run: `pnpm --filter api test -- sandbox.client && pnpm --filter api build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/sandbox/sandbox.client.ts apps/api/src/sandbox/sandbox.client.spec.ts
git commit -m "feat(sandbox): SandboxClient — từ chối kết quả sai schema hay lệch jobId, sự cố thành unavailable (T-ISO-4, T-DOWN-1)"
```

---

### Task 11: Vòng đầy đủ qua Redis — và `T-ISO-7` tích hợp

**Files:**
- Create: `apps/api/test-sandbox/worker.sandbox-spec.ts`

Cần Redis local: `docker compose up -d redis` (cổng 6390, theo `docker-compose.yml` ở gốc repo).

- [ ] **Step 1: Viết test**

```ts
// apps/api/test-sandbox/worker.sandbox-spec.ts
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import IORedis from 'ioredis';
import { createSandboxClient } from '../src/sandbox/sandbox.client';
import { WorkerConfig } from '../src/sandbox-worker/config';
import { RunningWorker, startWorker } from '../src/sandbox-worker/main';
import { CPP_TIMED_DRIVER, gen, inline, RUNTIME } from './helpers';

const REDIS_URL = process.env.SANDBOX_TEST_REDIS_URL ?? 'redis://localhost:6390';
const suffix = randomUUID().slice(0, 8);
const prefixes = { real: `cine-sbx-test-real-${suffix}`, eval: `cine-sbx-test-eval-${suffix}` };

let worker: RunningWorker;
const clients: ReturnType<typeof createSandboxClient>[] = [];

beforeAll(async () => {
  const probe = new IORedis(REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
  try {
    await probe.connect();
    await probe.ping();
  } catch {
    throw new Error(`cần Redis ở ${REDIS_URL} — chạy: docker compose up -d redis`);
  } finally {
    probe.disconnect();
  }
  const cfg: WorkerConfig = {
    sources: [
      { name: 'real', redisUrl: REDIS_URL, prefix: prefixes.real },
      { name: 'eval', redisUrl: REDIS_URL, prefix: prefixes.eval },
    ],
    runtime: RUNTIME,
    images: { cpp: 'cine-sandbox-cpp:1', python: 'cine-sandbox-python:1' },
    timingCpusets: [null],   // K = 1
    generalCpuset: null,
    execConcurrency: 2,
    workRoot: join(tmpdir(), 'cine-sandbox-test'),
    allowedDownloadHosts: [],
    allowHttpDownloads: false,
    version: 'test',
    warnings: [],
  };
  worker = await startWorker(cfg);
});

afterAll(async () => {
  await Promise.all(clients.map((c) => c.close()));
  await worker?.close();
  const redis = new IORedis(REDIS_URL);
  for (const prefix of Object.values(prefixes)) {
    const keys = await redis.keys(`${prefix}:*`);
    if (keys.length) await redis.del(...keys);
  }
  redis.disconnect();
});

const clientFor = (prefix: string) => {
  const c = createSandboxClient({ redisUrl: REDIS_URL, prefix, timeoutMs: { exec: 60_000, measure: 300_000 } });
  clients.push(c);
  return c.client;
};

describe('worker sandbox qua Redis thật', () => {
  it('vòng đầy đủ: API → Redis → worker → container → Redis → API, kèm dấu vân tay thật', async () => {
    const r = await clientFor(prefixes.real).exec({
      language: 'cpp',
      program: { files: [{ path: 'main.cpp', ref: inline('#include <cstdio>\nint main(){std::puts("xin chao");}\n') }], driver: null, entry: null },
      cases: [{ name: 'a', group: null, stdin: inline(''), expected: inline('xin chao\n') }],
    });
    expect(r.unavailable).toBeNull();
    expect(r.cases[0].status).toBe('pass');
    expect(r.host?.images.cpp).toMatch(/^sha256:/);
  });

  it('T-ISO-7 — job đo của eval và của chấm thật không bao giờ chạy chồng trên một khe', async () => {
    const quadratic = `#include <vector>
unsigned long long work(const std::vector<long long>& a0) {
  std::vector<long long> a = a0;
  for (size_t i = 1; i < a.size(); i++) { long long x = a[i]; size_t j = i; while (j > 0 && a[j-1] > x) { a[j] = a[j-1]; j--; } a[j] = x; }
  return a.empty() ? 0 : a[0];
}
`;
    const req = {
      language: 'cpp' as const, timingMode: 'in_process' as const,
      submission: { files: [{ path: 'main.cpp', ref: inline(quadratic) }], driver: inline(CPP_TIMED_DRIVER), entry: null },
      reference: null,
      points: [{ n: 8_192, stdin: gen(8_192) }, { n: 16_384, stdin: gen(16_384) }],
      repeats: 3,
    };
    const [a, b] = await Promise.all([clientFor(prefixes.real).measure(req), clientFor(prefixes.eval).measure(req)]);
    expect(a.unavailable).toBeNull();
    expect(b.unavailable).toBeNull();
    const span = (r: typeof a) => [Date.parse(r.startedAt), Date.parse(r.finishedAt)];
    const [a0, a1] = span(a);
    const [b0, b1] = span(b);
    expect(a1 <= b0 || b1 <= a0).toBe(true);
  });
});
```

- [ ] **Step 2: Chạy**

Run: `docker compose up -d redis && pnpm --filter api test:sandbox -- worker`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/api/test-sandbox/worker.sandbox-spec.ts
git commit -m "test(sandbox): vòng đầy đủ qua Redis thật; T-ISO-7 tích hợp — hai nguồn, một khe"
```

---

### Task 12: ACL Redis, và tài liệu dựng máy sandbox

**Files:**
- Create: `apps/api/src/sandbox-worker/acl-rules.ts`
- Create: `apps/api/test-sandbox/acl.sandbox-spec.ts`
- Create: `docs/deploy/sandbox-worker.md`

**Interfaces:**
- Produces: `sandboxAclRules(prefix: string): string[]` — các token của `ACL SETUSER` sau phần tên và mật khẩu.

Tôi **không chắc** BullMQ 6 cần đúng những lệnh nào. Bộ luật dưới đây là điểm xuất phát; test ở Step 2 là thứ quyết định. Mỗi `NOPERM` test gặp là một quyền phải thêm: thêm đúng lệnh đó, ghi lý do vào `acl-rules.ts`, không mở cả nhóm.

- [ ] **Step 1: Bộ luật**

```ts
// apps/api/src/sandbox-worker/acl-rules.ts
/**
 * Quyền Redis của user ACL dành cho hàng đợi sandbox (spec §3.5 luật 2): CHỈ
 * khoá dưới prefix của sandbox. Một mật khẩu chung cả instance là đọc ghi được
 * mọi hàng đợi, kể cả hàng trả kết quả.
 *
 * Dùng cho CẢ HAI user — worker trên máy sandbox và API — vì cả hai chỉ cần
 * đụng đúng các khoá này. `acl.sandbox-spec.ts` là thứ chứng minh bộ luật đủ
 * cho BullMQ và không rộng hơn cần thiết.
 */
export function sandboxAclRules(prefix: string): string[] {
  return [
    'resetkeys',
    `~${prefix}:*`,
    'resetchannels',
    '-@all',
    '+@read',
    '+@write',
    '+@list',
    '+@hash',
    '+@sortedset',
    '+@stream',
    '+@string',
    '+@keyspace',
    '+@scripting',
    '+@blocking',
    '+@connection',
    '+@transaction',
    '-@dangerous',
    '-@admin',
  ];
}
```

- [ ] **Step 2: Test ACL**

```ts
// apps/api/test-sandbox/acl.sandbox-spec.ts
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import IORedis from 'ioredis';
import { createSandboxClient } from '../src/sandbox/sandbox.client';
import { sandboxAclRules } from '../src/sandbox-worker/acl-rules';
import { RunningWorker, startWorker } from '../src/sandbox-worker/main';
import { inline, RUNTIME } from './helpers';

const ADMIN_URL = process.env.SANDBOX_TEST_REDIS_URL ?? 'redis://localhost:6390';
const suffix = randomUUID().slice(0, 8);
const user = `cine-sbx-acl-${suffix}`;
const password = randomUUID();
const prefix = `cine-sbx-acl-${suffix}`;
const url = (() => {
  const u = new URL(ADMIN_URL);
  u.username = user;
  u.password = password;
  return u.toString();
})();

let admin: IORedis;
let worker: RunningWorker | undefined;
let client: ReturnType<typeof createSandboxClient> | undefined;

beforeAll(async () => {
  admin = new IORedis(ADMIN_URL);
  await admin.call('ACL', 'SETUSER', user, 'reset', 'on', `>${password}`, ...sandboxAclRules(prefix));
});

afterAll(async () => {
  await client?.close();
  await worker?.close();
  const keys = await admin.keys(`${prefix}:*`);
  if (keys.length) await admin.del(...keys);
  await admin.call('ACL', 'DELUSER', user);
  admin.disconnect();
});

describe('ACL Redis của sandbox — §3.5 luật 2', () => {
  it('worker và client chạy trọn một job với user ACL chỉ có quyền trên prefix sandbox', async () => {
    worker = await startWorker({
      sources: [{ name: 'real', redisUrl: url, prefix }],
      runtime: RUNTIME,
      images: { cpp: 'cine-sandbox-cpp:1', python: 'cine-sandbox-python:1' },
      timingCpusets: [null], generalCpuset: null, execConcurrency: 1,
      workRoot: join(tmpdir(), 'cine-sandbox-test'), allowedDownloadHosts: [], allowHttpDownloads: false,
      version: 'test', warnings: [],
    });
    client = createSandboxClient({ redisUrl: url, prefix, timeoutMs: { exec: 60_000, measure: 60_000 } });
    const r = await client.client.exec({
      language: 'cpp',
      program: { files: [{ path: 'main.cpp', ref: inline('#include <cstdio>\nint main(){std::puts("ok");}\n') }], driver: null, entry: null },
      cases: [{ name: 'a', group: null, stdin: inline(''), expected: inline('ok\n') }],
    });
    expect(r.unavailable).toBeNull();
    expect(r.cases[0].status).toBe('pass');
  });

  it('user đó KHÔNG đọc ghi được khoá ngoài prefix, không chạy được lệnh quản trị', async () => {
    const limited = new IORedis(url, { maxRetriesPerRequest: 1 });
    try {
      await expect(limited.get('bull:grading:1')).rejects.toThrow(/NOPERM/);
      await expect(limited.set('ngoai-prefix', '1')).rejects.toThrow(/NOPERM/);
      await expect(limited.call('KEYS', '*')).rejects.toThrow(/NOPERM/);
      await expect(limited.call('FLUSHALL')).rejects.toThrow(/NOPERM/);
      await expect(limited.call('CONFIG', 'GET', '*')).rejects.toThrow(/NOPERM/);
    } finally {
      limited.disconnect();
    }
  });
});
```

Run: `pnpm --filter api test:sandbox -- acl`
Expected: PASS. Gặp `NOPERM this user has no permissions to run the '<lệnh>' command` ở ca đầu: thêm đúng `+<lệnh>` (hoặc `+<lệnh>|<lệnh con>`) vào `sandboxAclRules`, kèm một dòng chú thích nói BullMQ dùng nó vào việc gì, rồi chạy lại. Ca thứ hai phải luôn xanh. Nếu phải thêm quyền làm ca thứ hai đỏ, dừng lại và báo.

- [ ] **Step 3: Tài liệu dựng máy sandbox**

`docs/deploy/sandbox-worker.md` phải có đủ các mục dưới đây, viết bằng lệnh cụ thể:

1. **Vì sao máy riêng.** Tiến trình nói chuyện với Docker socket có quyền tương đương root, và người viết mã độc chính là người được chấm (§3.5). Máy này không chạy gì khác.
2. **Yêu cầu:** Linux, Docker Engine (không Docker Desktop), Node 22, `nproc` ≥ 3; gVisor nếu báo cáo buổi thử chọn `runsc`, kèm link hướng dẫn cài chính thức và bước đăng ký runtime trong `daemon.json`.
3. **User hệ thống** `cine-sbx` trong nhóm `docker`. Ghi thẳng ra rằng nhóm `docker` tương đương root, và đó là lý do máy phải riêng.
4. **Dựng:** clone đúng tag hay commit, `pnpm install --frozen-lockfile`, `pnpm --filter api build`, `pnpm --filter api sandbox:images`.
5. **Redis:** một Redis managed có TLS (`rediss://`) và hỗ trợ ACL, hoặc một instance riêng cho sandbox. Hai user ACL (`cine-sbx-api`, `cine-sbx-worker`) dùng `sandboxAclRules(prefix)`, kèm lệnh `ACL SETUSER` hoàn chỉnh. Redis của eval là một instance **khác**, có user riêng.
6. **Env:** bảng của Task 8, kèm file `/etc/cine-sandbox.env` quyền `600`. Ghi rõ danh sách biến bị cấm và việc worker từ chối khởi động khi thấy chúng.
7. **Khe đo:** `SANDBOX_TIMING_CPUSETS` và `SANDBOX_GENERAL_CPUSET` theo báo cáo buổi thử. Khuyến nghị để lõi 0 cho hệ thống.
8. **systemd unit** chạy `node dist/src/sandbox-worker/main.js` bằng user `cine-sbx`, `EnvironmentFile=/etc/cine-sandbox.env`, `Restart=on-failure`, và `SANDBOX_WORKER_VERSION` đặt bằng git sha.
9. **Tường lửa:** không mở cổng vào nào. Worker chỉ đi ra tới Redis và tới host trong `SANDBOX_ALLOWED_DOWNLOAD_HOSTS`.
10. **Kiểm sau khi dựng:** `pnpm --filter api test:sandbox` với `SANDBOX_RUNTIME` đã chọn, rồi đọc dòng khởi động trong `journalctl -u cine-sandbox`.

- [ ] **Step 4: Commit mã**

```bash
git add apps/api/src/sandbox-worker/acl-rules.ts apps/api/test-sandbox/acl.sandbox-spec.ts
git commit -m "feat(sandbox): luật ACL Redis chỉ trên prefix sandbox, chứng minh bằng test với BullMQ thật"
```

(`docs/deploy/sandbox-worker.md` do chủ đồ án commit cùng báo cáo.)

---

### Task 13: Vòng job thật trên máy sandbox, và chốt báo cáo

**Files:**
- Modify: `apps/api/src/sandbox-spike/spike.ts` (thêm pha `roundtrip`)
- Modify: `docs/superpowers/reports/2026-09-24-sandbox-isolation-spike.md`, `docs/deploy/sandbox-worker.md`

- [ ] **Step 1: Pha `roundtrip`**

Trong `spike.ts`, ngay sau dòng `const out = arg('out') ?? …` (tức là TRƯỚC phép kiểm `--cpusets`, vì pha này không đo khe), thêm:

```ts
  if (arg('phase') === 'roundtrip') {
    mkdirSync(out, { recursive: true });
    const { createSandboxClient } = await import('../sandbox/sandbox.client');
    const redisUrl = arg('redis');
    if (!redisUrl) throw new Error('--redis bắt buộc cho pha roundtrip');
    const { client, close } = createSandboxClient({ redisUrl, prefix: arg('prefix') });
    const wall: number[] = [];
    const caseMs: number[] = [];
    for (let i = 0; i < Number(arg('jobs') ?? 50); i++) {
      const started = Date.now();
      const r = await client.exec({
        language: 'cpp',
        program: { files: [{ path: 'main.cpp', ref: { kind: 'inline', content: '#include <cstdio>\nint main(){std::puts("ok");}\n' } }], driver: null, entry: null },
        cases: [{ name: 'a', group: null, stdin: { kind: 'inline', content: '' }, expected: { kind: 'inline', content: 'ok\n' } }],
      });
      if (r.unavailable) throw new Error(`vòng ${i}: ${r.unavailable}`);
      wall.push(Date.now() - started);
      caseMs.push(r.cases[0].ms);
    }
    await close();
    const p = (xs: number[], q: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(q * xs.length))];
    const line = `vòng job (Redis → biên dịch → 1 ca → Redis): p50 ${p(wall, 0.5)} ms · p95 ${p(wall, 0.95)} ms; riêng một ca: p50 ${p(caseMs, 0.5)} ms · p95 ${p(caseMs, 0.95)} ms`;
    writeFileSync(join(out, 'roundtrip.txt'), `${line}\n`);
    console.log(line);
    return;
  }
```

Build rồi chạy trên máy sandbox. Worker phải đang chạy (systemd hoặc `node dist/src/sandbox-worker/main.js`) và dùng cùng Redis:

```bash
pnpm --filter api sandbox:spike -- --phase=roundtrip --redis="$SANDBOX_REDIS_URL" --jobs=50 --out=spike-out
```

- [ ] **Step 2: Chốt báo cáo**

Điền mục *"Vòng job qua Redis"* bằng `spike-out/roundtrip.txt`. Vòng job gồm cả biên dịch, nên con số lớn hơn *"p95 một ca"*. Ghi cả hai, và ghi con số nhân với 25 lời gọi mỗi bài so với trần 300 giây của §7.

- [ ] **Step 3: Đặt mặc định theo quyết định**

Trong `docs/deploy/sandbox-worker.md`, đặt giá trị khuyến nghị của `SANDBOX_RUNTIME`, `SANDBOX_TIMING_CPUSETS`, `SANDBOX_GENERAL_CPUSET` theo D2, D3 của báo cáo. **Không** đổi mặc định trong `config.ts`: mặc định `runc` và không ghim lõi là mặc định an toàn cho máy dev, còn máy sandbox luôn đặt tường minh.

- [ ] **Step 4: Ghi hệ quả vào spec nếu có**

Nếu D4 ra *"không dùng được"*, hoặc K khiến phần đo của một phiên 40 bài vượt 30 phút, thì soạn đoạn sửa rủi ro 1 (§11) kèm số đo, để chủ đồ án duyệt và commit. **Không** tự sửa mục tiêu §15.2 cho khớp số đo.

- [ ] **Step 5: Commit mã**

```bash
git add apps/api/src/sandbox-spike/spike.ts
git commit -m "feat(sandbox): pha roundtrip của buổi thử — đo vòng job thật qua Redis"
```

---

## Self-Review (đã chạy khi viết plan)

- **Độ phủ test của bước 1 (§15.1):**

  | Test | Task |
  |---|---|
  | `T-DOWN-1` | 5 (phía worker), 10 (phía API) |
  | `T-ISO-1`, `T-ISO-2`, `T-ISO-3`, `T-ISO-6` | 7 (tích hợp), 5 (`T-ISO-6` unit) |
  | `T-ISO-4` | 10 |
  | `T-ISO-5` | 1 (schema), 5, 8 (dấu vân tay) |
  | `T-ISO-7` | 8 (unit), 11 (tích hợp) |
  | `T-ISO-8` phần sandbox | 6 (unit), 7 (tích hợp) |
  | `T-LANG-1…3` | 7 |
  | Báo cáo buổi thử | 9, 13 |

- **Độ phủ §3.5:**
  - worker riêng, chỉ kéo việc ra → Task 8 (không mở cổng; tài liệu Task 12);
  - không cầm khoá → Task 8 (từ chối env) + test quét import;
  - presigned URL → Task 4 (allowlist + sha256);
  - Redis ACL theo prefix → Task 12;
  - kiểm `jobId` và schema → Task 10;
  - cô lập đọc → Task 5, 7;
  - mỗi ca một container → Task 5;
  - container đo giữ suốt job, `interference` → Task 6, 7;
  - đồng hồ giả được, số đo ngoài → Task 6, 7;
  - một máy, eval khác Redis → Task 8 (nguồn `eval`, cấm trùng);
  - khe đo và semaphore → Task 8, 11;
  - bẫy C++ và Python → Task 2, 5, 7.
- **Kiểu nhất quán:** `WorkerDeps` (Task 5) được `handleMeasure` (Task 6), `startWorker` (Task 8), buổi thử (Task 9) và `test-sandbox/helpers.ts` (Task 7) dùng nguyên. `handleExec(raw, deps, cpuset)` và `handleMeasure(raw, deps, slot)` có cùng chữ ký ở mọi chỗ gọi. Kết quả `unavailable*` có `host` nullable, và schema chỉ đòi `host` khi `unavailable` null.
- **Chỗ tôi không chắc, và cách plan xử lý:**
  - Tập lệnh Redis mà BullMQ 6 cần → do test ở Task 12 quyết định.
  - `docker top` trên `runsc` → buổi thử đo điều này (D2b).
  - `State.OOMKilled` khi có `--init`, và mã thoát của `timeout` → **đã đo** trên Docker Desktop (runc): xem Global Constraints. Trên `runsc` thì `test:sandbox` đo lại ở Task 9.
  - Lệnh cài gVisor → chỉ link tới hướng dẫn chính thức, không chép.

## Việc kèm theo, ngoài code

- Spec 2026-09-20 đã cập nhật (lần 9) cho plan này: §3.5 luật 5, container đo, đồng hồ giả được, một tiến trình; `T-ISO-8`; dòng bước 1 của §15.1.
- Sau khi merge nhánh plan-1 ở bước 3: bỏ `grading/sandbox/sandbox.types.ts` của nhánh, vì hợp đồng đã sống ở `src/sandbox/contract.ts`.
- Docs (báo cáo buổi thử, `docs/deploy/sandbox-worker.md`) do chủ đồ án commit.

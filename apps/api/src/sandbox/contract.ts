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
]).refine((r) => r.kind !== 'generate' || r.lo <= r.hi, {
  // lo > hi từng sinh NaN vào input: bài bị gán runtime_crash vì lỗi của gói chấm (review M3).
  message: 'generate: lo phải ≤ hi',
});
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
    /** Ngân sách của cả job (§3.1 chốt 4): hết thì worker dừng và trả phần đã chạy, `aborted: 'budget'`. */
    budgetMs: z.number().int().min(1_000).max(3_600_000).default(120_000),
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
    /** Ngân sách con của phép đo (§3.1 chốt 4): hết thì trả các mẫu đã đo, `aborted: 'budget'`. */
    budgetMs: z.number().int().min(1_000).max(3_600_000).default(240_000),
  })
  .refine((j) => pythonNeedsEntry(j.language, j.submission), PY_ENTRY)
  .refine((j) => j.reference === null || pythonNeedsEntry(j.language, j.reference), PY_ENTRY)
  .refine((j) => j.points.every((p) => p.stdin.kind !== 'generate' || p.stdin.n === p.n), {
    message: 'điểm n phải khớp n của bộ sinh',
  });
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
    /**
     * `budget`: hết `budgetMs` — `cases` chỉ gồm các ca đã chạy. `.default(null)`
     * để một kết quả dựng tay (test, worker cũ) thiếu trường này vẫn hợp lệ —
     * vắng mặt và "không bị hủy" là cùng một ý.
     */
    aborted: z.enum(['budget']).nullable().default(null),
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
    aborted: z.enum(['interference', 'compile_error', 'budget']).nullable(),
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
    aborted: null,
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

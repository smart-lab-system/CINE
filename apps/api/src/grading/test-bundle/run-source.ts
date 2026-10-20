import { ExecResult, SandboxLanguage } from '../../sandbox/contract';
import { ExecRequest } from '../../sandbox/sandbox.client';

/** Ngân sách của MỘT job chạy thử (spec §4.3, D-D). Hết thì worker dừng và trả phần đã chạy, `aborted: 'budget'`. */
export const TEST_RUN_BUDGET_MS = 60_000;
/** `execJob.cases.max(200)` trong `sandbox/contract.ts`. */
export const MAX_CASES_PER_JOB = 200;
/** `diff` của ca lệch được cắt còn từng này ký tự trước khi ghi và trả về. */
export const DIFF_MAX_CHARS = 200;
/** Log biên dịch trả cho giảng viên: đủ đọc lỗi đầu tiên, không đủ để trả cả bài làm dội lại. */
export const COMPILE_LOG_MAX_CHARS = 1_024;

export interface RunnableCase {
  name: string;
  group: string | null;
  input: string;
  /** null = công cụ `run`: chạy và lấy stdout, không so gì (dùng khi SINH output mong đợi, G2b Task 3). */
  expected: string | null;
}

const inline = (content: string) => ({ kind: 'inline' as const, content });

/**
 * Job `exec` chạy MỘT mã nguồn đáp án qua các ca. Một chỗ định nghĩa hình dạng job cho cả chạy thử (Task 1) và sinh
 * gói (Task 3): hai nơi dựng job riêng là hai nơi lệch nhau về tên file, entry hay ngân sách.
 *
 * - cpp: một file `main.cpp`, không driver (đáp án đọc stdin, in stdout); không entry.
 * - python: `main.py` và `entry: 'main.py'` — python không driver thì hợp đồng đòi khai entry.
 */
export function buildExecRequest(
  language: SandboxLanguage,
  source: string,
  cases: RunnableCase[],
  budgetMs: number = TEST_RUN_BUDGET_MS,
): ExecRequest {
  const file = language === 'python' ? 'main.py' : 'main.cpp';
  return {
    language,
    program: { files: [{ path: file, ref: inline(source) }], driver: null, entry: language === 'python' ? file : null },
    cases: cases.map((c) => ({
      name: c.name,
      group: c.group,
      stdin: inline(c.input),
      expected: c.expected === null ? null : inline(c.expected),
    })),
    budgetMs,
  };
}

export type RunStatus = 'pass' | 'fail' | 'compile_error' | 'unavailable' | 'aborted';

export interface RunCase {
  name: string;
  status: string;
  ms: number;
  diff: string | null;
}

export interface RunSummary {
  status: RunStatus;
  cases: RunCase[];
  /** Có khi `compile_error`. Chỉ để hiện cho giảng viên, không lưu. */
  compileLog: string | null;
}

/**
 * Kết quả worker → kết cục của lượt chạy. Thứ tự đọc quan trọng:
 * - `unavailable` trước hết: không có kết quả thật thì không có gì để kết luận;
 * - biên dịch hỏng: không ca nào chạy, nên đừng báo "fail" cho từng ca;
 * - `aborted` hay thiếu ca so với yêu cầu: lượt không đầy đủ, KHÔNG được báo `pass` chỉ vì các ca đã chạy đều đạt.
 * `stdout` bị bỏ có chủ ý: nó có thể là output của mã đáp án và không có chỗ nào cần lưu nó.
 */
export function summarizeExec(result: ExecResult, requested: string[]): RunSummary {
  if (result.unavailable !== null) return { status: 'unavailable', cases: [], compileLog: null };
  if (result.compile && !result.compile.ok) {
    return { status: 'compile_error', cases: [], compileLog: result.compile.log.slice(0, COMPILE_LOG_MAX_CHARS) };
  }
  const cases: RunCase[] = result.cases.map((c) => ({
    name: c.name,
    status: c.status,
    ms: c.ms,
    diff: c.diff === null ? null : c.diff.slice(0, DIFF_MAX_CHARS),
  }));
  const got = new Set(cases.map((c) => c.name));
  if (result.aborted !== null || requested.some((name) => !got.has(name))) {
    return { status: 'aborted', cases, compileLog: null };
  }
  return { status: cases.every((c) => c.status === 'pass') ? 'pass' : 'fail', cases, compileLog: null };
}

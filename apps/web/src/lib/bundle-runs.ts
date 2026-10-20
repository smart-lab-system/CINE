import type { RunCaseResult, RunStatus, TestRunResult } from '@/lib/api/test-bundle';

/**
 * Kết quả chạy thử còn nhớ trên màn hình, theo phiên bản gói (G2b-R). Chỉ ở bộ nhớ trình duyệt: server ghi lại từng lượt ở
 * `grading_test_run`, nhưng chưa có route đọc lại, và kết quả chạy thử là thứ giảng viên xem ngay rồi quyết, không phải hồ sơ.
 *
 * Thuần (không React, không mạng) để mỗi luật gộp có test trực tiếp.
 */
export interface BundleRunState {
  /** Trạng thái của lượt chạy CẢ GÓI gần nhất; null khi mới chỉ chạy từng ca lẻ. */
  status: RunStatus | null;
  cases: Record<string, RunCaseResult>;
  compileLog: string | null;
}

export type RunsState = Record<string, BundleRunState>;

const byName = (cases: RunCaseResult[]): Record<string, RunCaseResult> => Object.fromEntries(cases.map((c) => [c.name, c]));

/**
 * Gộp một lượt chạy vào state.
 * - Biên dịch hỏng: mã đã đổi hay hỏng, kết quả từng ca cũ không còn đáng tin nên xoá.
 * - Cả gói: thay hẳn kết quả cũ.
 * - Một ca: chỉ cập nhật ca đó; trạng thái cả lượt giữ nguyên (nó không nói gì về các ca khác).
 */
export function applyRun(state: RunsState, bundleId: string, caseKey: string | null, result: TestRunResult): RunsState {
  if (result.status === 'compile_error') {
    return { ...state, [bundleId]: { status: 'compile_error', cases: {}, compileLog: result.compileLog ?? '' } };
  }
  const prev = state[bundleId];
  if (caseKey === null) {
    return { ...state, [bundleId]: { status: result.status, cases: byName(result.cases), compileLog: null } };
  }
  return {
    ...state,
    [bundleId]: {
      status: prev?.status ?? null,
      cases: { ...(prev?.cases ?? {}), ...byName(result.cases) },
      compileLog: null,
    },
  };
}

export function summarizeRun(entry: BundleRunState): { matched: number; mismatched: number; total: number } {
  const all = Object.values(entry.cases);
  const matched = all.filter((c) => c.status === 'pass').length;
  return { matched, mismatched: all.length - matched, total: all.length };
}

/** Nhãn một ca sau khi chạy: `pass` khớp, `fail` lệch, trạng thái khác (timeout, crash...) nêu nguyên văn. */
export function caseVerdict(status: string): { label: string; tone: 'ok' | 'bad' } {
  if (status === 'pass') return { label: 'Khớp', tone: 'ok' };
  if (status === 'fail') return { label: 'Lệch', tone: 'bad' };
  return { label: `Lỗi chạy: ${status}`, tone: 'bad' };
}

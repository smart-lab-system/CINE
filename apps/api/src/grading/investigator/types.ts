import { CaseStatus, CompileInfo, HostFingerprint, SandboxLanguage } from '../../sandbox/contract';

/**
 * Kiểu dữ liệu của vòng điều tra (spec 2026-09-20 §5). Bước 2 cài bốn công cụ đầu; các
 * tên còn lại của §5 thêm ở bước 4 (`run_scaled`) và bước 5 (`ast_query`, `probe`,
 * `compare_peers`). Thêm một tên là một quyết định thiết kế, không phải một dòng thêm vào
 * mảng (§3, "bảy phải là bảy thật").
 */
export const TOOL_NAMES = ['run', 'run_tests', 'read_file', 'list_files'] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

export type ToolCallStatus = 'ok' | 'error' | 'blocked_duplicate' | 'unavailable';

/** Một lời gọi công cụ. `id` do harness sinh (`tc-N`), không bao giờ do model (§5). */
export interface ToolCall {
  id: string;
  tool: ToolName;
  /** Đã chuẩn hoá — cũng là khoá chống trùng (§7.1). */
  args: Record<string, unknown>;
  status: ToolCallStatus;
  /** Văn bản thô, trần 8 KB, cắt lúc ghi (§5.3). */
  output: string;
  /** Khoá vào `Investigation.structuredResults`; null khi lời gọi không có phần có cấu trúc. */
  structuredRef: string | null;
  startedAt: string;
  wallMs: number;
  /** Nội dung do bài sinh ra mang hình dạng đánh dấu (§3.3 luật 2). Báo, không tự hạ điểm. */
  injectionSuspected: boolean;
}

export interface TestCaseResult {
  name: string;
  group: string | null;
  status: CaseStatus;
  diff: string | null;
  ms: number;
}

/** Phần CÓ CẤU TRÚC của một lời gọi — lưu đủ, không cắt (§5.3, T-STRUCT-1). */
export type StructuredResult =
  | {
      kind: 'run_tests';
      compile: CompileInfo | null;
      cases: TestCaseResult[];
      /** Worker dừng vì hết ngân sách của job — `cases` chỉ gồm phần đã chạy. */
      aborted: boolean;
      host: HostFingerprint | null;
    }
  | {
      kind: 'run';
      compile: CompileInfo | null;
      status: CaseStatus | null;
      /** Băm của stdout đầy đủ — để chạy lại đối chiếu mà không lưu stdout thô ngoài trần 8 KB. */
      stdoutSha256: string | null;
      host: HostFingerprint | null;
    };

export interface VerdictError {
  ruleKey: string;
  toolCallIds: string[];
  note: string | null;
}

/** Thứ model trả về (§5). Harness lọc (T-AG-2) trước khi bất cứ ai đọc. */
export interface Verdict {
  errors: VerdictError[];
  missingRules: { description: string; toolCallIds: string[] }[];
  injectionAttempt: { detected: boolean; excerpt: string | null };
}

/** Trần của §7. */
export interface InvestigationBudget {
  maxToolCalls: number;
  maxWallMs: number;
  maxTokens: number;
  maxRounds: number;
}

export type StopReason =
  | 'verdict'
  | 'max_tool_calls'
  | 'max_wall'
  | 'max_tokens'
  | 'max_rounds'
  | 'stalled'
  | 'blocked_repeatedly'
  | 'models_exhausted';

export interface RuleEntry {
  ruleKey: string;
  title: string;
  criterionKey: string;
  priced: boolean;
  hasPredicate: boolean;
}

export interface BundleCase {
  name: string;
  group: string;
  input: string;
  expected: string;
}

/**
 * Đầu vào THUẦN của `investigate()` — không có gì đọc từ DB bên trong hàm (§12.5).
 * Mở rộng hình dạng ở §5 bằng những thứ công cụ cần để chạy thật: file bài nộp, driver của
 * đề, và các ca của gói test đã đóng băng (thay cho `testBundleId` trần).
 */
export interface InvestigationContext {
  language: SandboxLanguage;
  problemStatement: string;
  requiredComplexity: string | null;
  submission: { files: { path: string; content: string }[] };
  /** C++: file có `main` gọi hàm của bài. null = bài là chương trình trọn vẹn. */
  driver: string | null;
  /** Python không driver: file chạy. */
  entry: string | null;
  testBundle: { id: string; cases: BundleCase[] };
  modelAnswerAvailable: boolean;
  rules: RuleEntry[];
  budget: InvestigationBudget;
}

export interface Investigation {
  toolCalls: ToolCall[];
  structuredResults: Record<string, StructuredResult>;
  /** Bước 4. */
  complexity: null;
  /** Bước 5. */
  minimalFailingCase: null;
  approach: null;
  peerCluster: null;
  /** §7: đã dùng bao nhiêu, và VÌ SAO dừng. */
  budget: {
    toolCalls: number;
    wallMs: number;
    tokens: number;
    rounds: number;
    forcedFinal: boolean;
    stopReason: StopReason;
    limits: InvestigationBudget;
  };
  modelsUsed: string[];
  tierRotations: { round: number; from: string; reason: string }[];
}

export type RejectReason = 'unknown_rule' | 'fabricated_tool_call' | 'no_valid_tool_call';
export type InvestigationFlag = 'replay_mismatch' | 'budget_exhausted' | 'injection_suspected';

export interface InvestigationResult {
  kind: 'verdict' | 'ungradable';
  /** Đã lọc (T-AG-2). null khi `kind = 'ungradable'`. */
  verdict: Verdict | null;
  rejected: { ruleKey: string; reason: RejectReason }[];
  ungradable: { class: 'system' | 'submission'; reason: string } | null;
  flags: InvestigationFlag[];
  /** Trần confidence mà cuộc điều tra này biện minh được; bước 3 lấy min với công thức §4.2. */
  confidenceCap: number;
  replay: { toolCallId: string; matched: boolean } | null;
  /** Do HARNESS render từ toolCalls thật (§5.1). */
  summary: string;
  investigation: Investigation;
  usage: { inputTokens: number; outputTokens: number };
}

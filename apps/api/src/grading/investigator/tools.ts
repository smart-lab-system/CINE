import { createHash } from 'node:crypto';
import { ExecResult, programSpec } from '../../sandbox/contract';
import { ExecRequest } from '../../sandbox/sandbox.client';
import { wrapSubmission } from '../harness/submission-envelope';
import { TOOL_OUTPUT_MAX_BYTES, truncateOutput } from './truncate';
import { InvestigationContext, StructuredResult, ToolCall, ToolCallStatus, ToolName } from './types';
import { Workspace } from './workspace';

/** Cổng tới sandbox. Bản thật là `SandboxClient` của bước 1; test dùng bản giả. */
export interface SandboxPort {
  exec(request: ExecRequest): Promise<ExecResult>;
}

export interface ToolInvocation {
  tool: ToolName;
  args: Record<string, unknown>;
}

export interface ToolOutcome {
  toolCall: ToolCall;
  structured: StructuredResult | null;
}

interface Dispatched {
  status: ToolCallStatus;
  text: string;
  suspected: boolean;
  structured: StructuredResult | null;
}

const MAX_RUN_INPUT_BYTES = 1024 * 1024;
/** `execJob.cases.max(200)` trong `sandbox/contract.ts`. */
const MAX_CASES_PER_JOB = 200;
/** Ngân sách mặc định của job exec trong hợp đồng — không xin nhiều hơn chỉ vì còn giờ. */
const MAX_EXEC_BUDGET_MS = 120_000;
/** Còn ít hơn thế thì một job sandbox chỉ có thể bị cắt giữa chừng. */
const MIN_SANDBOX_MS = 3_000;
const LATE = 'không đủ thời gian còn lại của cuộc điều tra để chạy sandbox (§7)';
const inline = (content: string) => ({ kind: 'inline' as const, content });

/** Mỗi lần gọi một mã MỚI — mỗi nguồn một mã riêng (§3.3 luật 1). */
function wrapStudent(text: string): { text: string; suspected: boolean } {
  const envelope = wrapSubmission(text);
  return { text: envelope.wrapped, suspected: envelope.injectionSuspected };
}

const fail = (text: string): Dispatched => ({ status: 'error', text, suspected: false, structured: null });
const unavailable = (reason: string): Dispatched => ({
  status: 'unavailable',
  text: `sandbox không phản hồi: ${reason}`,
  suspected: false,
  structured: null,
});

/** Phần của 8 KB dành cho các dòng; phần còn lại cho tiêu đề (đường dẫn hai lần) và vỏ bọc. */
export const READ_CHUNK_BYTES = TOOL_OUTPUT_MAX_BYTES - 1_024;

/**
 * Q9: đọc theo khoảng dòng, cắt theo TRỌN DÒNG cho vừa 8 KB. Cắt đầu-cuối (`truncateOutput`)
 * là mất phần giữa file — thường chính là thuật toán — nên file dài được chia đoạn, và kết
 * quả báo dòng để đọc tiếp. Một dòng dài hơn cả trần vẫn được trả, rồi bị cắt lúc ghi.
 */
export function sliceLines(
  content: string,
  fromLine: unknown,
  toLine: unknown,
): { from: number; to: number; total: number; text: string } | { error: string } {
  const lines = content.split('\n');
  // File kết thúc bằng '\n' thì phần tử cuối rỗng — đó không phải một dòng.
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  const total = lines.length;
  const valid = (v: unknown) => v === null || v === undefined || (Number.isInteger(v) && (v as number) >= 1);
  if (!valid(fromLine) || !valid(toLine)) return { error: 'fromLine và toLine phải là số nguyên ≥ 1, hoặc null' };
  const from = (fromLine as number | null | undefined) ?? 1;
  const until = (toLine as number | null | undefined) ?? total;
  if (from > total) return { error: `file có ${total} dòng — fromLine=${from} vượt quá` };
  if (until < from) return { error: `toLine=${until} nhỏ hơn fromLine=${from}` };
  const picked: string[] = [];
  let bytes = 0;
  let to = from - 1;
  for (let i = from; i <= Math.min(until, total); i++) {
    const size = Buffer.byteLength(lines[i - 1], 'utf8') + 1;
    if (picked.length > 0 && bytes + size > READ_CHUNK_BYTES) break;
    picked.push(lines[i - 1]);
    bytes += size;
    to = i;
  }
  return { from, to, total, text: picked.join('\n') };
}

export function programOf(ctx: InvestigationContext): ExecRequest['program'] {
  return {
    files: ctx.submission.files.map((f) => ({ path: f.path, ref: inline(f.content) })),
    driver: ctx.driver === null ? null : inline(ctx.driver),
    entry: ctx.entry,
  };
}

/** Chuỗi do sinh viên đặt, đưa vào một dòng lý do: một dòng, có trần, không mang ký tự xuống dòng. */
function quoted(raw: string): string {
  return JSON.stringify(raw.slice(0, 80)).replace(/[\u2028\u2029]/g, '?');
}

/**
 * Review M4: bài mà hợp đồng sandbox từ chối (tên file có dấu cách hay dấu tiếng Việt, không có
 * file nào, file quá lớn) thì MỌI job đều nổ lúc dựng — và lỗi đó sẽ bị ghi nhầm thành "sandbox
 * không phản hồi", tiêu model tới khi treo. Kiểm một lần, trước lời gọi model đầu tiên. Tên file
 * lạ cũng vì thế không bao giờ tới model (nó nằm NGOÀI vỏ bọc). null = gửi được.
 *
 * Lớp: không có file nào là lỗi của BÀI (T-EMPTY-1: `submission`); còn lại là giới hạn của
 * harness, bài không sai gì — `system`, về giảng viên.
 */
export function programProblem(ctx: InvestigationContext): { class: 'system' | 'submission'; reason: string } | null {
  if (ctx.submission.files.length === 0) return { class: 'submission', reason: 'bài nộp không có file nào' };
  const parsed = programSpec.safeParse(programOf(ctx));
  if (parsed.success) return null;
  const issue = parsed.error.issues[0];
  const [where, index, field] = issue.path;
  const file = where === 'files' && typeof index === 'number' ? ctx.submission.files[index] : undefined;
  const system = (reason: string) => ({ class: 'system' as const, reason: `bài nộp không gửi được sang sandbox: ${reason}` });
  if (file && field === 'path') {
    return system(`tên file ${quoted(file.path)} không hợp lệ — chỉ nhận chữ Latin không dấu, số, "_", ".", "-" và "/"`);
  }
  if (file) return system(`file ${quoted(file.path)}: ${issue.message}`);
  return system(`${issue.path.join('.') || 'chương trình'}: ${issue.message}`);
}

/**
 * Bốn công cụ của bước 2. `read_file`/`list_files` do harness phục vụ trên workspace ảo (Q1);
 * `run`/`run_tests` là job thật trên sandbox. Mọi nội dung do bài sinh ra đi qua
 * `wrapSubmission()` (§3.3 luật 1–2). Không ném: lỗi thành một lời gọi `error` hay
 * `unavailable` mà model đọc được.
 */
export class ToolRunner {
  constructor(
    private readonly ctx: InvestigationContext,
    private readonly workspace: Workspace,
    private readonly sandbox: SandboxPort,
    private readonly now: () => number = Date.now,
    /** Hạn chót của cả cuộc điều tra (cùng đồng hồ với `now`); null = không giới hạn. */
    private readonly deadline: number | null = null,
  ) {}

  /**
   * Review I1: job sandbox không được chạy quá phần thời gian còn lại của cuộc điều tra. Worker
   * dừng ở `budgetMs` và trả phần đã chạy (§3.1 chốt 4). Còn quá ít thì không gửi job.
   * `'late'` = không đủ giờ; `undefined` = không có hạn chót, dùng mặc định của hợp đồng.
   */
  private sandboxBudget(): number | 'late' | undefined {
    if (this.deadline === null) return undefined;
    const left = this.deadline - this.now();
    if (left < MIN_SANDBOX_MS) return 'late';
    return Math.min(MAX_EXEC_BUDGET_MS, Math.max(1_000, Math.floor(left)));
  }

  async execute(id: string, call: ToolInvocation): Promise<ToolOutcome> {
    const startedMs = this.now();
    let result: Dispatched;
    try {
      result = await this.dispatch(call);
    } catch (error) {
      // Lỗi của CHÍNH harness hay của kết nối tới sandbox: ghi lại, không ném.
      result = unavailable(error instanceof Error ? error.message.slice(0, 300) : String(error));
    }
    return {
      toolCall: {
        id,
        tool: call.tool,
        args: call.args,
        status: result.status,
        output: truncateOutput(result.text),
        structuredRef: result.structured ? id : null,
        startedAt: new Date(startedMs).toISOString(),
        wallMs: this.now() - startedMs,
        injectionSuspected: result.suspected,
      },
      structured: result.structured,
    };
  }

  private async dispatch(call: ToolInvocation): Promise<Dispatched> {
    switch (call.tool) {
      case 'list_files':
        return this.listFiles();
      case 'read_file':
        return this.readFile(call.args.path, call.args.fromLine, call.args.toLine);
      case 'run':
        return this.run(call.args.input);
      case 'run_tests':
        return this.runTests(call.args.group);
    }
  }

  private listFiles(): Dispatched {
    const lines = this.workspace.list().map((f) => `- ${f.path} (${f.bytes} byte)`);
    return { status: 'ok', text: lines.join('\n'), suspected: false, structured: null };
  }

  private readFile(path: unknown, fromLine: unknown, toLine: unknown): Dispatched {
    if (typeof path !== 'string') return fail('read_file cần path là chuỗi, ví dụ "bai-nop/main.cpp"');
    const file = this.workspace.read(path);
    if (!file) return fail(`không có file ${JSON.stringify(path)} trong workspace — xem list_files()`);
    const range = sliceLines(file.content, fromLine, toLine);
    if ('error' in range) return fail(range.error);
    const header =
      `${file.path} — dòng ${range.from}–${range.to} trên tổng ${range.total} dòng` +
      (range.to < range.total ? ` · còn tiếp: read_file("${file.path}", fromLine=${range.to + 1})` : '');
    if (file.source === 'system') {
      return { status: 'ok', text: `${header}\n${range.text}`, suspected: false, structured: null };
    }
    const wrapped = wrapStudent(range.text);
    return { status: 'ok', text: `${header}\n${wrapped.text}`, suspected: wrapped.suspected, structured: null };
  }

  private async run(input: unknown): Promise<Dispatched> {
    if (typeof input !== 'string') return fail('run cần input là chuỗi (stdin của chương trình)');
    if (Buffer.byteLength(input, 'utf8') > MAX_RUN_INPUT_BYTES) return fail('input của run vượt 1 MB');
    const budgetMs = this.sandboxBudget();
    if (budgetMs === 'late') return fail(LATE);
    const r = await this.sandbox.exec({
      language: this.ctx.language,
      program: programOf(this.ctx),
      cases: [{ name: 'run', group: null, stdin: inline(input), expected: null }],
      ...(budgetMs === undefined ? {} : { budgetMs }),
    });
    if (r.unavailable !== null) return unavailable(r.unavailable);
    if (r.compile && !r.compile.ok) {
      const log = wrapStudent(r.compile.log);
      return {
        status: 'ok',
        text: `Biên dịch lỗi:\n${log.text}`,
        suspected: log.suspected,
        structured: { kind: 'run', compile: r.compile, status: null, stdoutSha256: null, host: r.host },
      };
    }
    const c = r.cases[0];
    const stdout = c?.stdout ?? '';
    const out = wrapStudent(stdout);
    return {
      status: 'ok',
      text: `Kết cục: ${c?.status ?? 'không có'} (${c?.ms ?? 0} ms)\nstdout:\n${out.text}`,
      suspected: out.suspected,
      structured: {
        kind: 'run',
        compile: r.compile,
        status: c?.status ?? null,
        stdoutSha256: createHash('sha256').update(stdout).digest('hex'),
        host: r.host,
      },
    };
  }

  private async runTests(group: unknown): Promise<Dispatched> {
    if (group !== null && typeof group !== 'string') return fail('run_tests cần group là tên nhóm hoặc null');
    const all = this.ctx.testBundle.cases;
    const cases = all.filter((c) => group === null || c.group === group);
    if (cases.length === 0) {
      const groups = [...new Set(all.map((c) => c.group))].join(', ');
      return fail(`không có nhóm ${JSON.stringify(group)} — các nhóm có: ${groups}`);
    }
    // Hợp đồng sandbox nhận tối đa 200 ca một job; vượt thì SandboxClient ném lúc dựng job,
    // và lỗi của gói test sẽ bị ghi nhầm thành "sandbox không phản hồi".
    if (cases.length > MAX_CASES_PER_JOB) {
      return fail(`${cases.length} ca vượt trần ${MAX_CASES_PER_JOB} ca một lần chạy — chạy theo từng nhóm`);
    }
    const budgetMs = this.sandboxBudget();
    if (budgetMs === 'late') return fail(LATE);
    const r = await this.sandbox.exec({
      language: this.ctx.language,
      program: programOf(this.ctx),
      cases: cases.map((c) => ({ name: c.name, group: c.group, stdin: inline(c.input), expected: inline(c.expected) })),
      ...(budgetMs === undefined ? {} : { budgetMs }),
    });
    if (r.unavailable !== null) return unavailable(r.unavailable);

    const structured: StructuredResult = {
      kind: 'run_tests',
      compile: r.compile,
      cases: r.cases.map((c) => ({ name: c.name, group: c.group, status: c.status, diff: c.diff, ms: c.ms })),
      aborted: r.aborted === 'budget',
      host: r.host,
    };
    if (r.compile && !r.compile.ok) {
      const log = wrapStudent(r.compile.log);
      return {
        status: 'ok',
        text: `Biên dịch lỗi — mọi ca coi như không chạy được:\n${log.text}`,
        suspected: log.suspected,
        structured,
      };
    }
    const byGroup = new Map<string, { pass: number; total: number }>();
    for (const c of structured.cases) {
      const key = c.group ?? '(không nhóm)';
      const e = byGroup.get(key) ?? { pass: 0, total: 0 };
      e.total++;
      if (c.status === 'pass') e.pass++;
      byGroup.set(key, e);
    }
    const lines = [...byGroup].map(([g, e]) => `- ${g}: ${e.pass}/${e.total} đạt`);
    if (structured.aborted) {
      lines.push(`Dừng giữa chừng vì hết ngân sách của job — chỉ có ${structured.cases.length}/${cases.length} ca.`);
    }
    const failures = structured.cases
      .filter((c) => c.status !== 'pass')
      .map((c) => `${c.name} (${c.group ?? '-'}): ${c.status}${c.diff ? ` — ${c.diff}` : ''}`);
    if (failures.length === 0) return { status: 'ok', text: lines.join('\n'), suspected: false, structured };
    // Đoạn lệch mang output của BÀI → một nguồn, một mã.
    const wrapped = wrapStudent(failures.join('\n'));
    return {
      status: 'ok',
      text: `${lines.join('\n')}\nCa không đạt:\n${wrapped.text}`,
      suspected: wrapped.suspected,
      structured,
    };
  }
}

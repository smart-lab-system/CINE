import { ExecResult, INLINE_MAX_CHARS } from '../../sandbox/contract';

/**
 * Lõi THUẦN của sinh thước (G2b-R Task 3): lọc đề xuất của LLM, đọc kết quả hai lượt chạy đáp án, kiểm ví dụ trong đề.
 * Không I/O, không DB, không model — để mỗi luật của spec §4.4 có một test đơn vị trực tiếp.
 *
 * Nguyên tắc xuyên suốt (spec §3 luật 1, 3): output mong đợi CHỈ đến từ lượt chạy đáp án, không bao giờ từ văn bản của
 * LLM; ca nào không chứng minh được nó nằm trong đề, hay không chạy ổn định, bị BỎ trước khi giảng viên thấy.
 */

/** Một ca LLM đề xuất: KHÔNG có output mong đợi — output lấy từ chạy đáp án. */
export interface CaseProposal {
  name: string;
  group: string;
  input: string;
  /** Câu trong đề biện minh cho ca này (khuôn dạng, ràng buộc, ví dụ). */
  quote: string;
  /** LLM tự khai output của input này có duy nhất không (false: nhiều đáp án đúng, ví dụ in thứ tự bất kỳ). */
  answerIsUnique: boolean;
}

export interface ExampleProposal {
  input: string;
  output: string;
  quote: string;
}

export interface RulerProposal {
  /** null khi sinh từ đáp án của giảng viên (LLM chỉ đề xuất input). */
  modelAnswer: string | null;
  examples: ExampleProposal[];
  cases: CaseProposal[];
}

export interface KeptCase {
  key: string;
  group: string;
  input: string;
  quote: string;
}

/** Ca bị bỏ. `reason` KHÔNG chứa nội dung input; `input` ở lại để lưu vào gói kèm `auto_dropped_reason`. */
export interface DroppedCase {
  name: string;
  key: string;
  group: string;
  input: string;
  reason: string;
}

export interface DroppedRef {
  name: string;
  reason: string;
}

/** `execJob.cases.max(200)`. */
export const MAX_CASES = 200;
/** Dưới số này, hoặc dưới nửa số ca đề xuất, gói bị cảnh báo thiếu độ phủ (spec §4.4 bước 10, D-F). */
export const MIN_USEFUL_CASES = 5;
/** `stdout` của một ca bị worker cắt ở 64 KiB (`execResult.cases[].stdout.max(65_536)`): chạm trần là output không toàn vẹn. */
export const STDOUT_LIMIT = 65_536;
/** Input từ độ dài này coi là "ca lớn" khi kiểm độ phủ. */
export const LARGE_INPUT_CHARS = 1_000;
/** Trích dẫn ngắn hơn số này không chứng minh gì (một ký tự khớp mọi đề). */
const MIN_QUOTE_CHARS = 10;
const MAX_KEY_CHARS = 64;
const MAX_GROUP_CHARS = 100;
const DEFAULT_GROUP = 'co_ban';

/** NFC, gộp mọi khoảng trắng thành một dấu cách, cắt hai đầu — cùng cách với `evidence-check.ts`. */
export function normalizeForQuote(text: string): string {
  return text.normalize('NFC').replace(/\s+/g, ' ').trim();
}

/** Trích dẫn có THẬT SỰ nằm trong đề không (sau chuẩn hoá hai phía). Quá ngắn thì không tính. */
export function quoteAppearsInStatement(quote: string, statement: string): boolean {
  const q = normalizeForQuote(quote);
  return q.length >= MIN_QUOTE_CHARS && normalizeForQuote(statement).includes(q);
}

/** Bỏ dấu và đổi `đ`: NFD không tách `đ` ra khỏi `d`, nên phải đổi riêng. */
function asciiFold(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
}

/** Tên nhóm của ca: slug thường, gạch dưới; rỗng thì `co_ban`. Khớp `CHECK (length("group") BETWEEN 1 AND 100)`. */
export function normalizeGroup(raw: string): string {
  const slug = asciiFold(raw).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, MAX_GROUP_CHARS);
  return slug === '' ? DEFAULT_GROUP : slug;
}

/** Khoá ca khớp `^[A-Za-z0-9_-]{1,64}$` (CHECK của DB), duy nhất trong gói bằng hậu tố -2, -3. */
function uniqueKey(name: string, index: number, taken: Set<string>): string {
  const base = asciiFold(name).replace(/[^a-z0-9_-]+/g, '-').replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '').slice(0, MAX_KEY_CHARS);
  let key = base === '' ? `ca-${index + 1}` : base;
  for (let n = 2; taken.has(key); n++) {
    const suffix = `-${n}`;
    key = `${(base === '' ? `ca-${index + 1}` : base).slice(0, MAX_KEY_CHARS - suffix.length)}${suffix}`;
  }
  taken.add(key);
  return key;
}

/**
 * Lọc TRƯỚC khi chạy (spec §4.4 bước 5). Một ca bị bỏ nếu: không trích được đề; đáp án không duy nhất (gói chưa có bộ so
 * sánh cho nó); input quá 4 MiB; hay vượt trần số ca. Thứ tự đề xuất của LLM được giữ.
 * `limit` là số ca tối đa còn được phép (đã trừ chỗ của các ví dụ trong đề, vì chúng chạy chung job).
 */
export function prefilterCases(proposed: CaseProposal[], statement: string, limit: number): { kept: KeptCase[]; dropped: DroppedCase[] } {
  const taken = new Set<string>();
  const kept: KeptCase[] = [];
  const dropped: DroppedCase[] = [];
  proposed.forEach((c, index) => {
    const key = uniqueKey(c.name, index, taken);
    const group = normalizeGroup(c.group);
    const drop = (reason: string) => dropped.push({ name: c.name, key, group, input: c.input, reason });
    if (!quoteAppearsInStatement(c.quote, statement)) return drop('không trích được câu nào trong đề');
    if (!c.answerIsUnique) return drop('đáp án không duy nhất và gói chưa có bộ so sánh phù hợp');
    if (c.input.length > INLINE_MAX_CHARS) return drop('input vượt 4 MiB');
    if (kept.length >= limit) return drop(`vượt trần ${limit} ca của một job`);
    kept.push({ key, group, input: c.input, quote: c.quote });
  });
  return { kept, dropped };
}

/**
 * Hai lượt chạy đáp án (D-C) thành output ỔN ĐỊNH của từng ca. Ca bị bỏ khi: thiếu kết quả; một lượt crash, timeout,
 * hết đệ quy; output chạm trần 64 KiB; hay hai lượt cho output khác nhau (nondeterministic). Không bao giờ ghi một output
 * rỗng thay cho "không chạy được".
 */
export function interpretRuns(first: ExecResult, second: ExecResult, wanted: string[]): { stable: Map<string, string>; dropped: DroppedRef[] } {
  const byName = (r: ExecResult) => new Map(r.cases.map((c) => [c.name, c]));
  const a = byName(first);
  const b = byName(second);
  const stable = new Map<string, string>();
  const dropped: DroppedRef[] = [];
  for (const name of wanted) {
    const x = a.get(name);
    const y = b.get(name);
    if (!x || !y) {
      dropped.push({ name, reason: 'không có kết quả từ worker' });
      continue;
    }
    const bad = [x, y].find((c) => c.status !== 'ran' && c.status !== 'pass');
    if (bad) {
      dropped.push({ name, reason: bad.status === 'output_limit' ? 'output vượt 64 KiB' : `trạng thái ${bad.status} khi chạy đáp án` });
      continue;
    }
    if (x.stdout === null || y.stdout === null) {
      dropped.push({ name, reason: 'worker không trả stdout' });
      continue;
    }
    if (x.stdout.length >= STDOUT_LIMIT || y.stdout.length >= STDOUT_LIMIT) {
      dropped.push({ name, reason: 'output vượt 64 KiB' });
      continue;
    }
    if (x.stdout !== y.stdout) {
      dropped.push({ name, reason: 'nondeterministic: hai lượt chạy cho output khác nhau' });
      continue;
    }
    stable.set(name, x.stdout);
  }
  return { stable, dropped };
}

/** So output như comparator `exact` của worker: bỏ CRLF, khoảng trắng cuối dòng và xuống dòng cuối. */
export function sameOutput(a: string, b: string): boolean {
  const norm = (s: string) => s.replace(/\r\n/g, '\n').split('\n').map((line) => line.replace(/\s+$/, '')).join('\n').replace(/\n+$/, '');
  return norm(a) === norm(b);
}

export interface ExampleMismatch {
  index: number;
  input: string;
  expected: string;
  actual: string;
}

/**
 * Đáp án chạy thật phải tái tạo đúng các ví dụ vào/ra TRONG ĐỀ (spec §4.6). Ví dụ không trích được đề thì không được tin
 * và không tính. Ví dụ mà đáp án không in ra gì tính là lệch, không âm thầm bỏ qua.
 * Hệ thống KHÔNG kết luận đáp án sai khi lệch: ví dụ trong đề có thể sai chính tả, nên chỉ báo để giảng viên xem.
 */
export function checkExamples(
  examples: ExampleProposal[],
  statement: string,
  stdoutOf: (index: number) => string | null,
): { checked: number; mismatches: ExampleMismatch[] } {
  let checked = 0;
  const mismatches: ExampleMismatch[] = [];
  examples.forEach((ex, index) => {
    if (!quoteAppearsInStatement(ex.quote, statement)) return;
    checked += 1;
    const actual = stdoutOf(index);
    if (actual === null || !sameOutput(actual, ex.output)) {
      mismatches.push({ index, input: ex.input, expected: ex.output, actual: actual ?? '' });
    }
  });
  return { checked, mismatches };
}

/** Cảnh báo độ phủ kèm danh sách ca bị bỏ; không chặn ghi gói (giảng viên thêm ca bằng route tạo gói có sẵn). */
export function coverageWarnings(proposedCount: number, kept: { group: string; input: string }[], dropped: DroppedRef[]): string[] {
  const warnings: string[] = [];
  if (kept.length < MIN_USEFUL_CASES || kept.length * 2 < proposedCount) {
    const list = dropped.map((d) => `${d.name}: ${d.reason}`).join('; ');
    warnings.push(
      `Chỉ còn ${kept.length}/${proposedCount} ca sau khi lọc${list ? ` — ca bị bỏ: ${list}` : ''}. Hãy thêm ca bằng route tạo gói test.`,
    );
  }
  if (!kept.some((c) => c.group === 'bien')) warnings.push('Thiếu ca nhóm bien (biên).');
  if (!kept.some((c) => c.group === 'lon' || c.input.length >= LARGE_INPUT_CHARS)) {
    warnings.push(`Thiếu ca lớn (input từ ${LARGE_INPUT_CHARS} ký tự hoặc nhóm lon).`);
  }
  return warnings;
}

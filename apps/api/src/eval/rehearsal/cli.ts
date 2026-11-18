import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { io, Socket } from 'socket.io-client';
import { makeRunId } from '../run-writer';
import { ActualSubmission, evaluateRun, isRehearsalSession, RehearsalScenario, renderIndex, RunRecord, scenarioRows, unitKey } from './score-run';
import { NGAN_XEP_V1 } from './scenarios/ngan-xep-v1';
import { NGAN_XEP_V2 } from './scenarios/ngan-xep-v2';
import { NGAN_XEP_3CAU } from './scenarios/ngan-xep-3cau';
import { HttpError, isConnectPhaseError, isNetworkError, withRetry } from './retry';

/**
 * Diễn tập chấm điểm THẬT trên một bản deploy (model + sandbox thật): dựng phiên, cho từng sinh
 * viên nộp qua socket như agent thật, bấm chấm, chờ, rồi chấm lượt đó theo kỳ vọng của kịch bản
 * và ghi vào `eval/rehearsals/<lượt>/`. `--collect <sessionId>` ghi bù một phiên đã chấm trước đó.
 */
const SCENARIOS: Record<string, RehearsalScenario> = {
  [NGAN_XEP_V1.id]: NGAN_XEP_V1,
  [NGAN_XEP_V2.id]: NGAN_XEP_V2,
  [NGAN_XEP_3CAU.id]: NGAN_XEP_3CAU,
};
const ROOT = join(__dirname, '..', '..', '..', 'eval', 'rehearsals');

interface Args {
  scenario: string;
  deploy: string;
  note: string;
  only: string[] | null;
  collect: string | null;
  wallSec: number | null;
  startedAt: string | null;
  timeoutMin: number;
  /** Phòng dựng phiên. Mặc định cũ `TEST-KHONG-PHONG`; đổi khi phòng đó đang có phiên khác trùng giờ. */
  room: string;
}

interface DetailResponse {
  status: string;
  currentScore: number | null;
  breakdown: {
    confidence: number | null;
    errors: { ruleKey: string; source: string; counted: string }[];
    caseFlags: { code: string; detail?: string }[];
  } | null;
  challengeVerdicts?: ActualSubmission['verdicts'];
  challengeNotes?: ActualSubmission['caseNotes'];
}

function parseArgs(argv: string[]): Args | string {
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const deploy = get('--deploy');
  const note = get('--note');
  if (!deploy || !note) return 'cần --deploy <commit của bản deploy> và --note "<vì sao chạy lượt này>"';
  const scenario = get('--scenario') ?? NGAN_XEP_V1.id;
  if (!SCENARIOS[scenario]) return `không có kịch bản "${scenario}" (có: ${Object.keys(SCENARIOS).join(', ')})`;
  return {
    scenario,
    deploy,
    note,
    only: get('--only')?.split(',').map((s) => s.trim()) ?? null,
    collect: get('--collect') ?? null,
    wallSec: get('--wall-sec') ? Number(get('--wall-sec')) : null,
    startedAt: get('--started-at') ?? null,
    timeoutMin: get('--timeout-min') ? Number(get('--timeout-min')) : 12,
    room: get('--room') ?? 'TEST-KHONG-PHONG',
  };
}

function env(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Thiếu biến môi trường ${name}`);
    process.exit(2);
  }
  return v;
}

let BASE = '';
let token = '';

/** Một lần gọi, không thử lại. Lỗi HTTP ném `HttpError` để phân biệt với lỗi mạng. */
async function once<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: unknown;
  try { json = JSON.parse(text); } catch { json = text; }
  if (!res.ok) throw new HttpError(res.status, `${method} ${path} -> ${res.status}: ${JSON.stringify(json).slice(0, 500)}`);
  return json as T;
}

/**
 * Có thử lại không phụ thuộc phương thức. GET không có tác dụng phụ nên thử lại mọi lỗi mạng và 5xx.
 * POST/PUT/PATCH chỉ thử lại khi lỗi xảy ra TRƯỚC khi gửi (connect timeout, từ chối kết nối), vì
 * một request đã tới server có thể đã tạo phiên hoặc đã bắt đầu chấm — gửi lại sẽ làm đôi.
 */
function retryable(method: string) {
  return (error: unknown) => {
    if (error instanceof HttpError) return error.status >= 500 && method === 'GET';
    if (!isNetworkError(error)) return false;
    return method === 'GET' || isConnectPhaseError(error);
  };
}

/** Lần chạy 2026-10-14: một connect timeout 10 s làm cả lượt chết, dù chấm phía server vẫn xong. */
async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  return withRetry(() => once<T>(method, path, body), {
    attempts: 4,
    baseMs: 3000,
    retryable: retryable(method),
    onRetry: (attempt, error) =>
      console.warn(`  thử lại lần ${attempt} (${method} ${path}): ${error instanceof Error ? error.message.slice(0, 120) : String(error)}`),
  });
}

const itemsOf = <T>(x: { items?: T[] } | T[]): T[] => (Array.isArray(x) ? x : (x.items ?? []));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const since = (t0: number) => Math.round((Date.now() - t0) / 100) / 10;

async function ensureRubricAndRules(s: RehearsalScenario): Promise<string> {
  const rubrics = itemsOf<{ id: string; name: string }>(await api('GET', '/rubrics'));
  const rubric = rubrics.find((r) => r.name === s.rubric.name) ?? (await api<{ id: string }>('POST', '/rubrics', s.rubric));
  // Lỗi đã có ở rubric này (theo ruleKey) thì bỏ qua; lỗi đã có trong thư viện nhưng chưa áp thì thêm bằng ruleId.
  const here = itemsOf<{ id: string; ruleKey: string; deduction: string | null }>(
    await api('GET', `/rubric-errors?rubricName=${encodeURIComponent(s.rubric.name)}`),
  );
  const library = itemsOf<{ id: string; ruleKey: string }>(await api('GET', '/rules'));
  for (const rule of s.rules) {
    const existing = here.find((r) => r.ruleKey === rule.ruleKey);
    if (existing) {
      // Giá của giảng viên có thể đã lệch kịch bản mà không ai biết (lượt 2026-10-14: sai_ca_co_ban 3 → 1,5 từ
      // phiên bản v6). Đồng bộ về giá kịch bản bằng đúng endpoint của app; đổi giá tính lại bài chưa chốt (§2.2).
      if (existing.deduction !== null && Number(existing.deduction) === Number(rule.price)) continue;
      await api('PUT', `/rubric-errors/${existing.id}/price`, { deduction: Number(rule.price).toFixed(2) });
      console.log(`  ~ giá ${rule.ruleKey}: ${existing.deduction ?? 'chưa có'} → ${rule.price}`);
      continue;
    }
    const known = library.find((r) => r.ruleKey === rule.ruleKey);
    const base = { rubricName: s.rubric.name, criterionKey: rule.criterionKey, deduction: String(rule.price) };
    await api(
      'POST',
      '/rubric-errors',
      known
        ? { ...base, ruleId: known.id }
        // `ruleKey` tường minh: lệnh diễn tập so kết quả theo khoá cố định của kịch bản.
        : {
            ...base,
            newRule: {
              ruleKey: rule.ruleKey,
              name: rule.name,
              description: rule.description,
              predicate: rule.predicate,
            },
          },
    );
    console.log(`  + lỗi ${rule.ruleKey}`);
  }
  return rubric.id;
}

function ack<T>(socket: Socket, event: string, payload: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`không có ack cho ${event}`)), 20_000);
    socket.emit(event, payload, (reply: T) => { clearTimeout(timer); resolve(reply); });
  });
}

async function submit(sessionId: string, code: string, deliverableId: string, sub: { mssv: string; name: string; code: string }) {
  const socket = io(`${BASE}/exam-live`, { reconnection: false, forceNew: true, transports: ['websocket'] });
  try {
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('socket connect timeout')), 20_000);
      socket.on('connect', () => { clearTimeout(t); resolve(); });
      socket.on('connect_error', (e) => { clearTimeout(t); reject(e); });
    });
    await new Promise<void>((resolve, reject) => {
      socket.on('agent:join:ack', () => resolve());
      socket.on('agent:join:error', (e) => reject(new Error(`${sub.mssv}: ${JSON.stringify(e)}`)));
      socket.emit('agent:join', { fullName: sub.name, studentId: sub.mssv, sessionCode: code });
    });
    const url = await ack<{ ok: boolean; uploadUrl: string; storageKey: string }>(socket, 'submission:request-upload-url', {
      examSessionId: sessionId, studentId: sub.mssv, requiredDeliverableId: deliverableId,
    });
    if (!url.ok) throw new Error(`${sub.mssv} upload-url: ${JSON.stringify(url)}`);
    const put = await fetch(url.uploadUrl, { method: 'PUT', body: sub.code });
    if (!put.ok) throw new Error(`${sub.mssv} PUT ${put.status}`);
    const confirm = await ack<{ ok: boolean }>(socket, 'submission:confirm', {
      examSessionId: sessionId, studentId: sub.mssv, requiredDeliverableId: deliverableId, storageKey: url.storageKey,
      checksum: createHash('sha256').update(sub.code).digest('hex'), fileSize: Buffer.byteLength(sub.code),
    });
    if (!confirm.ok) throw new Error(`${sub.mssv} confirm: ${JSON.stringify(confirm)}`);
  } finally {
    socket.disconnect();
  }
}

/** Phiên nhiều câu: đề chỉ gắn được TRƯỚC giờ bắt đầu (canAttachExam), nên giờ bắt đầu đặt sau đó ít phút. */
const START_DELAY_MS = 240_000;

/**
 * Giờ bắt đầu phiên nhiều câu: `REHEARSAL_START_AT` (ISO, tường minh) khi lớp đã có ca khác trong khung giờ mặc định;
 * vắng thì sau `now` một khoảng ngắn. Phải ở tương lai đủ để kịp gắn đề.
 */
function startAtOf(now: number): number {
  const raw = process.env.REHEARSAL_START_AT;
  if (!raw) return now + START_DELAY_MS;
  const at = Date.parse(raw);
  if (!Number.isFinite(at) || at < now + 60_000) {
    throw new Error(`REHEARSAL_START_AT="${raw}" không phải thời điểm trong tương lai (cần ít nhất 1 phút nữa)`);
  }
  return at;
}

interface SessionCreated {
  id: string;
  code: string;
  requiredDeliverables: { id: string; requiredFilename: string }[];
}

/** Số câu của một yêu cầu nộp: `cau2.cpp` là câu 2; tên khác (phiên một câu `{MSSV}_bai.cpp`) là câu 1. */
function ordinalOf(requiredFilename: string | null): number {
  const m = /^cau(\d+)\.cpp$/.exec(requiredFilename ?? '');
  return m ? Number(m[1]) : 1;
}

function deliverableOf(session: SessionCreated, sub: { ordinal?: number }, multi: boolean): string {
  if (!multi) return session.requiredDeliverables[0].id;
  const d = session.requiredDeliverables.find((x) => x.requiredFilename === `cau${sub.ordinal ?? 1}.cpp`);
  if (!d) throw new Error(`phiên không có yêu cầu nộp cau${sub.ordinal ?? 1}.cpp`);
  return d.id;
}

/**
 * Gắn đề nhiều câu qua đường gắn đề thật (`/exam-authoring/attach`, không LLM), rồi đặt gói test riêng cho từng câu,
 * xác nhận thước và đề cương. Đây là đúng thứ tự giảng viên làm trên giao diện.
 */
async function attachProblems(s: RehearsalScenario, sessionId: string): Promise<void> {
  const points = s.rubric.criteria.reduce((sum, c) => sum + c.maxPoints, 0);
  const examJson = {
    title: `Đề thi thử ${s.id}`,
    language: 'cpp',
    verification: { status: 'unverified' },
    questions: s.problems!.map((p) => ({
      statement: p.statement, modelAnswer: p.modelAnswer, topic: p.title, points,
      requiredComplexity: null, resemblesKnownProblem: null, testBundle: [],
    })),
  };
  await api('POST', '/exam-authoring/attach', { examSessionId: sessionId, examJson: JSON.stringify(examJson) });
  const problems = await api<{ id: string; ordinal: number }[]>('GET', `/exam-sessions/${sessionId}/problems`);
  for (const p of s.problems!) {
    const problem = problems.find((x) => x.ordinal === p.ordinal);
    if (!problem) throw new Error(`thiếu câu ${p.ordinal} sau khi gắn đề`);
    const bundle = await api<{ id: string }>('POST', `/exam-sessions/${sessionId}/test-bundles`, { problemId: problem.id, cases: p.tests });
    await api('POST', `/exam-sessions/${sessionId}/test-bundles/${bundle.id}/approve`, {});
    await api('POST', `/exam-sessions/${sessionId}/test-bundles/${bundle.id}/pin`, {});
  }
  await api('POST', `/exam-sessions/${sessionId}/ruler/confirm`, {});
  await api('POST', `/exam-sessions/${sessionId}/blueprint/confirm`, {});
}

async function runSession(
  s: RehearsalScenario,
  subs: RehearsalScenario['submissions'],
  classId: string,
  timeoutMin: number,
  room: string,
) {
  const multi = s.problems !== undefined;
  const rubricId = await ensureRubricAndRules(s);
  const now = Date.now();
  const startMs = multi ? startAtOf(now) : now - 60_000;
  const session = await api<SessionCreated>('POST', '/exam-sessions', {
    name: `TEST dien tap ${s.id} - xoa sau ${now}`,
    classId, roomName: room, semesterName: 'TEST dien tap', examType: 'TK',
    startTime: new Date(startMs).toISOString(), endTime: new Date(now + 3_600_000).toISOString(),
    rubricId,
    requiredFilenames: multi
      ? s.problems!.map((p) => ({ filename: `cau${p.ordinal}.cpp`, deliverableType: 'code_project', language: 'cpp' }))
      : [{ filename: '{MSSV}_bai.cpp', deliverableType: 'code_project', language: 'cpp' }],
  });
  console.log(`phiên ${session.id} (${session.code})${multi ? `, ${s.problems!.length} câu` : ''}`);
  if (multi) {
    await attachProblems(s, session.id);
    await sleep(Math.max(0, startMs + 2000 - Date.now()));
  }
  await api('POST', `/exam-sessions/${session.id}/open`, {});
  if (!multi) {

  const size = Buffer.byteLength(s.question);
  const mat = await api<{ uploadUrl: string; examMaterialId: string; storageKey: string }>('POST', `/exam-sessions/${session.id}/materials/upload-url`, { fileName: 'de-bai.txt', fileSize: size });
  const putMat = await fetch(mat.uploadUrl, { method: 'PUT', body: s.question });
  if (!putMat.ok) throw new Error(`material PUT ${putMat.status}`);
  await api('POST', `/exam-sessions/${session.id}/materials`, { examMaterialId: mat.examMaterialId, storageKey: mat.storageKey, fileName: 'de-bai.txt', fileSize: size });
  await api('PUT', `/exam-sessions/${session.id}/grading-reference`, { questionMaterialId: mat.examMaterialId });

  const bundle = await api<{ id: string }>('POST', `/exam-sessions/${session.id}/test-bundles`, { cases: s.tests });
  await api('POST', `/exam-sessions/${session.id}/test-bundles/${bundle.id}/approve`, {});
  await api('POST', `/exam-sessions/${session.id}/test-bundles/${bundle.id}/pin`, {});
  }

  for (const sub of subs) {
    if (sub.missing) {
      console.log(`  (không nộp) ${sub.mssv} — câu ${sub.ordinal}`);
      continue;
    }
    await submit(session.id, session.code, deliverableOf(session, sub, multi), sub);
    console.log(`  nộp ${sub.mssv} câu ${sub.ordinal ?? 1} — ${sub.label}`);
  }
  await api('POST', `/exam-sessions/${session.id}/finalize`, {});
  await api('POST', `/exam-sessions/${session.id}/confirm-end`, {});
  const tGrade = Date.now();
  await api('POST', `/exam-sessions/${session.id}/start-grading`, {});
  console.log(`bắt đầu chấm; chờ tối đa ${timeoutMin} phút…`);

  // Bài thiếu file (`missing`) không có kết quả, nên không tính vào số bài phải chờ.
  const expected = subs.filter((x) => !x.missing).length;
  const doneAt = new Map<string, number>();
  for (let i = 0; Date.now() - tGrade < timeoutMin * 60_000; i++) {
    await sleep(5000);
    const rows = itemsOf<{ studentMssv: string; status: string; requiredFilename: string | null }>(
      await api('GET', `/exam-sessions/${session.id}/grading-results`),
    );
    for (const r of rows) {
      const key = unitKey(r.studentMssv, ordinalOf(r.requiredFilename));
      if (r.status !== 'ai_grading' && !doneAt.has(key)) doneAt.set(key, since(tGrade));
    }
    const pending = rows.filter((r) => r.status === 'ai_grading').length;
    if (i % 4 === 0 || pending === 0) console.log(`  [${since(tGrade)}s] xong ${rows.length - pending}/${expected}`);
    if (rows.length >= expected && pending === 0) break;
  }
  const times = [...doneAt.values()];
  return { sessionId: session.id, doneAt, wallSec: times.length === expected ? Math.max(...times) : null };
}

async function collect(scenario: RehearsalScenario, sessionId: string, doneAt: Map<string, number>): Promise<ActualSubmission[]> {
  const session = await api<{ name: string }>('GET', `/exam-sessions/${sessionId}`);
  if (!isRehearsalSession(session.name)) {
    console.error(`Từ chối ghi: phiên "${session.name}" không phải phiên diễn tập (tên phải bắt đầu bằng "TEST ") — bản ghi được commit vào git.`);
    process.exit(2);
  }
  const rows = scenarioRows(
    scenario,
    itemsOf<{ id: string; studentMssv: string; modelUsed: string | null; requiredFilename: string | null }>(
      await api('GET', `/exam-sessions/${sessionId}/grading-results`),
    ),
  );
  const out: ActualSubmission[] = [];
  for (const row of rows) {
    const d = await api<DetailResponse>('GET', `/grading-results/${row.id}/investigation`);
    const ordinal = ordinalOf(row.requiredFilename);
    out.push({
      mssv: row.studentMssv,
      ordinal,
      status: d.status,
      score: d.currentScore ?? null,
      confidence: d.breakdown?.confidence ?? null,
      model: row.modelUsed ?? null,
      errors: (d.breakdown?.errors ?? []).map((e) => ({ ruleKey: e.ruleKey, source: e.source, counted: e.counted })),
      verdicts: d.challengeVerdicts ?? [],
      caseNotes: d.challengeNotes ?? [],
      caseFlags: (d.breakdown?.caseFlags ?? []).map((f) => f.code),
      caseFlagDetails: (d.breakdown?.caseFlags ?? []).map((f) => ({ code: f.code, detail: f.detail ?? null })),
      finishedAtSec: doneAt.get(unitKey(row.studentMssv, ordinal)) ?? null,
    });
  }
  return out;
}

async function runDirs(): Promise<string[]> {
  if (!existsSync(ROOT)) return [];
  return (await readdir(ROOT, { withFileTypes: true }))
    .filter((e) => e.isDirectory() && existsSync(join(ROOT, e.name, 'run.json')))
    .map((e) => join(ROOT, e.name));
}

async function writeIndex(): Promise<void> {
  const records: RunRecord[] = [];
  for (const dir of await runDirs()) records.push(JSON.parse(await readFile(join(dir, 'run.json'), 'utf8')));
  await writeFile(join(ROOT, 'README.md'), renderIndex(records));
}

async function writeRecord(record: RunRecord, actuals: ActualSubmission[]): Promise<string> {
  let dir = join(ROOT, record.id);
  for (let i = 2; existsSync(dir); i++) dir = join(ROOT, `${record.id}-${i}`);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'run.json'), `${JSON.stringify(record, null, 2)}\n`);
  await writeFile(join(dir, 'submissions.jsonl'), `${actuals.map((a) => JSON.stringify(a)).join('\n')}\n`);
  await writeIndex();
  return dir;
}

/** Chấm lại MỌI lượt đã ghi từ `submissions.jsonl` thô bằng bộ chấm hiện tại — sau khi đổi định nghĩa chỉ số. */
async function rescoreAll(): Promise<void> {
  for (const dir of await runDirs()) {
    const record: RunRecord = JSON.parse(await readFile(join(dir, 'run.json'), 'utf8'));
    const actuals: ActualSubmission[] = (await readFile(join(dir, 'submissions.jsonl'), 'utf8'))
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l));
    const { checks, summary } = evaluateRun(SCENARIOS[record.scenario], actuals);
    await writeFile(join(dir, 'run.json'), `${JSON.stringify({ ...record, checks, summary }, null, 2)}\n`);
    console.log(`${record.id}: ${JSON.stringify(summary)}`);
  }
  await writeIndex();
}

function report(record: RunRecord): void {
  for (const c of record.checks) {
    const bad = [
      c.auditHidden ? 'điểm ẩn do kiểm mẫu — không đo được' : c.scoreOk ? null : `điểm ${c.actualScore} ≠ kỳ vọng ${c.expectedScore}`,
      c.missedErrors.length ? `sót ${c.missedErrors.join(',')}` : null,
      c.extraErrors.length ? `thừa ${c.extraErrors.join(',')}` : null,
      c.decisionOk ? null : `quyết định ${c.actualDecision} ≠ ${c.expectedDecision}`,
      c.falseFlags.length ? `cờ oan ${c.falseFlags.join(',')}` : null,
      c.missedFlags.length ? `bỏ lỡ cờ ${c.missedFlags.join(',')}` : null,
      c.lensFailures.length ? `lăng kính hỏng ${c.lensFailures.join(',')}` : null,
    ].filter(Boolean);
    console.log(`${bad.length ? '✗' : '✓'} ${c.mssv} (${c.label})${bad.length ? ` — ${bad.join('; ')}` : ''}`);
  }
  console.log(JSON.stringify(record.summary));
}

async function main() {
  if (process.argv.includes('--rescore')) return rescoreAll();
  const args = parseArgs(process.argv.slice(2));
  if (typeof args === 'string') {
    console.error(`Từ chối chạy: ${args}`);
    process.exit(2);
  }
  const scenario = SCENARIOS[args.scenario];
  const subs = scenario.submissions.filter((s) => !args.only || args.only.includes(s.mssv));
  BASE = env('REHEARSAL_BASE_URL').replace(/\/$/, '');
  const login = await api<{ accessToken: string }>('POST', '/auth/login', { email: env('REHEARSAL_EMAIL'), password: env('REHEARSAL_PASSWORD') });
  token = login.accessToken;

  const startedAt = args.startedAt ? new Date(args.startedAt) : new Date();
  let sessionId: string;
  let doneAt = new Map<string, number>();
  let wallSec: number | null;
  if (args.collect) {
    sessionId = args.collect;
    wallSec = args.wallSec;
  } else {
    ({ sessionId, doneAt, wallSec } = await runSession(scenario, subs, env('REHEARSAL_CLASS_ID'), args.timeoutMin, args.room));
  }
  const actuals = await collect(scenario, sessionId, doneAt);
  // Chấm theo đúng các bài đã chạy (`--only` bỏ bớt sinh viên thì không tính là thiếu kết quả).
  const { checks, summary } = evaluateRun({ ...scenario, submissions: subs }, actuals);
  const record: RunRecord = {
    id: makeRunId(startedAt, args.deploy),
    startedAt: startedAt.toISOString(),
    scenario: scenario.id,
    deploy: args.deploy.slice(0, 7),
    note: args.note,
    wallSec,
    backfilled: args.collect !== null,
    sessionId,
    checks,
    summary,
  };
  report(record);
  console.log(`ghi: ${await writeRecord(record, actuals)}`);
}

main().catch((e) => {
  console.error('FAILED:', e);
  process.exit(1);
});

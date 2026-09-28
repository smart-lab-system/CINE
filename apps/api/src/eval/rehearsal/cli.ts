import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { io, Socket } from 'socket.io-client';
import { makeRunId } from '../run-writer';
import { ActualSubmission, evaluateRun, RehearsalScenario, renderIndex, RunRecord } from './score-run';
import { NGAN_XEP_V1 } from './scenarios/ngan-xep-v1';

/**
 * Diễn tập chấm điểm THẬT trên một bản deploy (model + sandbox thật): dựng phiên, cho từng sinh
 * viên nộp qua socket như agent thật, bấm chấm, chờ, rồi chấm lượt đó theo kỳ vọng của kịch bản
 * và ghi vào `eval/rehearsals/<lượt>/`. `--collect <sessionId>` ghi bù một phiên đã chấm trước đó.
 */
const SCENARIOS: Record<string, RehearsalScenario> = { [NGAN_XEP_V1.id]: NGAN_XEP_V1 };
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
}

interface DetailResponse {
  status: string;
  currentScore: number | null;
  breakdown: {
    confidence: number | null;
    errors: { ruleKey: string; source: string; counted: string }[];
    caseFlags: { code: string }[];
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

async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: unknown;
  try { json = JSON.parse(text); } catch { json = text; }
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(json).slice(0, 500)}`);
  return json as T;
}

const itemsOf = <T>(x: { items?: T[] } | T[]): T[] => (Array.isArray(x) ? x : (x.items ?? []));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const since = (t0: number) => Math.round((Date.now() - t0) / 100) / 10;

async function ensureRubricAndRules(s: RehearsalScenario): Promise<string> {
  const rubrics = itemsOf<{ id: string; name: string }>(await api('GET', '/rubrics'));
  const rubric = rubrics.find((r) => r.name === s.rubric.name) ?? (await api<{ id: string }>('POST', '/rubrics', s.rubric));
  const existing = itemsOf<{ id: string; ruleKey: string }>(await api('GET', '/rules'));
  for (const rule of s.rules) {
    if (existing.some((r) => r.ruleKey === rule.ruleKey)) continue;
    const { price, ...body } = rule;
    const created = await api<{ id: string }>('POST', '/rules', body);
    await api('PUT', `/rules/${created.id}/price`, { deduction: price });
    console.log(`  + luật ${rule.ruleKey}`);
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

async function runSession(s: RehearsalScenario, subs: RehearsalScenario['submissions'], classId: string, timeoutMin: number) {
  const rubricId = await ensureRubricAndRules(s);
  const now = Date.now();
  const session = await api<{ id: string; code: string; requiredDeliverables: { id: string }[] }>('POST', '/exam-sessions', {
    name: `TEST dien tap ${s.id} - xoa sau ${now}`,
    classId, roomName: 'TEST-KHONG-PHONG', semesterName: 'TEST dien tap', examType: 'TK',
    startTime: new Date(now - 60_000).toISOString(), endTime: new Date(now + 3_600_000).toISOString(),
    rubricId, requiredFilenames: [{ filename: '{MSSV}_bai.cpp', deliverableType: 'code_project', language: 'cpp' }],
  });
  console.log(`phiên ${session.id} (${session.code})`);
  await api('POST', `/exam-sessions/${session.id}/open`, {});

  const size = Buffer.byteLength(s.question);
  const mat = await api<{ uploadUrl: string; examMaterialId: string; storageKey: string }>('POST', `/exam-sessions/${session.id}/materials/upload-url`, { fileName: 'de-bai.txt', fileSize: size });
  const putMat = await fetch(mat.uploadUrl, { method: 'PUT', body: s.question });
  if (!putMat.ok) throw new Error(`material PUT ${putMat.status}`);
  await api('POST', `/exam-sessions/${session.id}/materials`, { examMaterialId: mat.examMaterialId, storageKey: mat.storageKey, fileName: 'de-bai.txt', fileSize: size });
  await api('PUT', `/exam-sessions/${session.id}/grading-reference`, { questionMaterialId: mat.examMaterialId });

  const bundle = await api<{ id: string }>('POST', `/exam-sessions/${session.id}/test-bundles`, { cases: s.tests });
  await api('POST', `/exam-sessions/${session.id}/test-bundles/${bundle.id}/approve`, {});
  await api('POST', `/exam-sessions/${session.id}/test-bundles/${bundle.id}/pin`, {});

  for (const sub of subs) {
    await submit(session.id, session.code, session.requiredDeliverables[0].id, sub);
    console.log(`  nộp ${sub.mssv} — ${sub.label}`);
  }
  await api('POST', `/exam-sessions/${session.id}/finalize`, {});
  await api('POST', `/exam-sessions/${session.id}/confirm-end`, {});
  const tGrade = Date.now();
  await api('POST', `/exam-sessions/${session.id}/start-grading`, {});
  console.log(`bắt đầu chấm; chờ tối đa ${timeoutMin} phút…`);

  const doneAt = new Map<string, number>();
  for (let i = 0; Date.now() - tGrade < timeoutMin * 60_000; i++) {
    await sleep(5000);
    const rows = itemsOf<{ studentMssv: string; status: string }>(await api('GET', `/exam-sessions/${session.id}/grading-results`));
    for (const r of rows) if (r.status !== 'ai_grading' && !doneAt.has(r.studentMssv)) doneAt.set(r.studentMssv, since(tGrade));
    const pending = rows.filter((r) => r.status === 'ai_grading').length;
    if (i % 4 === 0 || pending === 0) console.log(`  [${since(tGrade)}s] xong ${rows.length - pending}/${subs.length}`);
    if (rows.length >= subs.length && pending === 0) break;
  }
  const times = [...doneAt.values()];
  return { sessionId: session.id, doneAt, wallSec: times.length === subs.length ? Math.max(...times) : null };
}

async function collect(sessionId: string, doneAt: Map<string, number>): Promise<ActualSubmission[]> {
  const rows = itemsOf<{ id: string; studentMssv: string }>(await api('GET', `/exam-sessions/${sessionId}/grading-results`));
  const out: ActualSubmission[] = [];
  for (const row of rows) {
    const d = await api<DetailResponse>('GET', `/grading-results/${row.id}/investigation`);
    out.push({
      mssv: row.studentMssv,
      status: d.status,
      score: d.currentScore ?? null,
      confidence: d.breakdown?.confidence ?? null,
      errors: (d.breakdown?.errors ?? []).map((e) => ({ ruleKey: e.ruleKey, source: e.source, counted: e.counted })),
      verdicts: d.challengeVerdicts ?? [],
      caseNotes: d.challengeNotes ?? [],
      caseFlags: (d.breakdown?.caseFlags ?? []).map((f) => f.code),
      finishedAtSec: doneAt.get(row.studentMssv) ?? null,
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
      c.scoreOk ? null : `điểm ${c.actualScore} ≠ kỳ vọng ${c.expectedScore}`,
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
    ({ sessionId, doneAt, wallSec } = await runSession(scenario, subs, env('REHEARSAL_CLASS_ID'), args.timeoutMin));
  }
  const actuals = await collect(sessionId, doneAt);
  const { checks, summary } = evaluateRun(scenario, actuals);
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

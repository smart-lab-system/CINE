import { createHash } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { ExamSessionEntity } from '../src/exam-session/entities/exam-session.entity';
import { GradingReferenceService } from '../src/grading/grading-reference.service';
import { execResult } from '../src/grading/investigator/testing/fake-sandbox';
import { fakeSandbox } from '../src/grading/investigator/testing/fake-sandbox';
import { INVESTIGATOR_DEPS, InvestigatorDeps } from '../src/grading/pipeline/investigator-deps';
import { SandboxPort } from '../src/grading/investigator/tools';
import { TestRunStore } from '../src/grading/test-bundle/test-run.store';
import { StorageService } from '../src/storage/storage.service';
import { createTestAccount } from './helpers/create-account';
import { upcomingSessionWindow } from './helpers/session-window';

/**
 * G2b-R Task 1 — chạy thử đáp án mẫu của giảng viên trên MỘT phiên bản gói test: một ca hoặc mọi ca đang dùng.
 *
 * Sandbox là `FakeSandbox` (không có worker thật ở đây). Điều test này khoá:
 * - chạy thử KHÔNG đổi duyệt, ghim, `ruler_trust` (chạy khớp chỉ chứng tỏ nhất quán, không chứng tỏ đúng);
 * - mã đáp án KHÔNG đi qua HTTP: server đọc từ kho bằng cột nguồn của A2b;
 * - ca đã bỏ không vào job; bấm hai lần không chạy song song.
 */
describe('G2b-R — chạy thử đáp án mẫu với gói test (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let storage: StorageService;
  let references: GradingReferenceService;
  const deps: InvestigatorDeps = { models: [], sandbox: null, challengers: [], caseLenses: [], ceilingOf: () => 1, close: async () => undefined };

  let teacherId: string;
  let teacherToken: string;
  let otherToken: string;
  let classId: string;

  const PASSWORD = 'correct-horse-battery';
  const stamp = Date.now();
  const CODE = '#include <iostream>\nint main() { std::cout << "ok"; }\n';
  const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
  const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

  async function makeTeacher(prefix: string) {
    const email = `${prefix}_${stamp}_${Math.random().toString(36).slice(2, 7)}@example.com`;
    const id = await createTestAccount(ds, { email, password: PASSWORD, role: 'teacher' });
    const login = await request(app.getHttpServer()).post('/auth/login').send({ email, password: PASSWORD });
    return { id, token: login.body.accessToken as string };
  }

  async function makeSession(language: string): Promise<string> {
    const window = upcomingSessionWindow();
    const created = await request(app.getHttpServer())
      .post('/exam-sessions')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        name: `Phiên chạy thử ${Math.random().toString(36).slice(2, 7)}`,
        classId,
        roomName: `Phòng ${Math.random().toString(36).slice(2, 8)}`,
        semesterName: 'HK kiểm thử',
        examType: 'TK',
        startTime: window.startTime,
        endTime: window.endTime,
        requiredFilenames: [{ filename: `bai.${language === 'python' ? 'py' : language === 'java' ? 'java' : 'cpp'}`, deliverableType: 'code_project', language }],
      });
    expect(created.status).toBe(201);
    return created.body.id as string;
  }

  const CASES = [
    { caseKey: 'cb1', group: 'co_ban', input: '3\n1 2 3\n', expectedOutput: '3 2 1\n' },
    { caseKey: 'bi1', group: 'bien', input: '1\n7\n', expectedOutput: '7\n' },
  ];

  async function makeBundle(sessionId: string, cases = CASES): Promise<string> {
    const res = await request(app.getHttpServer())
      .post(`/exam-sessions/${sessionId}/test-bundles`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ cases });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  /** Đặt mã đáp án như đường gắn đề (A2b): object theo băm trên kho, cột nguồn trỏ tới nó. */
  async function giveSource(sessionId: string, code = CODE, ext = 'cpp') {
    const key = `grading-reference/${sessionId}/source-${sha(code)}.${ext}`;
    await storage.putObject(key, Buffer.from(code, 'utf8'), 'text/plain; charset=utf-8');
    const entity = await ds.getRepository(ExamSessionEntity).findOneByOrFail({ id: sessionId });
    await references.upsert(entity, { modelAnswerNote: 'Đáp án mẫu' }, teacherId, 'teacher', true, { key, sha256: sha(code) });
  }

  async function prepare(language = 'cpp') {
    const sessionId = await makeSession(language);
    const bundleId = await makeBundle(sessionId);
    await giveSource(sessionId, CODE, language === 'python' ? 'py' : 'cpp');
    return { sessionId, bundleId };
  }

  function run(sessionId: string, bundleId: string, body: object = {}, token = teacherToken) {
    return request(app.getHttpServer())
      .post(`/exam-sessions/${sessionId}/test-bundles/${bundleId}/runs`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  }

  async function runRows(sessionId: string) {
    return ds.query(
      `SELECT id, kind, case_key, status, test_bundle_id, source_sha256, requested_by, finished_at, host, cases
         FROM examcollect.grading_test_run WHERE exam_session_id = $1 ORDER BY requested_at`,
      [sessionId],
    );
  }

  const passAll = () => fakeSandbox((req) => execResult(req.cases.map((c) => ({ name: c.name, group: c.group, status: 'pass' }))));

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(INVESTIGATOR_DEPS).useValue(deps).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();
    ds = app.get(DataSource);
    storage = app.get(StorageService);
    references = app.get(GradingReferenceService);

    const teacher = await makeTeacher('run_gv');
    teacherId = teacher.id;
    teacherToken = teacher.token;
    otherToken = (await makeTeacher('run_gv_khac')).token;
    const [klass] = await ds.query(
      `INSERT INTO examcollect.class (course_name, name, teacher_id) VALUES ($1, $2, $3) RETURNING id`,
      ['CTDL&GT chạy thử', `Nhóm ${stamp}`, teacherId],
    );
    classId = klass.id;
  });

  afterEach(() => {
    deps.sandbox = null;
  });

  afterAll(async () => {
    await app.close();
  });

  it('chạy toàn bộ ca: một dòng grading_test_run, trạng thái theo kết quả sandbox, mã đọc từ kho', async () => {
    const { sessionId, bundleId } = await prepare();
    const sandbox = passAll();
    deps.sandbox = sandbox;

    const res = await run(sessionId, bundleId);

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('pass');
    expect(res.body.cases.map((c: { name: string; status: string }) => [c.name, c.status])).toEqual([['bi1', 'pass'], ['cb1', 'pass']]);
    expect(typeof res.body.runId).toBe('string');

    // Job gửi đi: mã nguồn nguyên văn từ kho, expected là output của gói, không driver, không entry (cpp).
    expect(sandbox.requests).toHaveLength(1);
    const req = sandbox.requests[0];
    expect(req.language).toBe('cpp');
    expect(req.program.files).toEqual([{ path: 'main.cpp', ref: { kind: 'inline', content: CODE } }]);
    expect(req.program.driver).toBeNull();
    expect(req.program.entry).toBeNull();
    const byName = new Map(req.cases.map((c) => [c.name, c]));
    expect(byName.get('cb1')?.expected).toEqual({ kind: 'inline', content: '3 2 1\n' });
    expect(byName.get('cb1')?.stdin).toEqual({ kind: 'inline', content: '3\n1 2 3\n' });

    const rows = await runRows(sessionId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'test_run', case_key: null, status: 'pass', test_bundle_id: bundleId, source_sha256: sha(CODE), requested_by: teacherId });
    expect(rows[0].finished_at).not.toBeNull();
    expect(rows[0].host).not.toBeNull();
    expect(rows[0].cases).toHaveLength(2);
  });

  it('chạy một ca: chỉ ca đó vào job, dòng ghi caseKey', async () => {
    const { sessionId, bundleId } = await prepare();
    const sandbox = passAll();
    deps.sandbox = sandbox;

    const res = await run(sessionId, bundleId, { caseKey: 'bi1' });

    expect(res.status).toBe(201);
    expect(sandbox.requests[0].cases.map((c) => c.name)).toEqual(['bi1']);
    expect(res.body.cases.map((c: { name: string }) => c.name)).toEqual(['bi1']);
    expect((await runRows(sessionId))[0]).toMatchObject({ case_key: 'bi1', status: 'pass' });
  });

  it('caseKey không có trong gói → 404, không ghi dòng nào', async () => {
    const { sessionId, bundleId } = await prepare();
    deps.sandbox = passAll();
    expect((await run(sessionId, bundleId, { caseKey: 'khong-co' })).status).toBe(404);
    expect(await runRows(sessionId)).toHaveLength(0);
  });

  it('ca bị bỏ tự động không vào job, và chạy đúng ca đó thì 409', async () => {
    const { sessionId } = await prepare();
    // Gói phiên bản 2 có một ca bị hệ thống tự bỏ: dựng thẳng bằng SQL vì route tạo không nhận `auto_dropped_reason`.
    const [problem] = await ds.query(`SELECT id FROM examcollect.exam_problem WHERE exam_session_id = $1 AND ordinal = 1`, [sessionId]);
    const [bundle] = await ds.query(
      `INSERT INTO examcollect.grading_test_bundle (exam_session_id, version, origin, created_by, problem_id)
       VALUES ($1, 2, 'generated', $2, $3) RETURNING id`,
      [sessionId, teacherId, problem.id],
    );
    for (const [key, dropped] of [['dung', null], ['bi-bo', 'không trích được đề']] as const) {
      await ds.query(
        `INSERT INTO examcollect.grading_test_case (bundle_id, case_key, "group", input, expected_output, auto_dropped_reason)
         VALUES ($1, $2, 'co_ban', '1\n', '1\n', $3)`,
        [bundle.id, key, dropped],
      );
    }
    const sandbox = passAll();
    deps.sandbox = sandbox;

    const all = await run(sessionId, bundle.id);
    expect(all.status).toBe(201);
    expect(sandbox.requests[0].cases.map((c) => c.name)).toEqual(['dung']);

    const dropped = await run(sessionId, bundle.id, { caseKey: 'bi-bo' });
    expect(dropped.status).toBe(409);
    expect(dropped.body.message).toMatch(/bỏ/);
  });

  it('không có mã đáp án → 409 nói rõ phải tải mã lên, không ghi dòng nào', async () => {
    const sessionId = await makeSession('cpp');
    const bundleId = await makeBundle(sessionId);
    deps.sandbox = passAll();

    const res = await run(sessionId, bundleId);

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/chưa có mã đáp án/);
    expect(await runRows(sessionId)).toHaveLength(0);
  });

  it('một lượt SINH gói đang chạy → chạy thử bị 409 và thông điệp nói đúng việc đang chạy (đang sinh), không nói "chạy thử"', async () => {
    const { sessionId, bundleId } = await prepare();
    deps.sandbox = passAll();
    await app.get(TestRunStore).begin({ sessionId, problemId: null, bundleId: null, kind: 'generate_statement', caseKey: null, sourceSha256: null, teacherId });

    const res = await run(sessionId, bundleId);

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/đang sinh/);
  });

  it('hai lượt chạy liên tiếp khi lượt đầu còn running → 409 "đang chạy", không chạy song song', async () => {
    const { sessionId, bundleId } = await prepare();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let entered = 0;
    const slow: SandboxPort = {
      async exec(req) {
        entered += 1;
        await gate;
        return execResult(req.cases.map((c) => ({ name: c.name, group: c.group, status: 'pass' })));
      },
    };
    deps.sandbox = slow;

    const first = run(sessionId, bundleId).then((r) => r);
    for (let i = 0; i < 100 && entered === 0; i++) await pause(50);
    expect(entered).toBe(1);

    const second = await run(sessionId, bundleId);
    expect(second.status).toBe(409);
    expect(second.body.message).toMatch(/đang chạy/);

    release();
    expect((await first).status).toBe(201);
    expect(entered).toBe(1);
    expect(await runRows(sessionId)).toHaveLength(1);
  });

  it('dòng running quá 15 phút được coi là đã chết: lượt mới chạy được, dòng cũ thành aborted', async () => {
    const { sessionId, bundleId } = await prepare();
    const [problem] = await ds.query(`SELECT id FROM examcollect.exam_problem WHERE exam_session_id = $1 AND ordinal = 1`, [sessionId]);
    await ds.query(
      `INSERT INTO examcollect.grading_test_run (exam_session_id, problem_id, test_bundle_id, kind, requested_by, requested_at, status)
       VALUES ($1, $2, $3, 'test_run', $4, now() - interval '20 minutes', 'running')`,
      [sessionId, problem.id, bundleId, teacherId],
    );
    deps.sandbox = passAll();

    expect((await run(sessionId, bundleId)).status).toBe(201);

    const statuses = (await runRows(sessionId)).map((r: { status: string }) => r.status).sort();
    expect(statuses).toEqual(['aborted', 'pass']);
  });

  it('gói của phiên khác → 404', async () => {
    const a = await prepare();
    const b = await prepare();
    deps.sandbox = passAll();
    expect((await run(b.sessionId, a.bundleId)).status).toBe(404);
    expect(await runRows(b.sessionId)).toHaveLength(0);
  });

  it('giảng viên khác nhận 403', async () => {
    const { sessionId, bundleId } = await prepare();
    deps.sandbox = passAll();
    expect((await run(sessionId, bundleId, {}, otherToken)).status).toBe(403);
  });

  it('chạy không đổi approved_at, ghim, ruler_trust và cờ chưa kiểm chứng', async () => {
    const { sessionId, bundleId } = await prepare();
    await request(app.getHttpServer()).post(`/exam-sessions/${sessionId}/test-bundles/${bundleId}/approve`).set('Authorization', `Bearer ${teacherToken}`);
    await request(app.getHttpServer()).post(`/exam-sessions/${sessionId}/test-bundles/${bundleId}/pin`).set('Authorization', `Bearer ${teacherToken}`);
    const snapshot = async () => {
      const [b] = await ds.query(`SELECT approved_by, approved_at FROM examcollect.grading_test_bundle WHERE id = $1`, [bundleId]);
      const [s] = await ds.query(`SELECT test_bundle_id FROM examcollect.exam_session WHERE id = $1`, [sessionId]);
      const [r] = await ds.query(`SELECT ruler_trust, model_answer_unverified, model_answer_origin FROM examcollect.grading_reference WHERE exam_session_id = $1`, [sessionId]);
      return { b, s, r };
    };
    const before = await snapshot();
    expect(before.s.test_bundle_id).toBe(bundleId);
    deps.sandbox = passAll();

    expect((await run(sessionId, bundleId)).status).toBe(201);

    expect(await snapshot()).toEqual(before);
  });

  it('một ca cho output vượt giới hạn → ca ghi output_limit, cả lượt vẫn hoàn tất (không 500)', async () => {
    const { sessionId, bundleId } = await prepare();
    deps.sandbox = fakeSandbox((req) =>
      execResult(req.cases.map((c) => (c.name === 'bi1' ? { name: c.name, group: c.group, status: 'output_limit', limitsHit: ['output'] } : { name: c.name, group: c.group, status: 'pass' }))),
    );

    const res = await run(sessionId, bundleId);

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('fail');
    expect(res.body.cases.find((c: { name: string }) => c.name === 'bi1').status).toBe('output_limit');
    expect((await runRows(sessionId))[0].status).toBe('fail');
  });

  it('ca lệch: trả diff đã cắt còn 200 ký tự và không lưu stdout', async () => {
    const { sessionId, bundleId } = await prepare();
    deps.sandbox = fakeSandbox((req) =>
      execResult(req.cases.map((c) => ({ name: c.name, group: c.group, status: 'fail', diff: 'x'.repeat(900), stdout: 'bí mật của sandbox' }))),
    );

    const res = await run(sessionId, bundleId);

    expect(res.body.status).toBe('fail');
    for (const c of res.body.cases) expect(c.diff).toHaveLength(200);
    const stored = JSON.stringify((await runRows(sessionId))[0].cases);
    expect(stored).not.toContain('bí mật của sandbox');
  });

  it('đáp án không biên dịch → status compile_error kèm log, mọi ca không chạy', async () => {
    const { sessionId, bundleId } = await prepare();
    deps.sandbox = fakeSandbox(() => execResult([], { compile: { ok: false, log: 'main.cpp:1: error: expected ;', ms: 4 } }));

    const res = await run(sessionId, bundleId);

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('compile_error');
    expect(res.body.compileLog).toContain('expected ;');
    expect((await runRows(sessionId))[0].status).toBe('compile_error');
  });

  it('sandbox không phản hồi → 503 và dòng chuyển unavailable', async () => {
    const { sessionId, bundleId } = await prepare();
    deps.sandbox = fakeSandbox(() => execResult([], { unavailable: 'worker không nhận job', host: null, compile: null }));

    const res = await run(sessionId, bundleId);

    expect(res.status).toBe(503);
    expect((await runRows(sessionId))[0].status).toBe('unavailable');
  });

  it('cổng sandbox null (thiếu SANDBOX_REDIS_URL) → 503 ngay, không ghi dòng nào', async () => {
    const { sessionId, bundleId } = await prepare();
    deps.sandbox = null;
    expect((await run(sessionId, bundleId)).status).toBe(503);
    expect(await runRows(sessionId)).toHaveLength(0);
  });

  it('python: chương trình vào bằng entry main.py, không driver', async () => {
    const { sessionId, bundleId } = await prepare('python');
    const sandbox = passAll();
    deps.sandbox = sandbox;

    expect((await run(sessionId, bundleId)).status).toBe(201);

    expect(sandbox.requests[0].language).toBe('python');
    expect(sandbox.requests[0].program.files[0].path).toBe('main.py');
    expect(sandbox.requests[0].program.entry).toBe('main.py');
    expect(sandbox.requests[0].program.driver).toBeNull();
  });

  it('DB: dòng đã kết thúc không UPDATE lại được và không xoá được (trigger guard)', async () => {
    const { sessionId, bundleId } = await prepare();
    deps.sandbox = passAll();
    const res = await run(sessionId, bundleId);
    expect(res.status).toBe(201);

    await expect(ds.query(`UPDATE examcollect.grading_test_run SET status = 'fail' WHERE id = $1`, [res.body.runId])).rejects.toThrow(
      /chỉ ghi được việc kết thúc/,
    );
    await expect(ds.query(`DELETE FROM examcollect.grading_test_run WHERE id = $1`, [res.body.runId])).rejects.toThrow();
    expect((await runRows(sessionId))[0].status).toBe('pass');
  });

  it('DB: một phiên không có hai dòng running cùng lúc (unique index từng phần)', async () => {
    const { sessionId, bundleId } = await prepare();
    const insertRunning = () =>
      ds.query(
        `INSERT INTO examcollect.grading_test_run (exam_session_id, test_bundle_id, kind, requested_by, status)
         VALUES ($1, $2, 'test_run', $3, 'running')`,
        [sessionId, bundleId, teacherId],
      );
    await insertRunning();
    await expect(insertRunning()).rejects.toThrow(/uq_grading_test_run_one_running/);
  });

  it('ngôn ngữ ngoài cpp và python → 400, không ghi dòng nào', async () => {
    const sessionId = await makeSession('java');
    const bundleId = await makeBundle(sessionId);
    await giveSource(sessionId, 'class A {}', 'cpp');
    deps.sandbox = passAll();

    expect((await run(sessionId, bundleId)).status).toBe(400);
    expect(await runRows(sessionId)).toHaveLength(0);
  });
});

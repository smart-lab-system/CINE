import { createHash } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { BadGatewayException, INestApplication, UnprocessableEntityException, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { RulerProposal } from '../src/exam-authoring/ruler/ruler-core';
import { RULER_PROVIDER, RulerOutcome, RulerProviderFailure, RulerRequest } from '../src/exam-authoring/ruler/ruler-provider';
import { ExamSessionEntity } from '../src/exam-session/entities/exam-session.entity';
import { GradingReferenceService } from '../src/grading/grading-reference.service';
import { execResult, fakeSandbox } from '../src/grading/investigator/testing/fake-sandbox';
import { INVESTIGATOR_DEPS, InvestigatorDeps } from '../src/grading/pipeline/investigator-deps';
import { TestRunStore } from '../src/grading/test-bundle/test-run.store';
import { StorageService } from '../src/storage/storage.service';
import { createTestAccount } from './helpers/create-account';
import { upcomingSessionWindow } from './helpers/session-window';

/**
 * G2b-R Task 3 — sinh đáp án mẫu và gói test từ đề, và sinh gói từ mã đáp án của giảng viên.
 *
 * Model (RULER_PROVIDER) và sandbox đều là bản giả có kịch bản. Điều spec này khoá (spec G2b §3, §4.4–4.9):
 * - output mong đợi CHỈ đến từ stdout của sandbox, không từ văn bản của model;
 * - ca không chứng minh được nó nằm trong đề, hay không chạy ổn định, bị bỏ trước khi giảng viên thấy — có lý do;
 * - mọi cổng kiểm (worker, ngôn ngữ, đáp án giảng viên, đang sinh, đã chấm, hạn mức) chặn TRƯỚC khi gọi model;
 * - lệch ví dụ trong đề hay mã không biên dịch → 422 và KHÔNG ghi gói hay đáp án nào;
 * - không nút nào duyệt hay ghim; mỗi lượt để lại đúng một dòng `grading_test_run` và (khi có token) một dòng `ai_usage`.
 */
describe('G2b-R — sinh đáp án và gói test (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let storage: StorageService;
  let references: GradingReferenceService;
  const deps: InvestigatorDeps = { models: [], sandbox: null, challengers: [], caseLenses: [], ceilingOf: () => 1, close: async () => undefined };

  interface Who {
    id: string;
    token: string;
    classId: string;
  }
  let a: Who; // nhóm sinh từ đề
  let b: Who; // nhóm cổng kiểm
  let c: Who; // nhóm sinh từ đáp án, lỗi model, kế toán
  let d: Who; // thay đáp án cũ, sinh lại, mã quá lớn (mỗi giảng viên chỉ có 20 lượt/10 phút, nên không dồn hết vào một người)
  let quotaWho: Who; // riêng cho test hạn mức: đã dùng hết lượt trong ngày

  const PASSWORD = 'correct-horse-battery';
  const stamp = Date.now();
  let counter = 0;
  const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

  const STATEMENT = [
    'Bài 1. Đảo ngược dãy số.',
    'Cho số nguyên n và dãy gồm n số nguyên. In dãy theo thứ tự ngược lại, cách nhau một dấu cách.',
    'Ràng buộc: 1 ≤ n ≤ 100000.',
    'Ví dụ 1:',
    'Input',
    '2',
    '5 6',
    'Output',
    '6 5',
  ].join('\n');
  const Q_FORMAT = 'In dãy theo thứ tự ngược lại, cách nhau một dấu cách';
  const Q_LIMIT = 'Ràng buộc: 1 ≤ n ≤ 100000';
  const Q_EXAMPLE = 'Input\n2\n5 6\nOutput\n6 5';
  const EX_INPUT = '2\n5 6\n';
  const MODEL_CODE = '#include <bits/stdc++.h>\nint main() { /* do model viết */ }\n';
  const TEACHER_CODE = '#include <iostream>\nint main() { /* do giảng viên viết */ }\n';
  const LARGE_INPUT = `1000\n${Array.from({ length: 1000 }, (_, i) => i).join(' ')}\n`;

  /** Đảo dòng số thứ hai — "đáp án đúng" của đề mẫu. */
  const reverse = (input: string) => {
    const [, line = ''] = input.split('\n');
    return `${line.split(' ').filter(Boolean).reverse().join(' ')}\n`;
  };

  function proposal(over: Partial<RulerProposal> = {}): RulerProposal {
    return {
      modelAnswer: MODEL_CODE,
      examples: [{ input: EX_INPUT, output: '6 5\n', quote: Q_EXAMPLE }],
      cases: [
        { name: 'co ban', group: 'Cơ bản', input: '3\n1 2 3\n', quote: Q_FORMAT, answerIsUnique: true },
        { name: 'bien n=1', group: 'bien', input: '1\n7\n', quote: Q_LIMIT, answerIsUnique: true },
        { name: 'lon', group: 'lon', input: LARGE_INPUT, quote: Q_LIMIT, answerIsUnique: true },
        { name: 'am', group: 'co_ban', input: '2\n-1 -2\n', quote: Q_FORMAT, answerIsUnique: true },
        { name: 'lap', group: 'co_ban', input: '3\n4 4 4\n', quote: Q_FORMAT, answerIsUnique: true },
      ],
      ...over,
    };
  }

  const outcome = (p: RulerProposal, over: Partial<RulerOutcome> = {}): RulerOutcome => ({
    proposal: p,
    usage: { modelUsed: 'fake-ruler-model', inputTokens: 1_200, outputTokens: 800 },
    promptVersion: 'pv-test',
    ...over,
  });

  /** Model giả: ghi lại mọi lời gọi (số lần gọi là thứ nhiều test khẳng định bằng 0). */
  const provider = {
    name: 'fake-ruler',
    calls: [] as RulerRequest[],
    next: (async () => outcome(proposal())) as () => Promise<RulerOutcome>,
    async propose(req: RulerRequest) {
      this.calls.push(req);
      return this.next();
    },
  };

  type CaseOut = Partial<ReturnType<typeof execResult>['cases'][number]>;

  /** Sandbox giả: preflight trả `ran`; còn lại chạy "đáp án đảo dãy", mỗi test chỉnh được từng ca theo input. */
  function reverseSandbox(tweak: (input: string, run: number) => CaseOut | undefined = () => undefined) {
    let run = 0;
    const sandbox = fakeSandbox((req) => {
      if (req.cases[0]?.name === 'preflight') return execResult([{ name: 'preflight', status: 'ran', stdout: '' }]);
      run += 1;
      return execResult(
        req.cases.map((cs) => {
          const input = cs.stdin.kind === 'inline' ? cs.stdin.content : '';
          return { name: cs.name, group: cs.group, status: 'ran', stdout: reverse(input), ...tweak(input, run) };
        }),
      );
    });
    return sandbox;
  }
  const workRequests = (sandbox: ReturnType<typeof reverseSandbox>) => sandbox.requests.filter((r) => r.cases[0]?.name !== 'preflight');

  async function makeWho(prefix: string): Promise<Who> {
    const email = `${prefix}_${stamp}_${Math.random().toString(36).slice(2, 7)}@example.com`;
    const id = await createTestAccount(ds, { email, password: PASSWORD, role: 'teacher' });
    const login = await request(app.getHttpServer()).post('/auth/login').send({ email, password: PASSWORD });
    const [klass] = await ds.query(`INSERT INTO examcollect.class (course_name, name, teacher_id) VALUES ($1, $2, $3) RETURNING id`, [
      'CTDL&GT sinh thước',
      `Nhóm ${prefix} ${stamp}`,
      id,
    ]);
    return { id, token: login.body.accessToken as string, classId: klass.id as string };
  }

  async function makeSession(who: Who, language = 'cpp'): Promise<string> {
    counter += 1;
    const window = upcomingSessionWindow();
    const ext = language === 'python' ? 'py' : language === 'java' ? 'java' : language === 'node' ? 'js' : 'cpp';
    const created = await request(app.getHttpServer())
      .post('/exam-sessions')
      .set('Authorization', `Bearer ${who.token}`)
      .send({
        name: `Phiên sinh thước ${counter}`,
        classId: who.classId,
        roomName: `Phòng ST ${counter} ${Math.random().toString(36).slice(2, 6)}`,
        semesterName: 'HK kiểm thử',
        examType: 'TK',
        startTime: window.startTime,
        endTime: window.endTime,
        requiredFilenames: [{ filename: `bai.${ext}`, deliverableType: 'code_project', language }],
      });
    expect(created.status).toBe(201);
    return created.body.id as string;
  }

  const entityOf = (sessionId: string) => ds.getRepository(ExamSessionEntity).findOneByOrFail({ id: sessionId });

  /** Đề dạng văn bản: dòng `exam_material` + object trên kho + `grading_reference` trỏ vào nó. */
  async function giveStatement(who: Who, sessionId: string, text = STATEMENT, fileName = 'DeThi.txt') {
    const key = `materials/${sessionId}/de-thi-${counter}`;
    await storage.putObject(key, Buffer.from(text, 'utf8'), 'text/plain; charset=utf-8');
    const [material] = await ds.query(
      `INSERT INTO examcollect.exam_material (exam_session_id, storage_key, file_name, file_size) VALUES ($1, $2, $3, $4) RETURNING id`,
      [sessionId, key, fileName, Buffer.byteLength(text)],
    );
    await references.upsert(await entityOf(sessionId), { questionMaterialId: material.id }, who.id);
  }

  async function giveSource(who: Who, sessionId: string, code: string, origin: 'teacher' | 'authoring' | 'generated') {
    const key = `grading-reference/${sessionId}/source-${sha(code)}.cpp`;
    await storage.putObject(key, Buffer.from(code, 'utf8'), 'text/plain; charset=utf-8');
    await references.upsert(await entityOf(sessionId), { modelAnswerNote: 'Đáp án mẫu' }, who.id, origin, true, { key, sha256: sha(code) });
  }

  async function prepare(who: Who, language = 'cpp') {
    const sessionId = await makeSession(who, language);
    await giveStatement(who, sessionId);
    return sessionId;
  }

  const post = (who: Who, sessionId: string, mode: 'statement' | 'answer', token = who.token) =>
    request(app.getHttpServer()).post(`/exam-sessions/${sessionId}/test-bundles/generate-from-${mode}`).set('Authorization', `Bearer ${token}`).send({});

  const bundlesOf = (sessionId: string) =>
    ds.query(`SELECT id, version, origin, approved_at, created_by FROM examcollect.grading_test_bundle WHERE exam_session_id = $1 ORDER BY version`, [sessionId]);
  const casesOf = (bundleId: string) =>
    ds.query(
      `SELECT case_key, "group", input, expected_output, constraint_quote, auto_dropped_reason
         FROM examcollect.grading_test_case WHERE bundle_id = $1 ORDER BY case_key`,
      [bundleId],
    );
  const referenceOf = async (sessionId: string) => {
    const [row] = await ds.query(
      `SELECT model_answer_origin, model_answer_unverified, ruler_trust, model_answer_source_key, model_answer_source_sha256,
              model_answer_note, model_answer_storage_key, model_answer_filename
         FROM examcollect.grading_reference WHERE exam_session_id = $1`,
      [sessionId],
    );
    return row as Record<string, unknown> | undefined;
  };
  const runsOf = (sessionId: string) =>
    ds.query(
      `SELECT id, kind, status, test_bundle_id, source_sha256, prompt_version, model_used, tokens_in, tokens_out, cost_usd, finished_at
         FROM examcollect.grading_test_run WHERE exam_session_id = $1 ORDER BY requested_at`,
      [sessionId],
    );
  const usageOf = (teacherId: string) =>
    ds.query(`SELECT feature, model_used, input_tokens, output_tokens, cost_usd FROM examcollect.ai_usage WHERE teacher_id = $1 ORDER BY created_at`, [teacherId]);
  const pinnedOf = async (sessionId: string) => {
    const [row] = await ds.query(
      `SELECT es.test_bundle_id AS session_pin, p.test_bundle_id AS problem_pin
         FROM examcollect.exam_session es LEFT JOIN examcollect.exam_problem p ON p.exam_session_id = es.id AND p.ordinal = 1
        WHERE es.id = $1`,
      [sessionId],
    );
    return row as { session_pin: string | null; problem_pin: string | null };
  };

  /** Một dòng `grading_result` đang chấm: kích hoạt luật khoá chấm. */
  async function lockSession(who: Who, sessionId: string) {
    const [deliverable] = await ds.query(`SELECT id FROM examcollect.required_deliverable WHERE exam_session_id = $1 LIMIT 1`, [sessionId]);
    counter += 1;
    const [submission] = await ds.query(
      `INSERT INTO examcollect.submission
         (exam_session_id, required_deliverable_id, student_mssv, student_name_input, home_class_id, home_teacher_id, status)
       VALUES ($1, $2, $3, 'SV', $4, $5, 'received') RETURNING id`,
      [sessionId, deliverable.id, `ST${counter}${Date.now() % 100000}`.slice(0, 20), who.classId, who.id],
    );
    for (const next of ['validated', 'collected']) {
      await ds.query(`UPDATE examcollect.submission SET status = $1 WHERE id = $2`, [next, submission.id]);
    }
    const [rubric] = await ds.query(`INSERT INTO examcollect.rubric (version, teacher_id, name) VALUES ($1, $2, $3) RETURNING id`, [
      counter,
      who.id,
      `Rubric ST ${stamp} ${counter}`,
    ]);
    await ds.query(
      `INSERT INTO examcollect.grading_result (submission_id, rubric_id_version, grading_triggered_by, status) VALUES ($1, $2, $3, 'ai_grading')`,
      [submission.id, rubric.id, who.id],
    );
  }

  async function expectNothingWritten(sessionId: string) {
    expect(await bundlesOf(sessionId)).toHaveLength(0);
    const ref = await referenceOf(sessionId);
    expect(ref?.model_answer_source_key ?? null).toBeNull();
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(INVESTIGATOR_DEPS)
      .useValue(deps)
      .overrideProvider(RULER_PROVIDER)
      .useValue(provider)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();
    ds = app.get(DataSource);
    storage = app.get(StorageService);
    references = app.get(GradingReferenceService);
    a = await makeWho('rg_a');
    b = await makeWho('rg_b');
    c = await makeWho('rg_c');
    d = await makeWho('rg_d');
    quotaWho = await makeWho('rg_quota');
  });

  beforeEach(() => {
    provider.calls.length = 0;
    provider.next = async () => outcome(proposal());
    deps.sandbox = reverseSandbox();
    deps.priceOf = undefined;
  });

  afterAll(async () => {
    deps.sandbox = null;
    await app.close();
  });

  describe('sinh từ đề', () => {
    it('đề có ví dụ và đáp án tái tạo đúng → gói chưa duyệt, chưa ghim, thước verified, mã lưu theo băm', async () => {
      const sessionId = await prepare(a);

      const res = await post(a, sessionId, 'statement');

      expect(res.status).toBe(201);
      expect(res.body.testBundle).toMatchObject({ version: 1, caseCount: 5, droppedCount: 0 });
      expect(res.body.ruler).toEqual({ trust: 'verified', examplesChecked: 1 });
      expect(res.body.run.status).toBe('pass');
      expect(res.body.warnings).toEqual([]);

      const [bundle] = await bundlesOf(sessionId);
      expect(bundle).toMatchObject({ id: res.body.testBundle.id, origin: 'generated', approved_at: null, created_by: a.id });
      expect(await pinnedOf(sessionId)).toEqual({ session_pin: null, problem_pin: null });

      const ref = await referenceOf(sessionId);
      expect(ref).toMatchObject({
        model_answer_origin: 'generated',
        model_answer_unverified: false,
        ruler_trust: 'verified',
        model_answer_source_sha256: sha(MODEL_CODE),
        model_answer_source_key: `grading-reference/${sessionId}/source-${sha(MODEL_CODE)}.cpp`,
      });
      expect((await storage.getObject(ref!.model_answer_source_key as string)).toString('utf8')).toBe(MODEL_CODE);

      const [run] = await runsOf(sessionId);
      expect(run).toMatchObject({ kind: 'generate_statement', status: 'pass', test_bundle_id: bundle.id, source_sha256: sha(MODEL_CODE) });
      expect(run.finished_at).not.toBeNull();
    });

    it('expected_output bằng stdout của sandbox, KHÔNG bằng văn bản của model', async () => {
      const sessionId = await prepare(a);
      const SANDBOX_SAYS = 'ĐẦU RA THẬT CỦA SANDBOX\n';
      deps.sandbox = reverseSandbox((input) => (input === '3\n1 2 3\n' ? { stdout: SANDBOX_SAYS } : undefined));

      const res = await post(a, sessionId, 'statement');

      expect(res.status).toBe(201);
      const cases = await casesOf(res.body.testBundle.id);
      expect(cases.find((x: { case_key: string }) => x.case_key === 'co-ban').expected_output).toBe(SANDBOX_SAYS);
      // Mọi ca còn lại cũng là stdout của sandbox ("đảo dãy"), và model không có chỗ nào đưa output vào ca.
      expect(cases.find((x: { case_key: string }) => x.case_key === 'bien-n-1').expected_output).toBe('7\n');
      // Mỗi ca mang câu trích của nó để giảng viên đối chiếu.
      expect(cases.find((x: { case_key: string }) => x.case_key === 'co-ban').constraint_quote).toBe(Q_FORMAT);
    });

    it('chạy đáp án hai lần trên cùng một job gồm ca và ví dụ (ví dụ chung job với ca)', async () => {
      const sessionId = await prepare(a);
      const sandbox = reverseSandbox();
      deps.sandbox = sandbox;

      await post(a, sessionId, 'statement').expect(201);

      const work = workRequests(sandbox);
      expect(work).toHaveLength(2);
      expect(work[0].cases).toHaveLength(6); // 5 ca + 1 ví dụ
      expect(work[1].cases.map((x) => x.name)).toEqual(work[0].cases.map((x) => x.name));
      // Output mong đợi KHÔNG đi vào job: đây là công cụ `run`, không so sánh.
      expect(work[0].cases.every((x) => x.expected === null)).toBe(true);
      // Mã chạy là mã model viết, nguyên văn.
      expect(work[0].program.files[0].ref).toEqual({ kind: 'inline', content: MODEL_CODE });
    });

    it('đề không có ví dụ → thước unverified, cờ chưa kiểm chứng bật', async () => {
      const sessionId = await prepare(a);
      provider.next = async () => outcome(proposal({ examples: [] }));

      const res = await post(a, sessionId, 'statement');

      expect(res.status).toBe(201);
      expect(res.body.ruler).toEqual({ trust: 'unverified', examplesChecked: 0 });
      expect(await referenceOf(sessionId)).toMatchObject({ model_answer_unverified: true, ruler_trust: 'unverified', model_answer_origin: 'generated' });
    });

    it('ví dụ BỊA: đề không có ví dụ, model trích câu chung chung rồi tự viết cặp vào/ra khớp đáp án của nó → vẫn unverified', async () => {
      const sessionId = await makeSession(a);
      await giveStatement(a, sessionId, 'Cho n và dãy n số nguyên. In dãy theo thứ tự ngược lại, cách nhau một dấu cách.\nRàng buộc: 1 ≤ n ≤ 100000.');
      // Đáp án in "đảo dãy"; ví dụ bịa đòi output là chính dãy xuôi và sandbox cũng chạy ra đúng thế để khớp.
      deps.sandbox = reverseSandbox((input) => (input === EX_INPUT ? { stdout: '5 6\n' } : undefined));
      provider.next = async () => outcome(proposal({ examples: [{ input: EX_INPUT, output: '5 6\n', quote: Q_FORMAT }] }));

      const res = await post(a, sessionId, 'statement');

      expect(res.status).toBe(201);
      expect(res.body.ruler).toEqual({ trust: 'unverified', examplesChecked: 0 });
      expect(await referenceOf(sessionId)).toMatchObject({ model_answer_unverified: true, ruler_trust: 'unverified' });
    });

    it('ví dụ có quote không nằm trong đề không được tin và không tính', async () => {
      const sessionId = await prepare(a);
      provider.next = async () => outcome(proposal({ examples: [{ input: EX_INPUT, output: '6 5\n', quote: 'một câu model bịa ra, đề không có' }] }));

      const res = await post(a, sessionId, 'statement');

      expect(res.status).toBe(201);
      expect(res.body.ruler).toEqual({ trust: 'unverified', examplesChecked: 0 });
    });

    it('ca không trích được câu nào trong đề bị bỏ, có lý do, vẫn nằm trong gói với auto_dropped_reason', async () => {
      const sessionId = await prepare(a);
      const p = proposal();
      p.cases.push({ name: 'bia dat', group: 'co_ban', input: '2\n1 2\n', quote: 'đề yêu cầu in kết quả bằng số La Mã', answerIsUnique: true });
      provider.next = async () => outcome(p);

      const res = await post(a, sessionId, 'statement');

      expect(res.status).toBe(201);
      expect(res.body.testBundle).toMatchObject({ caseCount: 5, droppedCount: 1 });
      const dropped = (await casesOf(res.body.testBundle.id)).find((x: { case_key: string }) => x.case_key === 'bia-dat');
      expect(dropped.auto_dropped_reason).toMatch(/trích/);
      // Lý do không chứa nội dung input.
      expect(dropped.auto_dropped_reason).not.toContain('2\n1 2');
    });

    it('answerIsUnique=false (gói chưa có comparator) bị bỏ, có lý do', async () => {
      const sessionId = await prepare(a);
      const p = proposal();
      p.cases.push({ name: 'nhieu dap an', group: 'co_ban', input: '2\n1 2\n', quote: Q_FORMAT, answerIsUnique: false });
      provider.next = async () => outcome(p);

      const res = await post(a, sessionId, 'statement');

      expect(res.body.testBundle).toMatchObject({ caseCount: 5, droppedCount: 1 });
      const dropped = (await casesOf(res.body.testBundle.id)).find((x: { case_key: string }) => x.case_key === 'nhieu-dap-an');
      expect(dropped.auto_dropped_reason).toMatch(/không duy nhất/);
    });

    it('hai lượt chạy cho output khác nhau → ca bị bỏ với lý do nondeterministic', async () => {
      const sessionId = await prepare(a);
      deps.sandbox = reverseSandbox((input, run) => (input === '1\n7\n' && run === 2 ? { stdout: 'khác\n' } : undefined));

      const res = await post(a, sessionId, 'statement');

      expect(res.status).toBe(201);
      expect(res.body.testBundle).toMatchObject({ caseCount: 4, droppedCount: 1 });
      const dropped = (await casesOf(res.body.testBundle.id)).find((x: { case_key: string }) => x.case_key === 'bien-n-1');
      expect(dropped.auto_dropped_reason).toMatch(/nondeterministic/);
    });

    it('ca runtime_crash bị bỏ với lý do là trạng thái; các ca còn lại vẫn vào gói', async () => {
      const sessionId = await prepare(a);
      deps.sandbox = reverseSandbox((input) => (input === '3\n4 4 4\n' ? { status: 'runtime_crash', stdout: null } : undefined));

      const res = await post(a, sessionId, 'statement');

      expect(res.body.testBundle).toMatchObject({ caseCount: 4, droppedCount: 1 });
      const dropped = (await casesOf(res.body.testBundle.id)).find((x: { case_key: string }) => x.case_key === 'lap');
      expect(dropped.auto_dropped_reason).toMatch(/runtime_crash/);
    });

    it('còn dưới 5 ca → cảnh báo kèm danh sách ca bị bỏ và lý do, vẫn ghi gói', async () => {
      const sessionId = await prepare(a);
      const p = proposal();
      p.cases = p.cases.slice(0, 3);
      p.cases[0].quote = 'câu không có trong đề';
      provider.next = async () => outcome(p);

      const res = await post(a, sessionId, 'statement');

      expect(res.status).toBe(201);
      expect(res.body.testBundle.caseCount).toBe(2);
      expect(res.body.warnings.join('\n')).toMatch(/Chỉ còn 2\/3 ca/);
      expect(res.body.warnings.join('\n')).toContain('co ban');
    });

    it('ví dụ lệch với đáp án chạy thật → 422 kèm chi tiết, không ghi gói hay đáp án, dòng chạy fail', async () => {
      const sessionId = await prepare(a);
      deps.sandbox = reverseSandbox((input) => (input === EX_INPUT ? { stdout: '5 6\n' } : undefined));

      const res = await post(a, sessionId, 'statement');

      expect(res.status).toBe(422);
      expect(JSON.stringify(res.body)).toMatch(/6 5/);
      await expectNothingWritten(sessionId);
      const runs = await runsOf(sessionId);
      expect(runs).toHaveLength(1);
      expect(runs[0]).toMatchObject({ status: 'fail', test_bundle_id: null });
      // Token đã tiêu thật nên vẫn được ghi, kể cả khi không có gói.
      expect(runs[0]).toMatchObject({ model_used: 'fake-ruler-model', tokens_in: 1_200, tokens_out: 800 });
    });

    it('đáp án không biên dịch → 422, không ghi gì, dòng chạy compile_error', async () => {
      const sessionId = await prepare(a);
      deps.sandbox = fakeSandbox((req) =>
        req.cases[0]?.name === 'preflight'
          ? execResult([{ name: 'preflight', status: 'ran', stdout: '' }])
          : execResult([], { compile: { ok: false, log: 'main.cpp:1:1: error: expected unqualified-id', ms: 4 } }),
      );

      const res = await post(a, sessionId, 'statement');

      expect(res.status).toBe(422);
      expect(JSON.stringify(res.body)).toMatch(/error: expected unqualified-id/);
      await expectNothingWritten(sessionId);
      expect((await runsOf(sessionId))[0]).toMatchObject({ status: 'compile_error' });
    });

    it('sandbox mất giữa chừng (unavailable) → 503, không ghi gì, dòng chạy unavailable', async () => {
      const sessionId = await prepare(a);
      deps.sandbox = fakeSandbox((req) =>
        req.cases[0]?.name === 'preflight'
          ? execResult([{ name: 'preflight', status: 'ran', stdout: '' }])
          : execResult([], { unavailable: 'worker rớt giữa chừng' }),
      );

      const res = await post(a, sessionId, 'statement');

      expect(res.status).toBe(503);
      await expectNothingWritten(sessionId);
      expect((await runsOf(sessionId))[0]).toMatchObject({ status: 'unavailable' });
    });

    it('hết ngân sách (aborted budget) → 503, không ghi gì, dòng chạy aborted', async () => {
      const sessionId = await prepare(a);
      deps.sandbox = fakeSandbox((req) =>
        req.cases[0]?.name === 'preflight'
          ? execResult([{ name: 'preflight', status: 'ran', stdout: '' }])
          : execResult(
              req.cases.slice(0, 2).map((cs) => ({ name: cs.name, status: 'ran', stdout: 'x\n' })),
              { aborted: 'budget' },
            ),
      );

      const res = await post(a, sessionId, 'statement');

      expect(res.status).toBe(503);
      await expectNothingWritten(sessionId);
      expect((await runsOf(sessionId))[0]).toMatchObject({ status: 'aborted' });
    });

    it('mọi ca đều bị bỏ → 409, không ghi gói, dòng chạy dropped_all', async () => {
      const sessionId = await prepare(a);
      provider.next = async () =>
        outcome(
          proposal({
            cases: [{ name: 'bịa', group: 'co_ban', input: '1\n1\n', quote: 'câu hoàn toàn không có trong đề bài', answerIsUnique: true }],
          }),
        );

      const res = await post(a, sessionId, 'statement');

      expect(res.status).toBe(409);
      await expectNothingWritten(sessionId);
      expect((await runsOf(sessionId))[0]).toMatchObject({ status: 'dropped_all' });
    });

    it('đáp án cũ do hệ thống sinh (generated hay authoring) được thay; bản cũ vẫn còn trên kho', async () => {
      for (const origin of ['generated', 'authoring'] as const) {
        const sessionId = await prepare(d);
        const OLD = `int main() { /* ${origin} cũ */ }\n`;
        await giveSource(d, sessionId, OLD, origin);

        const res = await post(d, sessionId, 'statement');

        expect(res.status).toBe(201);
        const ref = await referenceOf(sessionId);
        expect(ref).toMatchObject({ model_answer_origin: 'generated', model_answer_source_sha256: sha(MODEL_CODE) });
        expect(await storage.objectExists(`grading-reference/${sessionId}/source-${sha(OLD)}.cpp`)).toBe(true);
      }
    });

    it('thay đáp án cũ của hệ thống thì thay TRỌN: ghi chú và tài liệu đáp án của lượt soạn đề không còn dưới nhãn "generated"', async () => {
      const sessionId = await prepare(d);
      await giveSource(d, sessionId, 'int main() { /* soạn đề */ }\n', 'authoring'); // kèm ghi chú "Đáp án mẫu" của soạn đề
      await ds.query(
        `UPDATE examcollect.grading_reference SET model_answer_storage_key = $2, model_answer_filename = 'dap-an-va-test.docx' WHERE exam_session_id = $1`,
        [sessionId, `grading-reference/${sessionId}/answer-key`],
      );

      const res = await post(d, sessionId, 'statement');

      expect(res.status).toBe(201);
      expect(await referenceOf(sessionId)).toMatchObject({
        model_answer_origin: 'generated',
        model_answer_note: null,
        model_answer_storage_key: null,
        model_answer_filename: null,
        model_answer_source_sha256: sha(MODEL_CODE),
      });
    });

    it('giảng viên lưu đáp án của mình TRONG LÚC đang sinh → sinh dừng bằng 409, đáp án của giảng viên còn nguyên, không ghi gói', async () => {
      const sessionId = await prepare(d);
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      provider.next = async () => {
        await gate;
        return outcome(proposal());
      };
      const pending = post(d, sessionId, 'statement').then((r) => r);
      for (let i = 0; i < 200 && provider.calls.length === 0; i++) await new Promise((r) => setTimeout(r, 25));
      expect(provider.calls).toHaveLength(1);

      await giveSource(d, sessionId, TEACHER_CODE, 'teacher');
      release();
      const res = await pending;

      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/giảng viên vừa lưu/i);
      expect(await bundlesOf(sessionId)).toHaveLength(0);
      expect(await referenceOf(sessionId)).toMatchObject({ model_answer_origin: 'teacher', model_answer_source_sha256: sha(TEACHER_CODE) });
      expect((await runsOf(sessionId))[0]).toMatchObject({ status: 'aborted' });
    });

    it('lượt chạy bị đóng (quá hạn, bị dọn) trong lúc đang sinh → KHÔNG ghi gói mồ côi: 409 và hoàn tác', async () => {
      const sessionId = await prepare(d);
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      provider.next = async () => {
        await gate;
        return outcome(proposal());
      };
      const pending = post(d, sessionId, 'statement').then((r) => r);
      for (let i = 0; i < 200 && provider.calls.length === 0; i++) await new Promise((r) => setTimeout(r, 25));
      expect(provider.calls).toHaveLength(1);
      // Giả lập lượt kế tiếp đã dọn dòng `running` quá 15 phút của lượt này (xem `TestRunStore.closeStale`).
      await ds.query(`UPDATE examcollect.grading_test_run SET status = 'aborted', finished_at = now() WHERE exam_session_id = $1 AND status = 'running'`, [sessionId]);

      release();
      const res = await pending;

      expect(res.status).toBe(409);
      expect(await bundlesOf(sessionId)).toHaveLength(0);
      expect((await referenceOf(sessionId))?.model_answer_source_key ?? null).toBeNull();
    });

    it('sinh lần hai ra phiên bản mới, không đè gói cũ và không ghim', async () => {
      const sessionId = await prepare(d);
      const first = await post(d, sessionId, 'statement');
      const second = await post(d, sessionId, 'statement');

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(second.body.testBundle.version).toBe(2);
      expect(await bundlesOf(sessionId)).toHaveLength(2);
      expect(await pinnedOf(sessionId)).toEqual({ session_pin: null, problem_pin: null });
    });

    it('mã model viết vượt 256 KiB → 422, không ghi gì, dòng chạy fail (token vẫn được ghi)', async () => {
      const sessionId = await prepare(d);
      provider.next = async () => outcome(proposal({ modelAnswer: `// ${'x'.repeat(256 * 1024)}\nint main() {}\n` }));

      const res = await post(d, sessionId, 'statement');

      expect(res.status).toBe(422);
      await expectNothingWritten(sessionId);
      expect((await runsOf(sessionId))[0]).toMatchObject({ status: 'fail', tokens_in: 1_200 });
    });
  });

  describe('cổng kiểm chặn trước khi gọi model', () => {
    it('máy chạy bài chưa khai (sandbox null) → 503, model chưa được gọi, không có dòng chạy', async () => {
      const sessionId = await prepare(b);
      deps.sandbox = null;

      const res = await post(b, sessionId, 'statement');

      expect(res.status).toBe(503);
      expect(provider.calls).toHaveLength(0);
      expect(await runsOf(sessionId)).toHaveLength(0);
      await expectNothingWritten(sessionId);
    });

    it('preflight: worker không trả lời → 503 và số lần gọi model bằng 0', async () => {
      const sessionId = await prepare(b);
      deps.sandbox = fakeSandbox(() => execResult([], { unavailable: 'worker không phản hồi' }));

      const res = await post(b, sessionId, 'statement');

      expect(res.status).toBe(503);
      expect(provider.calls).toHaveLength(0);
      expect(await runsOf(sessionId)).toHaveLength(0);
    });

    it('preflight: cổng ném lỗi → 503 chứ không 500, model chưa được gọi', async () => {
      const sessionId = await prepare(b);
      deps.sandbox = {
        async exec() {
          throw new Error('ECONNREFUSED');
        },
      };

      const res = await post(b, sessionId, 'statement');

      expect(res.status).toBe(503);
      expect(provider.calls).toHaveLength(0);
    });

    it('đáp án của giảng viên → 409 khi sinh từ đề; đáp án và gói không đổi', async () => {
      const sessionId = await prepare(b);
      await giveSource(b, sessionId, TEACHER_CODE, 'teacher');

      const res = await post(b, sessionId, 'statement');

      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/giảng viên/);
      expect(provider.calls).toHaveLength(0);
      expect(await bundlesOf(sessionId)).toHaveLength(0);
      expect(await referenceOf(sessionId)).toMatchObject({ model_answer_origin: 'teacher', model_answer_source_sha256: sha(TEACHER_CODE) });
    });

    it('đáp án giảng viên là ghi chú (không có mã) cũng là đáp án của giảng viên → 409', async () => {
      const sessionId = await prepare(b);
      await references.upsert(await entityOf(sessionId), { modelAnswerNote: 'Đáp án: dùng ngăn xếp' }, b.id);

      const res = await post(b, sessionId, 'statement');

      expect(res.status).toBe(409);
      expect(provider.calls).toHaveLength(0);
    });

    it.each(['java', 'node'])('câu khai ngôn ngữ %s → 400, model chưa được gọi', async (language) => {
      const sessionId = await prepare(b, language);

      const res = await post(b, sessionId, 'statement');

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/C\+\+|Python/);
      expect(provider.calls).toHaveLength(0);
    });

    it('bấm hai lần: đang có một lượt chạy → 409 "đang sinh", không 500, model chưa được gọi', async () => {
      const sessionId = await prepare(b);
      await app.get(TestRunStore).begin({ sessionId, problemId: null, bundleId: null, kind: 'generate_statement', caseKey: null, sourceSha256: null, teacherId: b.id });

      const res = await post(b, sessionId, 'statement');

      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/đang sinh/);
      expect(provider.calls).toHaveLength(0);
      expect(await runsOf(sessionId)).toHaveLength(1);
    });

    it('một lượt CHẠY THỬ đang chạy → sinh bị 409 và thông điệp nói đúng việc đang chạy (chạy thử), không nói "đang sinh"', async () => {
      const sessionId = await prepare(b);
      await app.get(TestRunStore).begin({ sessionId, problemId: null, bundleId: null, kind: 'test_run', caseKey: null, sourceSha256: null, teacherId: b.id });

      const res = await post(b, sessionId, 'statement');

      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/chạy thử/);
      expect(provider.calls).toHaveLength(0);
    });

    it('phiên đã có bài đang chấm → 409 ở cả hai đường sinh, model chưa được gọi', async () => {
      const sessionId = await prepare(b);
      await giveSource(b, sessionId, TEACHER_CODE, 'teacher');
      await lockSession(b, sessionId);

      expect((await post(b, sessionId, 'statement')).status).toBe(409);
      expect((await post(b, sessionId, 'answer')).status).toBe(409);
      expect(provider.calls).toHaveLength(0);
    });

    it('chưa chọn đề bài → 409; đề dạng pdf không đọc được thành chữ → 422; model chưa được gọi', async () => {
      const noStatement = await makeSession(b);
      expect((await post(b, noStatement, 'statement')).status).toBe(409);

      const pdf = await makeSession(b);
      await giveStatement(b, pdf, '%PDF-1.4 không đọc được', 'DeThi.pdf');
      expect((await post(b, pdf, 'statement')).status).toBe(422);

      expect(provider.calls).toHaveLength(0);
    });

    it('hết hạn mức trong ngày (đếm cả lượt sinh thước, không chỉ soạn đề) → 429, model chưa được gọi', async () => {
      const sessionId = await prepare(quotaWho);
      await ds.query(
        `INSERT INTO examcollect.ai_usage (teacher_id, feature, model_used, input_tokens, output_tokens, question_count, verification_status)
         SELECT $1, 'ruler_generate', 'm', 1, 1, 0, 'verified' FROM generate_series(1, 60)`,
        [quotaWho.id],
      );

      const res = await post(quotaWho, sessionId, 'statement');

      expect(res.status).toBe(429);
      expect(provider.calls).toHaveLength(0);
      expect(await runsOf(sessionId)).toHaveLength(0);
    });

    it('giảng viên khác nhận 403, chưa đăng nhập nhận 401', async () => {
      const sessionId = await prepare(b);

      expect((await post(b, sessionId, 'statement', a.token)).status).toBe(403);
      const anon = await request(app.getHttpServer()).post(`/exam-sessions/${sessionId}/test-bundles/generate-from-statement`).send({});
      expect(anon.status).toBe(401);
      expect(provider.calls).toHaveLength(0);
    });
  });

  describe('sinh từ mã đáp án của giảng viên', () => {
    it('model chỉ nhận đề và mã giảng viên; output lấy từ chạy mã giảng viên; đáp án vẫn là teacher', async () => {
      const sessionId = await prepare(c);
      await giveSource(c, sessionId, TEACHER_CODE, 'teacher');
      const before = await referenceOf(sessionId);
      const sandbox = reverseSandbox();
      deps.sandbox = sandbox;
      provider.next = async () => outcome(proposal({ modelAnswer: null }));

      const res = await post(c, sessionId, 'answer');

      expect(res.status).toBe(201);
      expect(res.body.ruler).toBeUndefined();
      expect(res.body.testBundle).toMatchObject({ version: 1, caseCount: 5, droppedCount: 0 });
      expect(res.body.run.status).toBe('pass');

      expect(provider.calls).toHaveLength(1);
      expect(provider.calls[0]).toMatchObject({ language: 'cpp', teacherAnswer: TEACHER_CODE });
      expect(provider.calls[0].statement).toContain('Đảo ngược dãy số');
      expect(workRequests(sandbox)[0].program.files[0].ref).toEqual({ kind: 'inline', content: TEACHER_CODE });

      const [bundle] = await bundlesOf(sessionId);
      expect(bundle).toMatchObject({ origin: 'from_model_answer', approved_at: null });
      expect(await pinnedOf(sessionId)).toEqual({ session_pin: null, problem_pin: null });
      // Đáp án, nguồn gốc, mã và độ tin cậy KHÔNG đổi.
      expect(await referenceOf(sessionId)).toEqual(before);
      expect(await referenceOf(sessionId)).toMatchObject({ model_answer_origin: 'teacher', ruler_trust: 'teacher' });
      expect((await runsOf(sessionId))[0]).toMatchObject({ kind: 'generate_answer', status: 'pass', source_sha256: sha(TEACHER_CODE) });
    });

    it('không đổi cả khi đáp án mã là bản hệ thống sinh trước đó (authoring)', async () => {
      const sessionId = await prepare(c);
      await giveSource(c, sessionId, TEACHER_CODE, 'authoring');

      const res = await post(c, sessionId, 'answer');

      expect(res.status).toBe(201);
      expect(await referenceOf(sessionId)).toMatchObject({ model_answer_origin: 'authoring', model_answer_source_sha256: sha(TEACHER_CODE) });
    });

    it('chưa có mã đáp án → 409, model chưa được gọi', async () => {
      const sessionId = await prepare(c);

      const res = await post(c, sessionId, 'answer');

      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/mã/);
      expect(provider.calls).toHaveLength(0);
    });

    it('mã giảng viên không tái tạo đúng ví dụ trong đề → 422 kèm chi tiết, không ghi gói', async () => {
      const sessionId = await prepare(c);
      await giveSource(c, sessionId, TEACHER_CODE, 'teacher');
      deps.sandbox = reverseSandbox((input) => (input === EX_INPUT ? { stdout: 'sai\n' } : undefined));

      const res = await post(c, sessionId, 'answer');

      expect(res.status).toBe(422);
      expect(await bundlesOf(sessionId)).toHaveLength(0);
      expect((await runsOf(sessionId))[0]).toMatchObject({ status: 'fail' });
    });

    it('mã giảng viên không biên dịch → 422, không ghi gì', async () => {
      const sessionId = await prepare(c);
      await giveSource(c, sessionId, TEACHER_CODE, 'teacher');
      deps.sandbox = fakeSandbox((req) =>
        req.cases[0]?.name === 'preflight'
          ? execResult([{ name: 'preflight', status: 'ran', stdout: '' }])
          : execResult([], { compile: { ok: false, log: 'error: thiếu dấu chấm phẩy', ms: 3 } }),
      );

      const res = await post(c, sessionId, 'answer');

      expect(res.status).toBe(422);
      expect(await bundlesOf(sessionId)).toHaveLength(0);
    });
  });

  describe('lỗi model và kế toán', () => {
    it('model từ chối SAU khi tốn token → lỗi của provider giữ nguyên mã, token vẫn được ghi, không ghi gói', async () => {
      const sessionId = await prepare(c);
      provider.next = async () => {
        throw new RulerProviderFailure(new UnprocessableEntityException('Model từ chối dựng thước'), { modelUsed: 'fake-ruler-model', inputTokens: 500, outputTokens: 40 });
      };
      const usageBefore = (await usageOf(c.id)).length;

      const res = await post(c, sessionId, 'statement');

      expect(res.status).toBe(422);
      expect(res.body.message).toBe('Model từ chối dựng thước');
      await expectNothingWritten(sessionId);
      const usage = await usageOf(c.id);
      expect(usage).toHaveLength(usageBefore + 1);
      expect(usage.at(-1)).toMatchObject({ feature: 'ruler_generate', model_used: 'fake-ruler-model', input_tokens: 500, output_tokens: 40 });
      expect((await runsOf(sessionId))[0]).toMatchObject({ status: 'aborted', tokens_in: 500, tokens_out: 40 });
    });

    it('model hỏng TRƯỚC khi có response (chưa tốn token) → không ghi ai_usage, dòng chạy aborted', async () => {
      const sessionId = await prepare(c);
      provider.next = async () => {
        throw new RulerProviderFailure(new BadGatewayException('Không gọi được model'), null);
      };
      const usageBefore = (await usageOf(c.id)).length;

      const res = await post(c, sessionId, 'statement');

      expect(res.status).toBe(502);
      expect(await usageOf(c.id)).toHaveLength(usageBefore);
      const [run] = await runsOf(sessionId);
      expect(run).toMatchObject({ status: 'aborted', tokens_in: null, model_used: null });
    });

    it('lỗi bất ngờ của provider → 500 nhưng dòng chạy không treo ở running', async () => {
      const sessionId = await prepare(c);
      provider.next = async () => {
        throw new Error('bất ngờ');
      };

      const res = await post(c, sessionId, 'statement');

      expect(res.status).toBe(500);
      expect((await runsOf(sessionId))[0]).toMatchObject({ status: 'aborted' });
      // Lượt sau không bị chặn 409 vì dòng treo.
      provider.next = async () => outcome(proposal());
      expect((await post(c, sessionId, 'statement')).status).toBe(201);
    });

    it('lượt thành công ghi prompt_version, model, token, chi phí null khi chưa khai giá, và một dòng ai_usage', async () => {
      const sessionId = await prepare(c);
      const usageBefore = (await usageOf(c.id)).length;

      const res = await post(c, sessionId, 'statement');

      expect(res.status).toBe(201);
      expect((await runsOf(sessionId))[0]).toMatchObject({
        prompt_version: 'pv-test',
        model_used: 'fake-ruler-model',
        tokens_in: 1_200,
        tokens_out: 800,
        cost_usd: null,
      });
      const usage = await usageOf(c.id);
      expect(usage).toHaveLength(usageBefore + 1);
      expect(usage.at(-1)).toMatchObject({ feature: 'ruler_generate', model_used: 'fake-ruler-model', input_tokens: 1_200, output_tokens: 800, cost_usd: null });
    });

    it('chi phí tính theo cách của đường chấm khi có giá của model', async () => {
      const sessionId = await prepare(c);
      deps.priceOf = (model) => (model === 'fake-ruler-model' ? { inPerMTok: 3, outPerMTok: 15 } : undefined);

      const res = await post(c, sessionId, 'statement');

      expect(res.status).toBe(201);
      // (1200 × 3 + 800 × 15) / 1e6 = 0,0156
      const [run] = await runsOf(sessionId);
      expect(Number(run.cost_usd)).toBeCloseTo(0.0156, 6);
      expect(Number((await usageOf(c.id)).at(-1)!.cost_usd)).toBeCloseTo(0.0156, 6);
    });

    it('mã nguồn đáp án không có trong phản hồi của hai đường sinh', async () => {
      const statementSession = await prepare(c);
      const answerSession = await prepare(c);
      await giveSource(c, answerSession, TEACHER_CODE, 'teacher');

      const fromStatement = await post(c, statementSession, 'statement');
      const fromAnswer = await post(c, answerSession, 'answer');

      expect(JSON.stringify(fromStatement.body)).not.toContain('do model viết');
      expect(JSON.stringify(fromAnswer.body)).not.toContain('do giảng viên viết');
    });
  });
});

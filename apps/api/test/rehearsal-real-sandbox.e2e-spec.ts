import { createHash } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { RULER_PROVIDER, RulerOutcome, RulerProvider, RulerRequest } from '../src/exam-authoring/ruler/ruler-provider';
import { ExamSessionEntity } from '../src/exam-session/entities/exam-session.entity';
import { GradingReferenceService } from '../src/grading/grading-reference.service';
import { StorageService } from '../src/storage/storage.service';
import { createTestAccount } from './helpers/create-account';
import { upcomingSessionWindow } from './helpers/session-window';

/**
 * LƯỢT DIỄN TẬP THẬT — đường đầy đủ qua API: HTTP → DB cục bộ → storage cục bộ → hàng đợi Redis THẬT → máy chạy bài THẬT.
 *
 * Chỉ có một thứ được thay: model (RULER_PROVIDER) trả về một đề xuất cố định, vì gọi model tốn tiền và đầu ra của
 * model không phải điều đang kiểm. Mọi thứ còn lại là thật, và đáp án mong đợi được đối chiếu với một oracle tính trong JS
 * (không lấy từ sandbox), nên một lỗi của máy chạy bài không thể tự chứng minh chính nó đúng.
 *
 * Bị BỎ QUA trừ khi đặt `REAL_SANDBOX_REHEARSAL=1` và `SANDBOX_REDIS_URL` trỏ tới hàng đợi của worker. Không phải test
 * hồi quy: nó tốn thời gian thật và ghi job lên máy chạy bài dùng chung.
 */
const RUN = process.env.REAL_SANDBOX_REHEARSAL === '1' ? describe : describe.skip;

RUN('DIỄN TẬP THẬT — đường đầy đủ với sandbox thật (không chạy trong bộ e2e thường)', () => {
  jest.setTimeout(900_000);

  let app: INestApplication;
  let ds: DataSource;
  let storage: StorageService;
  let references: GradingReferenceService;
  const stamp = Date.now();
  const PASSWORD = 'correct-horse-battery';

  /** Chương trình đảo dãy đúng — cùng nội dung với đáp án mẫu của giảng viên trong lượt này. */
  const CPP_REVERSE = [
    '#include <bits/stdc++.h>',
    'using namespace std;',
    'int main(){ int n; cin >> n; vector<long long> a(n); for (auto &x : a) cin >> x;',
    '  for (int i = n - 1; i >= 0; i--) { cout << a[i]; if (i) cout << " "; }',
    '  cout << "\\n"; }',
    '',
  ].join('\n');
  /** Sai có chủ đích: in theo thứ tự xuôi. Ví dụ trong đề phải bắt được. */
  const CPP_WRONG = CPP_REVERSE.replace('for (int i = n - 1; i >= 0; i--)', 'for (int i = 0; i < n; i++)');
  /** Biên dịch lỗi có chủ đích. */
  const CPP_BROKEN = 'int main( { return 0; }\n';
  /** In 70 000 ký tự 'x' rồi xuống dòng — vượt trần 64 KiB stdout của worker, nhưng đầu vào và đáp án vẫn dưới 100 KB. */
  const CPP_LONG = '#include <iostream>\nint main(){ for (int i = 0; i < 70000; i++) std::cout << "x"; std::cout << "\\n"; }\n';
  const LONG_EXPECTED = `${'x'.repeat(70000)}\n`;

  const STATEMENT = [
    'Cho n và dãy n số nguyên. In dãy theo thứ tự ngược lại, cách nhau một dấu cách.',
    'Ví dụ:',
    'Input',
    '3',
    '1 2 3',
    'Output',
    '3 2 1',
    'Ràng buộc: 1 ≤ n ≤ 100000.',
  ].join('\n');
  const EXAMPLE_QUOTE = 'Input\n3\n1 2 3\nOutput\n3 2 1';

  /** Oracle độc lập: đảo dãy trong JS. Đây là đáp án đúng, không phải thứ sandbox nói. */
  const oracle = (input: string): string => {
    const [, line = ''] = input.split('\n');
    return `${line.split(' ').filter(Boolean).reverse().join(' ')}\n`;
  };
  const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

  const CASES_FOR_TEST_RUN = [
    { caseKey: 'c1', group: 'co_ban', input: '3\n1 2 3\n', expectedOutput: oracle('3\n1 2 3\n') },
    { caseKey: 'c2', group: 'bien', input: '1\n7\n', expectedOutput: oracle('1\n7\n') },
    { caseKey: 'c3-sai-dap-an', group: 'co_ban', input: '2\n4 5\n', expectedOutput: '4 5\n' },
  ];

  async function login(label: string): Promise<{ id: string; token: string; classId: string }> {
    const email = `diễn_tập_${label}_${stamp}@example.com`;
    const id = await createTestAccount(ds, { email, password: PASSWORD, role: 'teacher' });
    const res = await request(app.getHttpServer()).post('/auth/login').send({ email, password: PASSWORD });
    const [klass] = await ds.query(`INSERT INTO examcollect.class (course_name, name, teacher_id) VALUES ($1, $2, $3) RETURNING id`, [
      'CTDL&GT diễn tập',
      `Nhóm ${label} ${stamp}`,
      id,
    ]);
    return { id, token: res.body.accessToken as string, classId: klass.id as string };
  }

  async function makeSession(who: { token: string; classId: string }): Promise<string> {
    const window = upcomingSessionWindow();
    const created = await request(app.getHttpServer())
      .post('/exam-sessions')
      .set('Authorization', `Bearer ${who.token}`)
      .send({
        name: `Diễn tập ${Math.random().toString(36).slice(2, 7)}`,
        classId: who.classId,
        roomName: `Phòng DT ${Math.random().toString(36).slice(2, 8)}`,
        semesterName: 'HK diễn tập',
        examType: 'TK',
        startTime: window.startTime,
        endTime: window.endTime,
        requiredFilenames: [{ filename: 'bai.cpp', deliverableType: 'code_project', language: 'cpp' }],
      });
    expect(created.status).toBe(201);
    return created.body.id as string;
  }

  /** Đề bài dạng văn bản đưa qua storage thật và gắn vào phiên (như giảng viên tải đề). */
  async function giveStatement(who: { id: string }, sessionId: string) {
    const key = `materials/${sessionId}/de-dien-tap`;
    await storage.putObject(key, Buffer.from(STATEMENT, 'utf8'), 'text/plain; charset=utf-8');
    const [material] = await ds.query(
      `INSERT INTO examcollect.exam_material (exam_session_id, storage_key, file_name, file_size) VALUES ($1, $2, $3, $4) RETURNING id`,
      [sessionId, key, 'De.txt', Buffer.byteLength(STATEMENT)],
    );
    const entity = await ds.getRepository(ExamSessionEntity).findOneByOrFail({ id: sessionId });
    await references.upsert(entity, { questionMaterialId: material.id }, who.id);
  }

  /** Mã đáp án của giảng viên lên kho theo băm, như đường tải mã (A2b). */
  async function giveSource(who: { id: string }, sessionId: string, code: string) {
    const key = `grading-reference/${sessionId}/source-${sha(code)}.cpp`;
    await storage.putObject(key, Buffer.from(code, 'utf8'), 'text/plain; charset=utf-8');
    const entity = await ds.getRepository(ExamSessionEntity).findOneByOrFail({ id: sessionId });
    await references.upsert(entity, { modelAnswerNote: 'Đáp án mẫu' }, who.id, 'teacher', true, { key, sha256: sha(code) });
  }

  async function makeBundle(who: { token: string }, sessionId: string, cases: object[]) {
    const res = await request(app.getHttpServer())
      .post(`/exam-sessions/${sessionId}/test-bundles`)
      .set('Authorization', `Bearer ${who.token}`)
      .send({ cases });
    expect(res.status).toBe(201);
    return res.body as { id: string; version: number };
  }

  /** Đề xuất cố định thay cho model. Cùng hình dạng với đầu ra thật của `ClaudeRulerProvider`. */
  let proposal: { modelAnswer: string | null; examples: object[]; cases: object[] } = { modelAnswer: null, examples: [], cases: [] };
  const scripted: RulerProvider = {
    name: 'diễn-tập-cố-định',
    async propose(_request: RulerRequest): Promise<RulerOutcome> {
      return { proposal: proposal as never, usage: { modelUsed: 'diễn-tập-cố-định', inputTokens: 0, outputTokens: 0 }, promptVersion: 'diễn-tập' };
    },
  };

  const genCases = [
    { name: 'c1 đảo ba số', group: 'co_ban', input: '3\n1 2 3\n', quote: 'Cho n và dãy n số nguyên', answerIsUnique: true },
    { name: 'c2 một số', group: 'bien', input: '1\n7\n', quote: 'Ràng buộc: 1 ≤ n ≤ 100000', answerIsUnique: true },
    { name: 'c3 hai số', group: 'co_ban', input: '2\n4 5\n', quote: 'In dãy theo thứ tự ngược lại', answerIsUnique: true },
    { name: 'c4 năm số', group: 'lon', input: '5\n9 8 7 6 5\n', quote: 'Cho n và dãy n số nguyên', answerIsUnique: true },
  ];
  const genExample = { input: '3\n1 2 3\n', output: '3 2 1\n', quote: EXAMPLE_QUOTE };

  beforeAll(async () => {
    if (!process.env.SANDBOX_REDIS_URL) throw new Error('SANDBOX_REDIS_URL trống: không có hàng đợi worker để diễn tập.');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(RULER_PROVIDER)
      .useValue(scripted)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();
    ds = app.get(DataSource);
    storage = app.get(StorageService);
    references = app.get(GradingReferenceService);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('chạy thử (HTTP → hàng đợi → worker thật): đúng/sai được phân loại đúng; đáp án mong đợi đối chiếu oracle độc lập', async () => {
    const teacher = await login('chay-thu');
    const sessionId = await makeSession(teacher);
    const bundle = await makeBundle(teacher, sessionId, CASES_FOR_TEST_RUN);
    await giveSource(teacher, sessionId, CPP_REVERSE);

    const all = await request(app.getHttpServer())
      .post(`/exam-sessions/${sessionId}/test-bundles/${bundle.id}/runs`)
      .set('Authorization', `Bearer ${teacher.token}`)
      .send({});
    console.log('CHẠY THỬ CẢ GÓI', JSON.stringify({ http: all.status, status: all.body.status, cases: all.body.cases }, null, 1));
    expect(all.status).toBe(201);
    expect(all.body.status).toBe('fail');
    const byName = Object.fromEntries((all.body.cases as { name: string; status: string; diff: string | null }[]).map((c) => [c.name, c]));
    expect(byName['c1'].status).toBe('pass');
    expect(byName['c2'].status).toBe('pass');
    expect(byName['c3-sai-dap-an'].status).toBe('fail');
    expect(byName['c3-sai-dap-an'].diff).toBeTruthy();

    const one = await request(app.getHttpServer())
      .post(`/exam-sessions/${sessionId}/test-bundles/${bundle.id}/runs`)
      .set('Authorization', `Bearer ${teacher.token}`)
      .send({ caseKey: 'c1' });
    expect(one.status).toBe(201);
    expect(one.body.status).toBe('pass');
  });

  // Hai gói, mỗi gói một ca (body dưới 100 KB). Đối chiếu âm: cùng chương trình, đáp án sai ở KÝ TỰ CUỐI — phải FAIL.
  // Nếu đối chiếu âm cũng PASS thì so sánh đang không nhìn tới đuôi đầu ra, và kết quả PASS của ca đúng vô nghĩa.
  it('chạy thử ca in 70 000 ký tự: đáp án đúng → PASS; đáp án sai ở ký tự cuối → FAIL (so sánh trên đầu ra đầy đủ)', async () => {
    const teacher = await login('dai-70kib');
    const sessionId = await makeSession(teacher);
    const wrongLast = `${'x'.repeat(69999)}y\n`;
    const good = await makeBundle(teacher, sessionId, [{ caseKey: 'dai-dung', group: 'lon', input: '1\n', expectedOutput: LONG_EXPECTED }]);
    const bad = await makeBundle(teacher, sessionId, [{ caseKey: 'dai-sai-cuoi', group: 'lon', input: '1\n', expectedOutput: wrongLast }]);
    await giveSource(teacher, sessionId, CPP_LONG);

    const run = (bundleId: string) =>
      request(app.getHttpServer())
        .post(`/exam-sessions/${sessionId}/test-bundles/${bundleId}/runs`)
        .set('Authorization', `Bearer ${teacher.token}`)
        .send({});
    const rGood = await run(good.id);
    const rBad = await run(bad.id);
    console.log('CA 70 KIB — đúng', rGood.status, JSON.stringify(rGood.body).slice(0, 300));
    console.log('CA 70 KIB — sai cuối', rBad.status, JSON.stringify(rBad.body).slice(0, 300));
    expect(rGood.status).toBe(201);
    expect(rGood.body.status).toBe('pass');
    expect(rBad.status).toBe(201);
    expect(rBad.body.status).toBe('fail');
    expect(rBad.body.cases[0].diff).toBeTruthy();
  });

  it('gói tay có ca đầu vào lớn (140 KB): Nest từ chối 413 — ghi nhận hành vi hiện tại', async () => {
    const teacher = await login('413');
    const sessionId = await makeSession(teacher);
    const n = 20000;
    const bigInput = `${n}\n${Array.from({ length: n }, (_, i) => String((i * 7919) % 1000003)).join(' ')}\n`;
    const res = await request(app.getHttpServer())
      .post(`/exam-sessions/${sessionId}/test-bundles`)
      .set('Authorization', `Bearer ${teacher.token}`)
      .send({ cases: [{ caseKey: 'lon', group: 'lon', input: bigInput, expectedOutput: oracle(bigInput) }] });
    console.log('GÓI TAY CA LỚN 140 KB →', res.status);
    expect(res.status).toBe(413);
  });

  it('sinh từ đề (model cố định đúng): ví dụ trong đề được tái tạo → verified; đáp án mong đợi KHỚP oracle độc lập', async () => {
    const teacher = await login('sinh-de');
    const sessionId = await makeSession(teacher);
    await giveStatement(teacher, sessionId);
    proposal = { modelAnswer: CPP_REVERSE, examples: [genExample], cases: genCases };

    const res = await request(app.getHttpServer())
      .post(`/exam-sessions/${sessionId}/test-bundles/generate-from-statement`)
      .set('Authorization', `Bearer ${teacher.token}`)
      .send({});
    console.log('SINH TỪ ĐỀ (đúng)', JSON.stringify(res.body, null, 1));
    expect(res.status).toBe(201);
    expect(res.body.ruler).toEqual({ trust: 'verified', examplesChecked: 1 });
    expect(res.body.run.status).toBe('pass');

    const cases = await ds.query(`SELECT case_key, input, expected_output, auto_dropped_reason FROM examcollect.grading_test_case WHERE bundle_id = $1 ORDER BY case_key`, [res.body.testBundle.id]);
    for (const c of cases.filter((x: { auto_dropped_reason: string | null }) => x.auto_dropped_reason === null)) {
      expect(c.expected_output).toBe(oracle(c.input));
    }
  });

  it('sinh từ đề (model viết SAI): ví dụ không khớp → 422, không ghi gói', async () => {
    const teacher = await login('sinh-sai');
    const sessionId = await makeSession(teacher);
    await giveStatement(teacher, sessionId);
    proposal = { modelAnswer: CPP_WRONG, examples: [genExample], cases: genCases };

    const res = await request(app.getHttpServer())
      .post(`/exam-sessions/${sessionId}/test-bundles/generate-from-statement`)
      .set('Authorization', `Bearer ${teacher.token}`)
      .send({});
    console.log('SINH TỪ ĐỀ (sai)', res.status, JSON.stringify(res.body).slice(0, 400));
    expect(res.status).toBe(422);
    const [{ n }] = await ds.query(`SELECT COUNT(*)::int AS n FROM examcollect.grading_test_bundle WHERE exam_session_id = $1`, [sessionId]);
    expect(n).toBe(0);
  });

  it('sinh từ đề (biên dịch lỗi): 422 kèm log biên dịch thật, không ghi gì', async () => {
    const teacher = await login('sinh-loi');
    const sessionId = await makeSession(teacher);
    await giveStatement(teacher, sessionId);
    proposal = { modelAnswer: CPP_BROKEN, examples: [genExample], cases: genCases };

    const res = await request(app.getHttpServer())
      .post(`/exam-sessions/${sessionId}/test-bundles/generate-from-statement`)
      .set('Authorization', `Bearer ${teacher.token}`)
      .send({});
    console.log('SINH TỪ ĐỀ (biên dịch lỗi)', res.status, JSON.stringify(res.body).slice(0, 400));
    expect(res.status).toBe(422);
    expect(JSON.stringify(res.body)).toMatch(/biên dịch/);
    const [{ n }] = await ds.query(`SELECT COUNT(*)::int AS n FROM examcollect.grading_test_bundle WHERE exam_session_id = $1`, [sessionId]);
    expect(n).toBe(0);
  });

  // Đường sinh KHÔNG có đáp án mong đợi nên worker phải trả stdout về: trần 64 KiB cắt đầu ra, và ca phải bị BỎ với lý do rõ,
  // không được lưu một đáp án cụt. Đầu vào của ca này đến từ đề xuất (không qua body HTTP) nên không chịu trần 100 KB.
  it('sinh từ đáp án GV: ca có đầu ra trên 64 KiB bị BỎ với lý do, các ca còn lại vẫn vào gói', async () => {
    const teacher = await login('cat-sinh');
    const sessionId = await makeSession(teacher);
    await giveStatement(teacher, sessionId);
    await giveSource(teacher, sessionId, CPP_REVERSE);
    const bigN = 40000;
    const bigInput = `${bigN}\n${Array.from({ length: bigN }, (_, i) => String((i % 9) + 1)).join(' ')}\n`;
    proposal = {
      modelAnswer: null,
      examples: [],
      cases: [...genCases, { name: 'lon 80 KB', group: 'lon', input: bigInput, quote: 'Cho n và dãy n số nguyên', answerIsUnique: true }],
    };

    const res = await request(app.getHttpServer())
      .post(`/exam-sessions/${sessionId}/test-bundles/generate-from-answer`)
      .set('Authorization', `Bearer ${teacher.token}`)
      .send({});
    console.log('SINH — CA TRÊN 64 KIB', res.status, JSON.stringify(res.body).slice(0, 400));
    expect(res.status).toBe(201);
    expect(res.body.testBundle.droppedCount).toBe(1);
    const rows = await ds.query(`SELECT case_key, expected_output, auto_dropped_reason FROM examcollect.grading_test_case WHERE bundle_id = $1 ORDER BY case_key`, [res.body.testBundle.id]);
    const big = rows.find((r: { case_key: string }) => r.case_key === 'lon-80-kb');
    expect(big.auto_dropped_reason).toMatch(/64 KiB/);
    expect(big.expected_output).toBe('');
    for (const c of rows.filter((r: { auto_dropped_reason: string | null }) => r.auto_dropped_reason === null)) {
      expect(c.expected_output).not.toBe('');
    }
  });

  it('sinh từ đáp án của giảng viên: output lấy từ chạy mã của GIẢNG VIÊN thật, khớp oracle độc lập', async () => {
    const teacher = await login('tu-dap-an');
    const sessionId = await makeSession(teacher);
    await giveStatement(teacher, sessionId);
    await giveSource(teacher, sessionId, CPP_REVERSE);
    proposal = { modelAnswer: null, examples: [], cases: genCases };

    const res = await request(app.getHttpServer())
      .post(`/exam-sessions/${sessionId}/test-bundles/generate-from-answer`)
      .set('Authorization', `Bearer ${teacher.token}`)
      .send({});
    console.log('SINH TỪ ĐÁP ÁN GV', JSON.stringify(res.body, null, 1));
    expect(res.status).toBe(201);
    expect(res.body.ruler).toBeUndefined();
    const [bundle] = await ds.query(`SELECT origin FROM examcollect.grading_test_bundle WHERE id = $1`, [res.body.testBundle.id]);
    expect(bundle.origin).toBe('from_model_answer');
    const cases = await ds.query(`SELECT input, expected_output, auto_dropped_reason FROM examcollect.grading_test_case WHERE bundle_id = $1`, [res.body.testBundle.id]);
    for (const c of cases.filter((x: { auto_dropped_reason: string | null }) => x.auto_dropped_reason === null)) {
      expect(c.expected_output).toBe(oracle(c.input));
    }
  });
});

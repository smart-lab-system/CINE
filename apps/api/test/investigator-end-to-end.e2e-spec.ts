import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import type { ChatTextRequest } from '../src/grading/ai-provider/openai-chat';
import type { ModelTier } from '../src/grading/investigator/model-pool';
import { execResult, fakeSandbox } from '../src/grading/investigator/testing/fake-sandbox';
import { INVESTIGATOR_DEPS, InvestigatorDeps } from '../src/grading/pipeline/investigator-deps';
import type { ExecRequest } from '../src/sandbox/sandbox.client';
import { StorageService } from '../src/storage/storage.service';
import { createTestAccount } from './helpers/create-account';
import { seedCriterion } from './helpers/grading-seed';
import { seedPrices, seedRule } from './helpers/investigator-seed';
import { putObject, QUESTION, SOURCE } from './helpers/code-session-seed';

const USAGE = { inputTokens: 100, outputTokens: 20, cacheReadTokens: 0, cacheCreationTokens: 0 };
const call = (tool: string, extra: Record<string, unknown> = {}) => ({ tool, input: null, group: null, path: null, fromLine: null, toLine: null, ...extra });
const turn = (...calls: object[]) => JSON.stringify({ action: 'call', calls, verdict: null });
const final = (errors: object[]) =>
  JSON.stringify({ action: 'final', calls: [], verdict: { errors, missingRules: [], injectionAttempt: { detected: false, excerpt: null } } });

/** Model kịch bản: chạy gói test + đọc bài, kết luận một lỗi lời (`ten_bien`). */
function scripted(): ModelTier & { requests: ChatTextRequest[] } {
  const script = [
    turn(call('run_tests'), call('read_file', { path: 'main.cpp' })),
    final([{ ruleKey: 'ten_bien', toolCallIds: ['tc-2'], note: null }]),
  ];
  const requests: ChatTextRequest[] = [];
  return {
    label: 'kịch bản',
    model: 'kich-ban',
    ceiling: 1,
    requests,
    async call(req) {
      requests.push(req);
      return { content: script[Math.min(requests.length - 1, script.length - 1)], usage: USAGE };
    },
  };
}
/** Sandbox giả: nhóm `bien` fail (khớp luật máy `sai_bien`), mọi ca khác đạt. */
const bienFails = () =>
  fakeSandbox((req: ExecRequest) =>
    execResult(req.cases.map((c) => ({ name: c.name, group: c.group, status: c.group === 'bien' ? 'fail' : c.expected ? 'pass' : 'ran' }))),
  );

/**
 * Đóng plan 3d2 — chứng minh dữ liệu tạo qua đường API MỚI của Task 1-2
 * (deliverableType/language lúc tạo phiên, tạo—duyệt—ghim gói test) được
 * đường ống 3d (không đổi ở plan này: hàng đợi thật, `InvestigatorRunService`,
 * `InvestigationContextService`) đọc đúng và ra một điểm THẬT qua chính
 * `start-grading` — không gọi tắt `gradeOneById`, không chèn `grading_result`
 * bằng seed helper như mọi e2e khác của 3c/3d.
 */
describe('Đường điều tra chạy thật — từ tạo phiên qua API tới điểm (3d2, đóng plan)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let storage: StorageService;
  const deps: InvestigatorDeps = { models: [], sandbox: null, challengers: [], caseLenses: [], ceilingOf: () => 1, close: async () => undefined };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(INVESTIGATOR_DEPS)
      .useValue(deps)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();
    ds = app.get(DataSource);
    storage = app.get(StorageService);
  });

  afterAll(async () => app.close());

  async function login(label: string): Promise<{ id: string; token: string }> {
    const email = `e2e_${label}_${Date.now()}@example.com`;
    const id = await createTestAccount(ds, { email, password: 'correct-horse-battery', role: 'teacher' });
    const res = await request(app.getHttpServer()).post('/auth/login').send({ email, password: 'correct-horse-battery' });
    return { id, token: res.body.accessToken as string };
  }
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function progress(sessionId: string, token: string) {
    return request(app.getHttpServer())
      .get(`/exam-sessions/${sessionId}/grading-progress`)
      .set(as(token));
  }
  async function waitForGrading(sessionId: string, token: string, timeoutMs = 20_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const res = await progress(sessionId, token);
      if (res.body.total > 0 && res.body.pending === 0) return;
      if (Date.now() > deadline) {
        throw new Error(`chưa chấm xong sau ${timeoutMs}ms: ${JSON.stringify(res.body)}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }

  it('start-grading bị chặn TRƯỚC khi ghim gói, ra điểm THẬT sau khi ghim', async () => {
    deps.models = [scripted()];
    deps.sandbox = bienFails();
    const owner = await login('t4');

    // 1. Rubric + lớp — dựng thẳng (không phải trọng tâm plan này, 3f đã có route riêng cho rubric).
    const [klass] = await ds.query(
      `INSERT INTO examcollect.class (course_name, name, teacher_id) VALUES ($1, 'N01', $2) RETURNING id`,
      ['CTDL&GT', owner.id],
    );
    const [rubric] = await ds.query(
      `INSERT INTO examcollect.rubric (version, teacher_id, name) VALUES (1, $1, 'Rubric 3d2') RETURNING id`,
      [owner.id],
    );
    await seedCriterion(ds, rubric.id, 'tinh_dung', 6);
    await seedCriterion(ds, rubric.id, 'trinh_bay', 4);

    // 2. Phiên với MỘT deliverable code_project/cpp — qua API mới của Task 1.
    const start = new Date(Date.now() + 3_600_000);
    const end = new Date(start.getTime() + 2 * 3_600_000);
    const created = await request(app.getHttpServer())
      .post('/exam-sessions')
      .set(as(owner.token))
      .send({
        name: 'Phiên 3d2 đóng plan',
        classId: klass.id,
        roomName: `Phòng 3d2 ${Date.now()}`,
        semesterName: 'HK kiểm thử',
        examType: 'CK',
        rubricId: rubric.id,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        requiredFilenames: [{ filename: 'bai1.cpp', deliverableType: 'code_project', language: 'cpp' }],
      });
    expect(created.status).toBe(201);
    const sessionId = created.body.id as string;
    const deliverableId = created.body.requiredDeliverables[0].id as string;

    // 3. Đề bài — INSERT thẳng (đọc PDF/DOCX/TXT thành chữ không đổi ở plan này).
    const questionKey = `e2e/3d2/${randomUUID()}/de-bai.txt`;
    await putObject(storage, questionKey, Buffer.from(QUESTION));
    const [material] = await ds.query(
      `INSERT INTO examcollect.exam_material (exam_session_id, storage_key, file_name, file_size) VALUES ($1, $2, $3, $4) RETURNING id`,
      [sessionId, questionKey, 'de-bai.txt', Buffer.byteLength(QUESTION)],
    );
    await ds.query(
      `INSERT INTO examcollect.grading_reference (exam_session_id, question_material_id, created_by) VALUES ($1, $2, $3)`,
      [sessionId, material.id, owner.id],
    );

    // 4. Bảng lỗi + giá — không đổi ở plan này (3c/3f), cần để có điểm.
    const bien = await seedRule(ds, owner.id, 'sai_bien', 'tinh_dung', { kind: 'test_group_failed', group: 'bien' });
    const ten = await seedRule(ds, owner.id, 'ten_bien', 'trinh_bay');
    await seedPrices(ds, owner.id, { [bien.ruleId]: '1.50', [ten.ruleId]: '0.50' });

    // 5. Bài nộp thật, đã 'collected' — CHƯA có grading_result (start-grading ở bước 6 tạo nó).
    const submissionKey = `e2e/3d2/${randomUUID()}/submission`;
    await putObject(storage, submissionKey, SOURCE);
    const mssv = `SG3D2${Date.now() % 100000}`.slice(0, 20);
    await ds.query(
      `INSERT INTO examcollect.enrollment (student_mssv, student_name, home_class_id, home_teacher_id)
       VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
      [mssv, 'Sinh viên 3d2', klass.id, owner.id],
    );
    const [sub] = await ds.query(
      `INSERT INTO examcollect.submission
         (exam_session_id, required_deliverable_id, student_mssv, student_name_input,
          home_class_id, home_teacher_id, storage_key, checksum, file_size, submitted_via, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 10, 'normal', 'received') RETURNING id`,
      [sessionId, deliverableId, mssv, 'Sinh viên 3d2', klass.id, owner.id, submissionKey, 'a'.repeat(64)],
    );
    await ds.query(`UPDATE examcollect.submission SET status = 'validated' WHERE id = $1`, [sub.id]);
    await ds.query(`UPDATE examcollect.submission SET status = 'collected' WHERE id = $1`, [sub.id]);

    // 6. start-grading TRƯỚC khi ghim gói → 400 (§14.3, Task 3).
    const blocked = await request(app.getHttpServer())
      .post(`/exam-sessions/${sessionId}/start-grading`)
      .set(as(owner.token));
    expect(blocked.status).toBe(400);

    // 7. Tạo — duyệt — ghim gói test qua API MỚI của Task 2. Hai ca khớp đúng khuôn luật máy
    //    `sai_bien` (nhóm `bien`) mà `investigator-seed.ts` dùng cho mọi e2e khác của 3c/3d.
    const bundle = await request(app.getHttpServer())
      .post(`/exam-sessions/${sessionId}/test-bundles`)
      .set(as(owner.token))
      .send({
        cases: [
          { caseKey: 'c1', group: 'co_ban', input: '1', expectedOutput: '1' },
          { caseKey: 'c2', group: 'bien', input: '2', expectedOutput: '2' },
        ],
      });
    expect(bundle.status).toBe(201);
    await request(app.getHttpServer())
      .post(`/exam-sessions/${sessionId}/test-bundles/${bundle.body.id}/approve`)
      .set(as(owner.token));
    const pinned = await request(app.getHttpServer())
      .post(`/exam-sessions/${sessionId}/test-bundles/${bundle.body.id}/pin`)
      .set(as(owner.token));
    expect(pinned.status).toBe(201);

    // 8. start-grading SAU khi ghim gói → 200, queued: 1 — hàng đợi thật, worker thật (dùng
    //    model kịch bản + sandbox giả đã ghi đè INVESTIGATOR_DEPS ở beforeAll).
    const res = await request(app.getHttpServer())
      .post(`/exam-sessions/${sessionId}/start-grading`)
      .set(as(owner.token));
    expect(res.status).toBe(200);
    expect(res.body.queued).toBe(1);

    await waitForGrading(sessionId, owner.token);

    const [result] = await ds.query(
      `SELECT status, ai_total_score, ungradable_class FROM examcollect.grading_result WHERE submission_id = $1`,
      [sub.id],
    );
    // Điểm THẬT ra đời — không phải ungradable/system vì "chưa ghim gói" hay "ngôn ngữ không hỗ
    // trợ", đúng hai nguyên nhân mà Task 1-3 của plan này xoá bỏ.
    expect(result.ungradable_class).toBeNull();
    expect(result.ai_total_score).not.toBeNull();
    // 10 (tinh_dung 6 + trinh_bay 4) − 1.50 (sai_bien, luật máy trên nhóm `bien` — đúng ca do
    // Task 2 tạo qua API). `ten_bien` (lời model) không qua được verifyEvidence với kịch bản tối
    // giản này nên không bị trừ — không phải trọng tâm plan này, đã có investigate.spec.ts riêng.
    expect(Number(result.ai_total_score)).toBeCloseTo(8.5, 2);
  }, 30_000);
});

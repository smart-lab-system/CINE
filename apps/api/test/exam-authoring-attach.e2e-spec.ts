import { createHash } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { ExamMaterialService } from '../src/exam-session/exam-material.service';
import { GradingReferenceService } from '../src/grading/grading-reference.service';
import { TestBundleService } from '../src/grading/test-bundle/test-bundle.service';
import { StorageService } from '../src/storage/storage.service';
import { createTestAccount } from './helpers/create-account';
import { upcomingSessionWindow } from './helpers/session-window';

/**
 * `POST /exam-authoring/attach` — cửa riêng của luồng soạn đề.
 *
 * Bài test xương sống ở đây là ca `active`: luật "không gắn đề vào phiên đang
 * thi" trước kia chỉ sống trong một cái radio bị disabled ở
 * `session-picker.tsx`, nên một request đi thẳng vào API là qua sạch. Ca đó
 * gọi API TRỰC TIẾP, không qua UI, vì đó chính là đường mà lỗ hổng đi.
 *
 * Provider là stub (`NODE_ENV=test`), nên đề sinh ra tất định và không tốn
 * tiền — xem `selectAuthoringProvider`.
 */
describe('Exam authoring — gắn đề vào phiên (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  let teacherToken: string;
  let teacherId: string;
  let otherToken: string;
  let storage: StorageService;
  let classId: string;
  let examJson: string;

  const PASSWORD = 'correct-horse-battery';
  const stamp = Date.now();

  async function makeTeacher(prefix: string) {
    const email = `${prefix}_${stamp}_${Math.random().toString(36).slice(2, 7)}@example.com`;
    const id = await createTestAccount(dataSource, { email, password: PASSWORD, role: 'teacher' });
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: PASSWORD });
    return { id, token: login.body.accessToken as string };
  }

  async function makeSession(token: string, ownerClassId: string): Promise<string> {
    const window = upcomingSessionWindow();
    const created = await request(app.getHttpServer())
      .post('/exam-sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `Phiên gắn đề ${Math.random().toString(36).slice(2, 7)}`,
        classId: ownerClassId,
        roomName: `Phòng ${Math.random().toString(36).slice(2, 8)}`,
        semesterName: 'HK kiểm thử',
        examType: 'TK',
        startTime: window.startTime,
        endTime: window.endTime,
        requiredFilenames: ['BaiLam.docx'],
      });
    expect(created.status).toBe(201);
    return created.body.id as string;
  }

  function attach(sessionId: string, json: string, token = teacherToken) {
    return request(app.getHttpServer())
      .post('/exam-authoring/attach')
      .set('Authorization', `Bearer ${token}`)
      .send({ examSessionId: sessionId, examJson: json });
  }

  async function materialsOf(sessionId: string): Promise<{ id: string; file_name: string }[]> {
    return dataSource.query(
      `SELECT id, file_name FROM examcollect.exam_material WHERE exam_session_id = $1`,
      [sessionId],
    );
  }

  async function referenceOf(sessionId: string) {
    const [row] = await dataSource.query(
      `SELECT question_material_id, model_answer_storage_key, model_answer_filename,
              model_answer_unverified
         FROM examcollect.grading_reference WHERE exam_session_id = $1`,
      [sessionId],
    );
    return row;
  }

  async function bundlesOf(sessionId: string) {
    return dataSource.query(
      `SELECT id, version, origin, approved_by, approved_at
         FROM examcollect.grading_test_bundle WHERE exam_session_id = $1 ORDER BY version`,
      [sessionId],
    );
  }

  async function caseKeysOf(bundleId: string): Promise<string[]> {
    const rows: { case_key: string }[] = await dataSource.query(
      `SELECT case_key FROM examcollect.grading_test_case WHERE bundle_id = $1 ORDER BY case_key`,
      [bundleId],
    );
    return rows.map((r) => r.case_key);
  }

  function authoredCaseCount(json: string): number {
    const exam = JSON.parse(json) as { questions: { testBundle: unknown[] }[] };
    return exam.questions.reduce((n, q) => n + q.testBundle.length, 0);
  }

  /** Một đề tuỳ chỉnh — `parseExamJson` chấp nhận, nên dựng được tên ca mà stub không sinh. */
  function customExam(questions: { cases: { name: string; group: string }[] }[]): string {
    return JSON.stringify({
      title: 'Đề tuỳ chỉnh',
      language: 'python',
      verification: { status: 'unverified', reason: 'sandbox_unavailable' },
      questions: questions.map((q) => ({
        statement: 'Câu hỏi',
        modelAnswer: 'print(1)',
        topic: 'thử',
        points: 1,
        testBundle: q.cases.map((c) => ({ ...c, input: '1', expectedOutput: '1' })),
      })),
    });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();
    dataSource = app.get(DataSource);
    storage = app.get(StorageService);

    const teacher = await makeTeacher('attach_gv');
    teacherId = teacher.id;
    teacherToken = teacher.token;
    otherToken = (await makeTeacher('attach_gv_khac')).token;

    const [klass] = await dataSource.query(
      `INSERT INTO examcollect.class (course_name, name, teacher_id)
       VALUES ($1, $2, $3) RETURNING id`,
      ['CTDL&GT gắn đề', `Nhóm ${stamp}`, teacherId],
    );
    classId = klass.id;

    const generated = await request(app.getHttpServer())
      .post('/exam-authoring/generate')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ prompt: 'cây nhị phân tìm kiếm', questionCount: 1, language: 'python' });
    expect(generated.status).toBe(201);
    examJson = JSON.stringify(generated.body);
  });

  afterAll(async () => {
    await dataSource.query(`DELETE FROM examcollect.ai_usage WHERE teacher_id = $1`, [teacherId]);
    await app.close();
  });
  // Phiên MỚI TẠO: `create()` ghi status 'scheduled'; giờ thi còn ở tương
  // lai. Đây là hình dạng của gần như mọi phiên thật trong hệ thống, nên ca
  // này cũng là chốt chặn chống việc dựng lại luật "chỉ gắn khi draft hoặc
  // scheduled" — luật đó sẽ làm ca này đỏ, và nó đỏ ĐÚNG.
  it('phiên chưa tới giờ thi -> gắn được cả đề lẫn đáp án, đúng chỗ của từng thứ', async () => {
    const sessionId = await makeSession(teacherToken, classId);

    const res = await attach(sessionId, examJson);
    expect(res.status).toBe(201);
    expect(res.body.paperFilename).toBe('de-thi.docx');
    expect(res.body.answerKeyFilename).toBe('dap-an-va-test.docx');

    const materials = await materialsOf(sessionId);
    expect(materials).toHaveLength(1);
    expect(materials[0].file_name).toBe('de-thi.docx');

    const reference = await referenceOf(sessionId);
    expect(reference.question_material_id).toBe(materials[0].id);
    expect(reference.model_answer_filename).toBe('dap-an-va-test.docx');
    // Đáp án nằm dưới prefix `grading-reference/`, KHÔNG phải `materials/` —
    // đó là toàn bộ cơ chế giữ nó khỏi `listForAgent`. Nếu khẳng định này
    // đỏ, đừng sửa nó: đọc `grading-reference.service.ts` trước.
    expect(reference.model_answer_storage_key).toBe(`grading-reference/${sessionId}/answer-key`);
    // Đề do model sinh, chưa sandbox nào chạy thử -> luôn mang dấu.
    expect(reference.model_answer_unverified).toBe(true);
  });

  it('phiên ĐÃ QUA giờ bắt đầu -> 409, và không để lại đề lẫn đáp án nào', async () => {
    const sessionId = await makeSession(teacherToken, classId);
    // Đẩy hẳn về quá khứ (không phải vừa chớm), để khung bận của phiên này
    // không đụng ràng buộc cách-30-phút với các phiên khác cùng giảng viên
    // trong file. Status vẫn là 'active' — đúng như một phiên đang thi thật.
    await dataSource.query(
      `UPDATE examcollect.exam_session
          SET start_time = now() - interval '3 hours', end_time = now() - interval '2 hours'
        WHERE id = $1`,
      [sessionId],
    );

    const res = await attach(sessionId, examJson);

    expect(res.status).toBe(409);
    expect(res.body.message).toContain('trước giờ thi');
    // Quan trọng hơn cả mã lỗi: chặn phải xảy ra TRƯỚC mọi lượt ghi. Một 409
    // mà vẫn để lại material nghĩa là agent trong phòng đã được báo có tài
    // liệu mới rồi — đúng thứ luật này sinh ra để chặn.
    expect(await materialsOf(sessionId)).toHaveLength(0);
    expect(await referenceOf(sessionId)).toBeUndefined();
  });

  // Giờ thi còn ở TƯƠNG LAI mà vẫn phải từ chối: phép so giờ một mình không
  // bắt được ca này, nên trạng thái đóng phải được kiểm riêng.
  it('phiên đã huỷ dù chưa tới giờ -> 409', async () => {
    const sessionId = await makeSession(teacherToken, classId);
    await dataSource.query(
      `UPDATE examcollect.exam_session SET status = 'cancelled' WHERE id = $1`,
      [sessionId],
    );

    expect((await attach(sessionId, examJson)).status).toBe(409);
    expect(await materialsOf(sessionId)).toHaveLength(0);
  });

  it('phiên của giảng viên khác -> 403, không tạo gì', async () => {
    const sessionId = await makeSession(teacherToken, classId);

    // 403 chứ không 404: quy ước của `findOwnedBy`, dùng chung với mọi route
    // phiên thi khác. Đổi riêng ở đây sẽ làm frontend phải xử hai kiểu lỗi
    // cho cùng một tình huống.
    expect((await attach(sessionId, examJson, otherToken)).status).toBe(403);
    expect(await materialsOf(sessionId)).toHaveLength(0);
  });

  it('examJson sai hình dạng -> 400, và không chạm vào phiên', async () => {
    const sessionId = await makeSession(teacherToken, classId);

    const res = await attach(sessionId, JSON.stringify({ title: 'thiếu questions' }));

    expect(res.status).toBe(400);
    expect(await materialsOf(sessionId)).toHaveLength(0);
  });

  // Ca "phiên chưa tới giờ thi" chỉ kiểm DÒNG DB nên xanh cả khi bucket rỗng.
  // Ca này kiểm BYTE: `.docx` là một file zip nên mọi file đều mở đầu bằng "PK".
  it('gắn đề xong thì cả hai object thật sự nằm trên kho lưu trữ', async () => {
    const sessionId = await makeSession(teacherToken, classId);

    const res = await attach(sessionId, examJson);
    expect(res.status).toBe(201);
    const paperKey = `materials/${sessionId}/${res.body.examMaterialId as string}`;
    const answerKey = `grading-reference/${sessionId}/answer-key`;

    expect(await storage.objectExists(paperKey)).toBe(true);
    expect(await storage.objectExists(answerKey)).toBe(true);
    const paper = await storage.getObject(paperKey);
    const answer = await storage.getObject(answerKey);
    expect(paper.subarray(0, 2).toString()).toBe('PK');
    expect(answer.subarray(0, 2).toString()).toBe('PK');
  });

  // Khoá đáp án là khoá CỐ ĐỊNH theo phiên nên lần sau GHI ĐÈ — chủ ý.
  it('gắn đề lần thứ hai trên cùng phiên vẫn còn đáp án trên kho', async () => {
    const sessionId = await makeSession(teacherToken, classId);

    expect((await attach(sessionId, examJson)).status).toBe(201);
    expect((await attach(sessionId, examJson)).status).toBe(201);

    const answer = await storage.getObject(`grading-reference/${sessionId}/answer-key`);
    expect(answer.subarray(0, 2).toString()).toBe('PK');
  });

  // Review Focus #1. `upsert` hỏng SAU khi `materials.create` đã xong: dòng
  // `exam_material` phải biến mất cùng object, nếu không `listForAgent` phát
  // một URL chết cho sinh viên.
  it('upsert hỏng -> dọn cả dòng lẫn object của lần gắn hỏng, không đụng lần trước', async () => {
    const sessionId = await makeSession(teacherToken, classId);
    const first = await attach(sessionId, examJson);
    expect(first.status).toBe(201);
    const firstId = first.body.examMaterialId as string;

    const spy = jest
      .spyOn(app.get(GradingReferenceService), 'upsert')
      .mockRejectedValueOnce(new Error('hỏng giả lập ở upsert'));
    try {
      expect((await attach(sessionId, examJson)).status).toBe(500);
    } finally {
      spy.mockRestore();
    }

    const rows = await materialsOf(sessionId);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(firstId);
    expect(await storage.objectExists(`materials/${sessionId}/${firstId}`)).toBe(true);
  });

  // `materials.create` hỏng thì CHƯA có dòng nào, chỉ có object đề vừa ghi.
  it('create hỏng -> object đề vừa ghi bị xoá, không có dòng nào', async () => {
    const sessionId = await makeSession(teacherToken, classId);

    const create = jest
      .spyOn(app.get(ExamMaterialService), 'create')
      .mockRejectedValueOnce(new Error('hỏng giả lập ở create'));
    const del = jest.spyOn(storage, 'deleteObject');
    try {
      expect((await attach(sessionId, examJson)).status).toBe(500);
      expect(del).toHaveBeenCalledTimes(1);
      const key = del.mock.calls[0][0];
      expect(key.startsWith(`materials/${sessionId}/`)).toBe(true);
      expect(await storage.objectExists(key)).toBe(false);
    } finally {
      create.mockRestore();
      del.mockRestore();
    }
    expect(await materialsOf(sessionId)).toHaveLength(0);
  });

  // Q2 (spec G2b, đã duyệt): gắn đề KHÔNG sinh gói test, dù đề có ca. Thước từ đề chưa được chạy, nên gói sinh
  // lúc gắn sẽ tự duyệt bằng output do LLM viết. Giảng viên tạo gói ở bước kế tiếp (`nextStep`).
  it('gắn đề không sinh gói test nào, dù đề có ca; kết quả nói bước kế tiếp là tạo gói', async () => {
    const sessionId = await makeSession(teacherToken, classId);

    const res = await attach(sessionId, examJson);
    expect(res.status).toBe(201);
    expect(authoredCaseCount(examJson)).toBe(3);
    expect(res.body.nextStep).toBe('create_bundle');
    expect(res.body.testBundle).toBeUndefined();

    expect(await bundlesOf(sessionId)).toHaveLength(0);
    const [pinned] = await dataSource.query(
      `SELECT test_bundle_id FROM examcollect.exam_session WHERE id = $1`,
      [sessionId],
    );
    expect(pinned.test_bundle_id).toBeNull();
  });

  // Review Focus #4. Lần gắn thứ hai KHÔNG được đè gói giảng viên đã chọn;
  // gói mới vẫn được tạo (lịch sử không mất) nhưng chưa duyệt.
  // 5.4: gắn lại (chưa chấm, chưa xác nhận, cùng số câu) thay gói đã ghim bằng gói mới đã duyệt và ghim; gói cũ giữ làm lịch sử.
  it('gắn lần hai vẫn không sinh gói nào và không đụng vào gói đã có', async () => {
    const sessionId = await makeSession(teacherToken, classId);

    const first = await attach(sessionId, examJson);
    expect(first.status).toBe(201);
    const second = await attach(sessionId, examJson);
    expect(second.status).toBe(201);
    expect(second.body.nextStep).toBe('create_bundle');

    expect(await bundlesOf(sessionId)).toHaveLength(0);
    const [row] = await dataSource.query(
      `SELECT test_bundle_id FROM examcollect.exam_session WHERE id = $1`,
      [sessionId],
    );
    expect(row.test_bundle_id).toBeNull();
  });

  // Review Focus #2 + #3, đầu-cuối: tên có dấu/dấu câu và tên trùng trong một
  // câu phải cho ra khoá hợp lệ DUY NHẤT, không phải một lỗi 500 từ DB.
  it('tên ca có dấu và tên trùng -> vẫn gắn được, không tạo gói', async () => {
    const sessionId = await makeSession(teacherToken, classId);
    const json = customExam([
      {
        cases: [
          { name: 'Ca 1: cân bằng!', group: 'co-ban' },
          { name: 'x', group: 'co-ban' },
          { name: 'x', group: 'co-ban' },
        ],
      },
    ]);

    const res = await attach(sessionId, json);
    expect(res.status).toBe(201);
    expect(res.body.nextStep).toBe('create_bundle');
    expect(await bundlesOf(sessionId)).toHaveLength(0);
  });

  // G2b A2b: mã đáp án (không phải output mong đợi) được lưu lúc gắn, theo băm nội dung.
  describe('mã nguồn đáp án lúc gắn (A2b)', () => {
    const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

    function singleExam(language: string, modelAnswer: string): string {
      return JSON.stringify({
        title: 'Đề một câu',
        language,
        verification: { status: 'unverified', reason: 'sandbox_unavailable' },
        questions: [{ statement: 'Câu hỏi', modelAnswer, topic: 'thử', points: 1, testBundle: [] }],
      });
    }

    async function sourceOf(sessionId: string) {
      const [row] = await dataSource.query(
        `SELECT model_answer_source_key AS key, model_answer_source_sha256 AS sha256, ruler_trust
           FROM examcollect.grading_reference WHERE exam_session_id = $1`,
        [sessionId],
      );
      return row as { key: string | null; sha256: string | null; ruler_trust: string | null };
    }

    it('đề một câu cpp → ghi object theo băm, cột nguồn trỏ đúng, ruler_trust = unverified', async () => {
      const sessionId = await makeSession(teacherToken, classId);
      const code = '#include <iostream>\nint main() { std::cout << 42; }\n';

      const res = await attach(sessionId, singleExam('cpp', code));

      expect(res.status).toBe(201);
      const key = `grading-reference/${sessionId}/source-${sha(code)}.cpp`;
      expect(await sourceOf(sessionId)).toEqual({ key, sha256: sha(code), ruler_trust: 'unverified' });
      expect(await storage.objectExists(key)).toBe(true);
      expect((await storage.getObject(key)).toString('utf8')).toBe(code);
    });

    it('đề một câu python → đuôi .py', async () => {
      const sessionId = await makeSession(teacherToken, classId);
      const code = 'print(42)\n';

      expect((await attach(sessionId, singleExam('python', code))).status).toBe(201);

      expect((await sourceOf(sessionId)).key).toBe(`grading-reference/${sessionId}/source-${sha(code)}.py`);
    });

    it('ngôn ngữ java trong JSON cũ → không ghi mã nguồn, không lỗi', async () => {
      const sessionId = await makeSession(teacherToken, classId);

      const res = await attach(sessionId, singleExam('java', 'class A {}'));

      expect(res.status).toBe(201);
      expect(await sourceOf(sessionId)).toEqual({ key: null, sha256: null, ruler_trust: 'unverified' });
    });

    it('gắn hai lần với đáp án khác → hai object, cột trỏ bản mới, bản cũ còn trên kho', async () => {
      const sessionId = await makeSession(teacherToken, classId);
      const first = 'print(1)\n';
      const second = 'print(2)\n';

      expect((await attach(sessionId, singleExam('python', first))).status).toBe(201);
      expect((await attach(sessionId, singleExam('python', second))).status).toBe(201);

      const oldKey = `grading-reference/${sessionId}/source-${sha(first)}.py`;
      const newKey = `grading-reference/${sessionId}/source-${sha(second)}.py`;
      expect((await sourceOf(sessionId)).key).toBe(newKey);
      expect(await storage.objectExists(oldKey)).toBe(true);
      expect(await storage.objectExists(newKey)).toBe(true);
    });
  });

  it('đề không sinh ca nào -> vẫn gắn đề, không tạo gói', async () => {
    const sessionId = await makeSession(teacherToken, classId);

    const res = await attach(sessionId, customExam([{ cases: [] }]));

    expect(res.status).toBe(201);
    expect(res.body.nextStep).toBe('create_bundle');
    expect(await bundlesOf(sessionId)).toHaveLength(0);
  });

  it('sau khi gắn từ Soạn đề, readiness nói nguồn là Soạn đề và đáp án chưa kiểm chứng', async () => {
    const sessionId = await makeSession(teacherToken, classId);
    expect((await attach(sessionId, examJson)).status).toBe(201);

    const res = await request(app.getHttpServer())
      .get(`/exam-sessions/${sessionId}/grading-readiness`)
      .set('Authorization', `Bearer ${teacherToken}`);

    expect(res.status).toBe(200);
    expect(res.body.sources.modelAnswer).toEqual({
      present: true,
      kind: 'authoring',
      fileName: 'dap-an-va-test.docx',
      setAt: expect.any(String),
      unverified: true,
    });
    expect(res.body.sources.question.fileName).toBe('de-thi.docx');
  });

  // `dropCase` chép origin và created_by của gói gốc. Ca có sẵn ở test-bundle.e2e chỉ dùng gói 'teacher'
  // nên không bắt được việc origin bị gán cứng; gói 'generated' chưa duyệt (lần gắn thứ hai) bắt được.
  it('bỏ ca khỏi gói generated chưa duyệt -> phiên bản mới vẫn là generated, chưa duyệt', async () => {
    const sessionId = await makeSession(teacherToken, classId);
    expect((await attach(sessionId, examJson)).status).toBe(201);
    const [ordinalOne] = await dataSource.query(
      `SELECT id FROM examcollect.exam_problem WHERE exam_session_id = $1 AND ordinal = 1`,
      [sessionId],
    );
    // Gắn đề không tạo gói (Q2): gói nguồn được dựng trực tiếp với ba ca của đề, cùng câu 1.
    const [firstBundle] = await dataSource.query(
      `INSERT INTO examcollect.grading_test_bundle (exam_session_id, version, origin, created_by, problem_id)
       VALUES ($1, 1, 'generated', $2, $3) RETURNING id`,
      [sessionId, teacherId, ordinalOne.id],
    );
    for (const caseKey of ['q1-co-ban', 'q1-mot-phan-tu', 'q1-rong']) {
      await dataSource.query(
        `INSERT INTO examcollect.grading_test_case (bundle_id, case_key, "group", input, expected_output) VALUES ($1, $2, 'nhom', '1', '1')`,
        [firstBundle.id, caseKey],
      );
    }
    const [unapproved] = await dataSource.query(
      `INSERT INTO examcollect.grading_test_bundle (exam_session_id, version, origin, created_by, problem_id)
       VALUES ($1, 2, 'generated', $2, $3) RETURNING id`,
      [sessionId, teacherId, ordinalOne.id],
    );
    await dataSource.query(
      `INSERT INTO examcollect.grading_test_case (bundle_id, case_key, "group", input, expected_output)
       SELECT $1, case_key, "group", input, expected_output FROM examcollect.grading_test_case WHERE bundle_id = $2`,
      [unapproved.id, firstBundle.id],
    );
    const unapprovedId = unapproved.id as string;

    const dropped = await request(app.getHttpServer())
      .post(`/exam-sessions/${sessionId}/test-bundles/${unapprovedId}/drop-case`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ caseKey: 'q1-rong' });

    expect(dropped.status).toBe(201);
    const bundles = await bundlesOf(sessionId);
    expect(bundles).toHaveLength(3);
    expect(bundles[2].origin).toBe('generated');
    expect(bundles[2].approved_at).toBeNull();
    expect(await caseKeysOf(dropped.body.id)).toEqual(['q1-co-ban', 'q1-mot-phan-tu']);
  });
});

import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount } from './helpers/create-account';
import { liveSessionWindow } from './helpers/session-window';

/**
 * §14.3 — bắt đầu chấm bị chặn khi phiên có bài đường điều tra mà chưa ghim
 * gói test (3d2). Trước Task 3 của plan 3d2, `startGrading` không biết gì
 * về `test_bundle_id` — bài code sẽ bị xếp hàng rồi worker mới báo
 * `ungradable/system` từng bài một, thay vì một thông báo rõ nghĩa trước
 * khi giảng viên bấm.
 */
describe('start-grading — chặn khi thiếu gói test cho bài điều tra (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  const stamp = Date.now();

  async function login(label: string): Promise<{ id: string; token: string }> {
    const email = `sgguard_${label}_${stamp}@example.com`;
    const id = await createTestAccount(ds, { email, password: 'correct-horse-battery', role: 'teacher' });
    const res = await request(app.getHttpServer()).post('/auth/login').send({ email, password: 'correct-horse-battery' });
    return { id, token: res.body.accessToken as string };
  }
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();
    ds = app.get(DataSource);
  });

  afterAll(async () => app.close());

  async function seedCollectedSubmission(
    sessionId: string,
    deliverableId: string,
    teacherId: string,
    classId: string,
    label: string,
  ) {
    const mssv = `SG${label}${Date.now() % 100000}`.slice(0, 20);
    await ds.query(
      `INSERT INTO examcollect.enrollment (student_mssv, student_name, home_class_id, home_teacher_id)
       VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
      [mssv, `Sinh viên ${label}`, classId, teacherId],
    );
    const [row] = await ds.query(
      `INSERT INTO examcollect.submission
         (exam_session_id, required_deliverable_id, student_mssv, student_name_input,
          home_class_id, home_teacher_id, storage_key, checksum, file_size, submitted_via, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 10, 'normal', 'received') RETURNING id`,
      [
        sessionId,
        deliverableId,
        mssv,
        `Sinh viên ${label}`,
        classId,
        teacherId,
        `submissions/${sessionId}/${mssv}/${deliverableId}`,
        'a'.repeat(64),
      ],
    );
    await ds.query(`UPDATE examcollect.submission SET status = 'validated' WHERE id = $1`, [row.id]);
    await ds.query(`UPDATE examcollect.submission SET status = 'collected' WHERE id = $1`, [row.id]);
  }

  async function createRubricAndClass(token: string, teacherId: string, label: string) {
    const [klass] = await ds.query(
      `INSERT INTO examcollect.class (course_name, name, teacher_id) VALUES ($1, $2, $3) RETURNING id`,
      [`Môn ${label}`, `Nhóm ${label}`, teacherId],
    );
    const rubric = await request(app.getHttpServer())
      .post('/rubrics')
      .set(as(token))
      .send({ name: `Rubric ${label}`, criteria: [{ description: 'Đúng thuật toán', maxPoints: 10 }] });
    expect(rubric.status).toBe(201);
    return { classId: klass.id as string, rubricId: rubric.body.id as string };
  }

  it('phiên chỉ có deliverable code_project/cpp CHƯA ghim gói test → start-grading 400', async () => {
    const owner = await login('b1');
    const { classId, rubricId } = await createRubricAndClass(owner.token, owner.id, 'b1');
    const created = await request(app.getHttpServer())
      .post('/exam-sessions')
      .set(as(owner.token))
      .send({
        name: 'Phiên code b1',
        classId,
        roomName: `Phòng b1 ${stamp}`,
        semesterName: 'HK kiểm thử',
        examType: 'CK',
        rubricId,
        ...liveSessionWindow(),
        requiredFilenames: [{ filename: 'bai1.zip', deliverableType: 'code_project', language: 'cpp' }],
      });
    expect(created.status).toBe(201);
    const sessionId = created.body.id as string;
    const deliverableId = created.body.requiredDeliverables[0].id as string;
    await seedCollectedSubmission(sessionId, deliverableId, owner.id, classId, 'b1');

    const res = await request(app.getHttpServer())
      .post(`/exam-sessions/${sessionId}/start-grading`)
      .set(as(owner.token));
    expect(res.status).toBe(400);
  });

  // G2b A2: gắn đề từ Soạn đề KHÔNG tạo gói test (trước đây tạo, duyệt và ghim một gói do chính LLM viết — thước tự duyệt).
  // Giảng viên phải tạo gói (tay, hay nút sinh gói) rồi duyệt và ghim; chưa làm thì bắt đầu chấm bị chặn như mọi phiên bài code.
  it('phiên đã gắn đề từ Soạn đề nhưng chưa có gói nào → start-grading 400, gắn đề không tự ghim gói', async () => {
    const owner = await login('b5');
    const { classId, rubricId } = await createRubricAndClass(owner.token, owner.id, 'b5');
    const created = await request(app.getHttpServer())
      .post('/exam-sessions')
      .set(as(owner.token))
      .send({
        name: 'Phiên code b5',
        classId,
        roomName: `Phòng b5 ${stamp}`,
        semesterName: 'HK kiểm thử',
        examType: 'CK',
        rubricId,
        ...liveSessionWindow(),
        requiredFilenames: [{ filename: 'bai1.zip', deliverableType: 'code_project', language: 'cpp' }],
      });
    expect(created.status).toBe(201);
    const sessionId = created.body.id as string;
    const deliverableId = created.body.requiredDeliverables[0].id as string;

    const attached = await request(app.getHttpServer())
      .post('/exam-authoring/attach')
      .set(as(owner.token))
      .send({
        examSessionId: sessionId,
        examJson: JSON.stringify({
          title: 'Đề gắn từ Soạn đề',
          language: 'cpp',
          verification: { status: 'unverified', reason: 'sandbox_unavailable' },
          questions: [
            {
              statement: 'In ra tổng hai số.',
              modelAnswer: 'int main() { return 0; }',
              topic: 'thử',
              points: 10,
              testBundle: [{ name: 'ca 1', group: 'co_ban', input: '1 2', expectedOutput: '3' }],
            },
          ],
        }),
      });
    expect(attached.status).toBe(201);
    expect(attached.body.nextStep).toBe('create_bundle');
    const [pin] = await ds.query(`SELECT test_bundle_id FROM examcollect.exam_session WHERE id = $1`, [sessionId]);
    expect(pin.test_bundle_id).toBeNull();
    const [{ n }] = await ds.query(`SELECT COUNT(*)::int AS n FROM examcollect.grading_test_bundle WHERE exam_session_id = $1`, [sessionId]);
    expect(n).toBe(0);

    await seedCollectedSubmission(sessionId, deliverableId, owner.id, classId, 'b5');
    const res = await request(app.getHttpServer()).post(`/exam-sessions/${sessionId}/start-grading`).set(as(owner.token));
    expect(res.status).toBe(400);
  });

  it('cùng phiên đó, SAU khi tạo—duyệt—ghim gói test → start-grading chạy (queued: 1)', async () => {
    const owner = await login('b2');
    const { classId, rubricId } = await createRubricAndClass(owner.token, owner.id, 'b2');
    const created = await request(app.getHttpServer())
      .post('/exam-sessions')
      .set(as(owner.token))
      .send({
        name: 'Phiên code b2',
        classId,
        roomName: `Phòng b2 ${stamp}`,
        semesterName: 'HK kiểm thử',
        examType: 'CK',
        rubricId,
        ...liveSessionWindow(),
        requiredFilenames: [{ filename: 'bai1.zip', deliverableType: 'code_project', language: 'cpp' }],
      });
    const sessionId = created.body.id as string;
    const deliverableId = created.body.requiredDeliverables[0].id as string;
    await seedCollectedSubmission(sessionId, deliverableId, owner.id, classId, 'b2');

    const blocked = await request(app.getHttpServer())
      .post(`/exam-sessions/${sessionId}/start-grading`)
      .set(as(owner.token));
    expect(blocked.status).toBe(400);

    const bundle = await request(app.getHttpServer())
      .post(`/exam-sessions/${sessionId}/test-bundles`)
      .set(as(owner.token))
      .send({ cases: [{ caseKey: 'ca1', group: 'public', input: '1\n', expectedOutput: '1\n' }] });
    await request(app.getHttpServer())
      .post(`/exam-sessions/${sessionId}/test-bundles/${bundle.body.id}/approve`)
      .set(as(owner.token));
    const pinned = await request(app.getHttpServer())
      .post(`/exam-sessions/${sessionId}/test-bundles/${bundle.body.id}/pin`)
      .set(as(owner.token));
    expect(pinned.status).toBe(201);

    const res = await request(app.getHttpServer())
      .post(`/exam-sessions/${sessionId}/start-grading`)
      .set(as(owner.token));
    expect(res.status).toBe(200);
    expect(res.body.queued).toBe(1);
  });

  it('phiên TRỘN document + code_project/cpp, chưa ghim gói test → vẫn 400 (Review Focus #4)', async () => {
    const owner = await login('b3');
    const { classId, rubricId } = await createRubricAndClass(owner.token, owner.id, 'b3');
    const created = await request(app.getHttpServer())
      .post('/exam-sessions')
      .set(as(owner.token))
      .send({
        name: 'Phiên trộn b3',
        classId,
        roomName: `Phòng b3 ${stamp}`,
        semesterName: 'HK kiểm thử',
        examType: 'CK',
        rubricId,
        ...liveSessionWindow(),
        requiredFilenames: [
          { filename: 'baocao.docx', deliverableType: 'document' },
          { filename: 'bai1.zip', deliverableType: 'code_project', language: 'cpp' },
        ],
      });
    expect(created.status).toBe(201);
    const sessionId = created.body.id as string;
    const codeDeliverable = created.body.requiredDeliverables.find(
      (d: { requiredFilename: string }) => d.requiredFilename === 'bai1.zip',
    );
    await seedCollectedSubmission(sessionId, codeDeliverable.id, owner.id, classId, 'b3');
    // 5.2: phiên nhiều yêu cầu nộp phải có đề cương đã xác nhận trước; cổng đó qua rồi thì gói test vẫn chặn (400).
    await ds.query(
      `UPDATE examcollect.exam_session SET blueprint_confirmed_at = now(), blueprint_confirmed_by = $2 WHERE id = $1`,
      [sessionId, owner.id],
    );

    const res = await request(app.getHttpServer())
      .post(`/exam-sessions/${sessionId}/start-grading`)
      .set(as(owner.token));
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/chưa ghim gói test/);
    expect(JSON.stringify(res.body)).not.toMatch(/§/);
  });

  it('phiên chỉ có deliverable document, chưa ghim gói test → start-grading KHÔNG bị chặn bởi §14.3', async () => {
    const owner = await login('b4');
    const { classId, rubricId } = await createRubricAndClass(owner.token, owner.id, 'b4');
    const created = await request(app.getHttpServer())
      .post('/exam-sessions')
      .set(as(owner.token))
      .send({
        name: 'Phiên tự luận b4',
        classId,
        roomName: `Phòng b4 ${stamp}`,
        semesterName: 'HK kiểm thử',
        examType: 'CK',
        rubricId,
        ...liveSessionWindow(),
        requiredFilenames: ['baocao.docx'],
      });
    const sessionId = created.body.id as string;
    const deliverableId = created.body.requiredDeliverables[0].id as string;
    await seedCollectedSubmission(sessionId, deliverableId, owner.id, classId, 'b4');

    const res = await request(app.getHttpServer())
      .post(`/exam-sessions/${sessionId}/start-grading`)
      .set(as(owner.token));
    expect(res.status).toBe(200);
    expect(res.body.queued).toBe(1);
  });
});

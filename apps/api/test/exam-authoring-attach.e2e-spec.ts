import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
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

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();
    dataSource = app.get(DataSource);

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
  // Phiên MỚI TẠO: `create()` ghi status 'active' ngay, giờ thi còn ở tương
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
});

import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount } from './helpers/create-account';

describe('Exam bank (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let teacherToken: string;
  let teacherId: string;
  let otherToken: string;
  let courseId: string;
  let otherCourseId: string;

  const PASSWORD = 'correct-horse-battery';

  async function makeAccount(prefix: string) {
    const email = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@example.com`;
    const id = await createTestAccount(dataSource, { email, password: PASSWORD, role: 'teacher' });
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: PASSWORD });
    return { id, token: login.body.accessToken as string };
  }

  async function seedCourse(code: string): Promise<string> {
    const [row] = await dataSource.query(
      `INSERT INTO examcollect.course (code, name, status) VALUES ($1, $2, 'active') RETURNING id`,
      [code, `Môn ${code}`],
    );
    return row.id as string;
  }

  async function assignClass(teacherId: string, courseId: string, name: string) {
    await dataSource.query(
      `INSERT INTO examcollect.class (course_name, name, teacher_id, course_id)
       VALUES ($1, $2, $3, $4)`,
      ['Môn test', name, teacherId, courseId],
    );
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();
    dataSource = app.get(DataSource);

    const teacher = await makeAccount('bank_gv');
    teacherId = teacher.id;
    teacherToken = teacher.token;
    otherToken = (await makeAccount('bank_other')).token;

    const stamp = Date.now().toString(36);
    courseId = await seedCourse(`BK${stamp}A`.slice(0, 20));
    otherCourseId = await seedCourse(`BK${stamp}B`.slice(0, 20));
    await assignClass(teacherId, courseId, `L${stamp}1`.slice(0, 20));
  });

  afterAll(async () => {
    await dataSource.query(`DELETE FROM examcollect.course_exam WHERE course_id = ANY($1::uuid[])`, [
      [courseId, otherCourseId],
    ]);
    await dataSource.query(`DELETE FROM examcollect.class WHERE course_id = ANY($1::uuid[])`, [
      [courseId, otherCourseId],
    ]);
    await dataSource.query(`DELETE FROM examcollect.course WHERE id = ANY($1::uuid[])`, [
      [courseId, otherCourseId],
    ]);
    await app.close();
  });

  it('liệt kê môn đang dạy', async () => {
    const res = await request(app.getHttpServer())
      .get('/exam-bank/courses')
      .set('Authorization', `Bearer ${teacherToken}`);
    expect(res.status).toBe(200);
    expect(res.body.some((c: { id: string }) => c.id === courseId)).toBe(true);
  });

  it('CRUD đề nháp trên môn được phân công', async () => {
    const created = await request(app.getHttpServer())
      .post('/exam-bank')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        courseId,
        examType: 'GK',
        language: 'cpp',
        totalPoints: 10,
        questions: [
          { title: 'Câu 1', statement: 'Viết hàm đảo chuỗi.', points: 4 },
          { statement: 'Cài đặt ngăn xếp.', points: 6 },
        ],
      });
    expect([200, 201]).toContain(created.status);
    expect(created.body.status).toBe('draft');
    expect(created.body.examType).toBe('GK');
    expect(created.body.language).toBe('cpp');
    expect(created.body.title).toMatch(/^Đề thi giữa kỳ — /);
    expect(created.body.questionCount).toBe(2);
    expect(created.body.totalPoints).toBe(10);
    expect(created.body.allocatedPoints).toBe(10);
    expect(created.body.questions).toHaveLength(2);

    const mismatch = await request(app.getHttpServer())
      .post('/exam-bank')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        courseId,
        examType: 'TK',
        language: 'python',
        totalPoints: 10,
        questions: [{ statement: 'A', points: 3 }, { statement: 'B', points: 3 }],
      });
    expect(mismatch.status).toBe(400);

    const zeroPoint = await request(app.getHttpServer())
      .post('/exam-bank')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        courseId,
        examType: 'TK',
        language: 'python',
        totalPoints: 1,
        questions: [{ statement: 'A', points: 0 }],
      });
    expect(zeroPoint.status).toBe(400);

    const examId = created.body.id as string;

    const listed = await request(app.getHttpServer())
      .get(`/exam-bank?courseId=${courseId}`)
      .set('Authorization', `Bearer ${teacherToken}`);
    expect(listed.status).toBe(200);
    expect(listed.body.some((e: { id: string }) => e.id === examId)).toBe(true);

    const patched = await request(app.getHttpServer())
      .patch(`/exam-bank/${examId}`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ status: 'ready', examType: 'CK', language: 'java' });
    expect(patched.status).toBe(200);
    expect(patched.body.status).toBe('ready');
    expect(patched.body.examType).toBe('CK');
    expect(patched.body.language).toBe('java');
    expect(patched.body.title).toMatch(/^Đề thi cuối kỳ — /);

    const delReady = await request(app.getHttpServer())
      .delete(`/exam-bank/${examId}`)
      .set('Authorization', `Bearer ${teacherToken}`);
    expect(delReady.status).toBe(400);

    await request(app.getHttpServer())
      .patch(`/exam-bank/${examId}`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ status: 'draft' });

    const del = await request(app.getHttpServer())
      .delete(`/exam-bank/${examId}`)
      .set('Authorization', `Bearer ${teacherToken}`);
    expect(del.status).toBe(200);
  });

  it('parse-docx đổ draft + export.docx tải được', async () => {
    const { buildCourseExamDocx } = await import('../src/exam-bank/docx/build-course-exam-docx');
    const [courseRow] = await dataSource.query(
      `SELECT name, code FROM examcollect.course WHERE id = $1`,
      [courseId],
    );
    const buf = await buildCourseExamDocx({
      examType: 'GK',
      courseName: courseRow.name as string,
      language: 'cpp',
      questions: [
        { points: 4, statement: 'Câu A nội dung.' },
        { points: 6, statement: 'Câu B nội dung.' },
      ],
    });

    const parsed = await request(app.getHttpServer())
      .post(`/exam-bank/parse-docx?courseId=${courseId}`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .attach('file', buf, 'mau.docx');
    expect([200, 201]).toContain(parsed.status);
    expect(parsed.body.examType).toBe('GK');
    expect(parsed.body.language).toBe('cpp');
    expect(parsed.body.totalPoints).toBe(10);
    expect(parsed.body.questions).toHaveLength(2);

    const created = await request(app.getHttpServer())
      .post('/exam-bank')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        courseId,
        examType: parsed.body.examType,
        language: parsed.body.language,
        totalPoints: parsed.body.totalPoints,
        questions: parsed.body.questions,
      });
    expect([200, 201]).toContain(created.status);
    const examId = created.body.id as string;

    const exported = await request(app.getHttpServer())
      .get(`/exam-bank/${examId}/export.docx`)
      .set('Authorization', `Bearer ${teacherToken}`);
    expect(exported.status).toBe(200);
    expect(exported.headers['content-type']).toMatch(/wordprocessingml|octet-stream/);
    expect(Buffer.isBuffer(exported.body) ? exported.body.length : exported.body.length).toBeGreaterThan(
      100,
    );

    await request(app.getHttpServer())
      .delete(`/exam-bank/${examId}`)
      .set('Authorization', `Bearer ${teacherToken}`);
  });

  it('403 khi GV khác / không dạy môn', async () => {
    const forbiddenList = await request(app.getHttpServer())
      .get(`/exam-bank?courseId=${courseId}`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(forbiddenList.status).toBe(403);

    const createOtherCourse = await request(app.getHttpServer())
      .post('/exam-bank')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        courseId: otherCourseId,
        examType: 'TK',
        language: 'python',
        totalPoints: 1,
        questions: [{ statement: 'x', points: 1 }],
      });
    expect(createOtherCourse.status).toBe(403);
  });
});

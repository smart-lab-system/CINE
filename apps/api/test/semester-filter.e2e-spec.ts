import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount, type TestAccountRole } from './helpers/create-account';

/**
 * `semesterId` là BỘ LỌC, không bao giờ là PHẠM VI.
 *
 * Lớp lỗi mà spec này tồn tại để chặn: một bộ lọc optional thêm sau rất dễ bị
 * viết thành nhánh ("có semesterId thì where theo semester, không thì where
 * theo owner") thay vì AND thêm vào điều kiện sở hữu sẵn có. Viết sai kiểu đó,
 * một Trưởng khoa truyền `semesterId` hợp lệ là thấy dữ liệu của khoa khác —
 * không phải do cố khai thác, mà do gộp hai điều kiện sai cách.
 *
 * Fixture là trọng tâm, không phải phần dựng cảnh: hai Trưởng khoa phải dùng
 * CÙNG một học kỳ. Nếu mỗi người một kỳ thì bài test vô nghĩa — bộ lọc sẽ tách
 * họ ra kể cả khi điều kiện sở hữu đã bị thay thế.
 */
describe('Bộ lọc học kỳ không được thay thế phạm vi sở hữu (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let schema: string;
  const stamp = Date.now();

  let headAToken: string;
  let teacherAToken: string;
  let sharedSemesterId: string;
  let otherSemesterId: string;
  let courseOfA: string;
  let courseOfB: string;
  let classOfA: string;
  let classOfB: string;
  let sessionOfTeacherA: string;
  let sessionOfTeacherB: string;

  async function login(email: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'correct-horse-battery' });
    return res.body.accessToken;
  }

  async function makeAccount(
    prefix: string,
    role: TestAccountRole,
  ): Promise<{ id: string; token: string }> {
    const email = `${prefix}_${stamp}@example.com`;
    const id = await createTestAccount(dataSource, {
      email,
      password: 'correct-horse-battery',
      role,
    });
    return { id, token: await login(email) };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();
    dataSource = app.get(DataSource);
    schema = (dataSource.options as { schema?: string }).schema ?? 'examcollect';

    const headA = await makeAccount('sf_head_a', 'department_admin');
    const headB = await makeAccount('sf_head_b', 'department_admin');
    const teacherA = await makeAccount('sf_teacher_a', 'teacher');
    const teacherB = await makeAccount('sf_teacher_b', 'teacher');
    headAToken = headA.token;
    teacherAToken = teacherA.token;

    const [shared] = await dataSource.query(
      `INSERT INTO ${schema}.semester (name, start_date, end_date)
       VALUES ($1, '2026-09-01', '2027-01-15') RETURNING id`,
      [`SF Shared ${stamp}`],
    );
    sharedSemesterId = shared.id;
    const [other] = await dataSource.query(
      `INSERT INTO ${schema}.semester (name, start_date, end_date)
       VALUES ($1, '2027-02-01', '2027-06-30') RETURNING id`,
      [`SF Other ${stamp}`],
    );
    otherSemesterId = other.id;

    // Hai môn, hai chủ khoa khác nhau, CÙNG một học kỳ. Đây là điểm mấu chốt.
    const mkCourse = async (code: string, headId: string): Promise<string> => {
      const [row] = await dataSource.query(
        `INSERT INTO ${schema}.course (code, name, semester_id, department_head_id)
         VALUES ($1, 'SF Course', $2, $3) RETURNING id`,
        [code, sharedSemesterId, headId],
      );
      return row.id;
    };
    courseOfA = await mkCourse(`SFA${stamp}`.slice(0, 20), headA.id);
    courseOfB = await mkCourse(`SFB${stamp}`.slice(0, 20), headB.id);

    // Môn thứ ba, cùng chủ khoa A nhưng ở kỳ KHÁC — để khẳng định bộ lọc thật
    // sự thu hẹp, chứ không phải luôn trả về mọi thứ của A.
    await dataSource.query(
      `INSERT INTO ${schema}.course (code, name, semester_id, department_head_id)
       VALUES ($1, 'SF Other Course', $2, $3)`,
      [`SFO${stamp}`.slice(0, 20), otherSemesterId, headA.id],
    );

    const mkClass = async (courseId: string, teacherId: string): Promise<string> => {
      const [row] = await dataSource.query(
        `INSERT INTO ${schema}.class (course_id, name, teacher_id)
         VALUES ($1, 'N01', $2) RETURNING id`,
        [courseId, teacherId],
      );
      return row.id;
    };
    classOfA = await mkClass(courseOfA, teacherA.id);
    classOfB = await mkClass(courseOfB, teacherB.id);

    const [room] = await dataSource.query(
      `INSERT INTO ${schema}.room (name, capacity) VALUES ($1, 40) RETURNING id`,
      [`SF Room ${stamp}`],
    );

    // Khung giờ lệch nhau để không đụng ex_exam_session_room_overlap.
    const mkSession = async (
      courseId: string,
      classId: string,
      teacherId: string,
      offsetMin: number,
    ): Promise<string> => {
      const start = new Date(Date.now() + offsetMin * 60_000);
      const [row] = await dataSource.query(
        `INSERT INTO ${schema}.exam_session
           (name, code, course_id, class_id, room_id, exam_type, teacher_id,
            start_time, end_time, status)
         VALUES ($1, $2, $3, $4, $5, 'TK', $6, $7, $8, 'active') RETURNING id`,
        [
          'SF Session',
          `SF${offsetMin}${stamp}`.slice(0, 20),
          courseId,
          classId,
          room.id,
          teacherId,
          start.toISOString(),
          new Date(start.getTime() + 15 * 60_000).toISOString(),
        ],
      );
      return row.id;
    };
    sessionOfTeacherA = await mkSession(courseOfA, classOfA, teacherA.id, 5);
    sessionOfTeacherB = await mkSession(courseOfB, classOfB, teacherB.id, 30);
  }, 60_000);

  afterAll(async () => {
    await app.close();
  });

  describe('GET /classes/mine (Trưởng khoa)', () => {
    it('Trưởng khoa A truyền semesterId trỏ tới dữ liệu của B → vẫn rỗng', async () => {
      const res = await request(app.getHttpServer())
        .get('/classes/mine')
        .query({ semesterId: sharedSemesterId })
        .set('Authorization', `Bearer ${headAToken}`)
        .expect(200);

      const ids = (res.body as { id: string }[]).map((k) => k.id);
      expect(ids).toContain(classOfA);
      expect(ids).not.toContain(classOfB);
    }, 30_000);
  });

  describe('GET /classes/teaching (giảng viên)', () => {
    it('semesterId của kỳ mình không dạy → rỗng, không phải lớp người khác', async () => {
      const res = await request(app.getHttpServer())
        .get('/classes/teaching')
        .query({ semesterId: otherSemesterId })
        .set('Authorization', `Bearer ${teacherAToken}`)
        .expect(200);
      expect(res.body).toHaveLength(0);
    }, 30_000);

    it('không truyền semesterId thì trả mọi kỳ, như cũ', async () => {
      const res = await request(app.getHttpServer())
        .get('/classes/teaching')
        .set('Authorization', `Bearer ${teacherAToken}`)
        .expect(200);
      const ids = (res.body as { id: string }[]).map((k) => k.id);
      expect(ids).toContain(classOfA);
    }, 30_000);

    it('semesterId không phải uuid → 400', async () => {
      await request(app.getHttpServer())
        .get('/classes/teaching')
        .query({ semesterId: 'khong-phai-uuid' })
        .set('Authorization', `Bearer ${teacherAToken}`)
        .expect(400);
    }, 30_000);

    it('trả kèm tên học kỳ để phân biệt hai lớp N01 khác kỳ', async () => {
      const res = await request(app.getHttpServer())
        .get('/classes/teaching')
        .set('Authorization', `Bearer ${teacherAToken}`)
        .expect(200);
      const mine = (res.body as { id: string; semesterName?: string }[]).find(
        (k) => k.id === classOfA,
      );
      expect(mine?.semesterName).toBe(`SF Shared ${stamp}`);
    }, 30_000);
  });

  describe('GET /courses/mine và GET /exam-sessions', () => {
    it('courses/mine lọc theo học kỳ mà vẫn giữ phạm vi khoa', async () => {
      const res = await request(app.getHttpServer())
        .get('/courses/mine')
        .query({ semesterId: sharedSemesterId })
        .set('Authorization', `Bearer ${headAToken}`)
        .expect(200);
      const ids = (res.body as { id: string }[]).map((c) => c.id);
      expect(ids).toContain(courseOfA);
      expect(ids).not.toContain(courseOfB);
    }, 30_000);

    it('exam-sessions lọc theo học kỳ mà vẫn giữ phạm vi giảng viên', async () => {
      const res = await request(app.getHttpServer())
        .get('/exam-sessions')
        .query({ semesterId: sharedSemesterId })
        .set('Authorization', `Bearer ${teacherAToken}`)
        .expect(200);
      const ids = (res.body.items as { id: string }[]).map((s) => s.id);
      expect(ids).toContain(sessionOfTeacherA);
      expect(ids).not.toContain(sessionOfTeacherB);
    }, 30_000);

    it('exam-sessions với kỳ khác → không trả phiên của kỳ này', async () => {
      const res = await request(app.getHttpServer())
        .get('/exam-sessions')
        .query({ semesterId: otherSemesterId })
        .set('Authorization', `Bearer ${teacherAToken}`)
        .expect(200);
      const ids = (res.body.items as { id: string }[]).map((s) => s.id);
      expect(ids).not.toContain(sessionOfTeacherA);
    }, 30_000);
  });
});

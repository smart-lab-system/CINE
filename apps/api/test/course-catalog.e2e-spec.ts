import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount, type TestAccountRole } from './helpers/create-account';

describe('GET /courses — danh mục môn', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let academicToken: string;
  let headToken: string;
  let headId: string;
  let teacherToken: string;
  let semesterA: string;
  let semesterB: string;
  let ownedCode: string;
  let orphanCode: string;

  async function makeAccount(prefix: string, role: TestAccountRole) {
    const email = `${prefix}_${Date.now()}${Math.random().toString(36).slice(2, 7)}@example.com`;
    const password = 'Password123!';
    const id = await createTestAccount(dataSource, { email, password, role });
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password });
    return { id, token: login.body.accessToken as string };
  }

  async function makeSemester(label: string) {
    const [row] = await dataSource.query(
      `INSERT INTO examcollect.semester (name, start_date, end_date)
       VALUES ($1, '2026-09-01', '2027-01-15') RETURNING id`,
      [`${label} ${Date.now()}${Math.random().toString(36).slice(2, 5)}`],
    );
    return row.id as string;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();
    dataSource = app.get(DataSource);

    academicToken = (await makeAccount('cat_academic', 'academic_affairs')).token;
    const head = await makeAccount('cat_head', 'department_admin');
    headToken = head.token;
    headId = head.id;
    teacherToken = (await makeAccount('cat_teacher', 'teacher')).token;

    semesterA = await makeSemester('Kỳ danh mục A');
    semesterB = await makeSemester('Kỳ danh mục B');

    ownedCode = `CO${Date.now()}`.slice(0, 20);
    orphanCode = `CU${Date.now()}`.slice(0, 20);

    await dataSource.query(
      `INSERT INTO examcollect.course (code, name, semester_id, department_head_id)
       VALUES ($1, 'Môn có chủ', $2, $3)`,
      [ownedCode, semesterA, headId],
    );
    await dataSource.query(
      `INSERT INTO examcollect.course (code, name, semester_id)
       VALUES ($1, 'Môn chưa chủ', $2)`,
      [orphanCode, semesterA],
    );
    // Một môn ở kỳ B để chứng minh bộ lọc kỳ thật sự lọc.
    await dataSource.query(
      `INSERT INTO examcollect.course (code, name, semester_id)
       VALUES ($1, 'Môn kỳ khác', $2)`,
      [`CB${Date.now()}`.slice(0, 20), semesterB],
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it('chỉ Phòng Đào tạo đọc được; Trưởng khoa và giảng viên bị 403', async () => {
    const allowed = await request(app.getHttpServer())
      .get('/courses')
      .set('Authorization', `Bearer ${academicToken}`);
    expect(allowed.status).toBe(200);

    // Trước spec này endpoint KHÔNG có @Roles nào: mọi user đăng nhập đọc được
    // mọi môn toàn trường. Hai vế dưới đây là lỗ hở được đóng.
    const refusedHead = await request(app.getHttpServer())
      .get('/courses')
      .set('Authorization', `Bearer ${headToken}`);
    expect(refusedHead.status).toBe(403);

    const refusedTeacher = await request(app.getHttpServer())
      .get('/courses')
      .set('Authorization', `Bearer ${teacherToken}`);
    expect(refusedTeacher.status).toBe(403);
  });

  it('trả kèm tên chủ, và null khi chưa có chủ', async () => {
    const res = await request(app.getHttpServer())
      .get('/courses')
      .query({ semesterId: semesterA })
      .set('Authorization', `Bearer ${academicToken}`);

    expect(res.status).toBe(200);
    const owned = res.body.find((c: { code: string }) => c.code === ownedCode);
    const orphan = res.body.find((c: { code: string }) => c.code === orphanCode);

    expect(owned.departmentHeadId).toBe(headId);
    expect(typeof owned.departmentHeadName).toBe('string');
    expect(orphan.departmentHeadId).toBeNull();
    expect(orphan.departmentHeadName).toBeNull();
  });

  it('lọc theo học kỳ — môn của kỳ khác không lọt vào', async () => {
    const res = await request(app.getHttpServer())
      .get('/courses')
      .query({ semesterId: semesterA })
      .set('Authorization', `Bearer ${academicToken}`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    for (const course of res.body) {
      expect(course.semesterId).toBe(semesterA);
    }
  });

  it('unowned=true chỉ trả môn chưa có chủ', async () => {
    const res = await request(app.getHttpServer())
      .get('/courses')
      .query({ semesterId: semesterA, unowned: 'true' })
      .set('Authorization', `Bearer ${academicToken}`);

    expect(res.status).toBe(200);
    expect(res.body.map((c: { code: string }) => c.code)).toContain(orphanCode);
    expect(res.body.map((c: { code: string }) => c.code)).not.toContain(ownedCode);
    for (const course of res.body) {
      expect(course.departmentHeadId).toBeNull();
    }
  });

  it('unowned với giá trị lạ thì 400, không phải im lặng lọc sai', async () => {
    // ValidationPipe ở đây là { whitelist: true, transform: true } và KHÔNG bật
    // enableImplicitConversion, nên một boolean query param sẽ tới service dưới
    // dạng CHUỖI. Bẫy: "false" là truthy. @IsIn(['true']) đóng bẫy đó bằng cách
    // chỉ nhận đúng một giá trị hợp lệ.
    const res = await request(app.getHttpServer())
      .get('/courses')
      .query({ unowned: 'false' })
      .set('Authorization', `Bearer ${academicToken}`);

    expect(res.status).toBe(400);
  });

  it('GET /courses/unowned đã bị xoá', async () => {
    const res = await request(app.getHttpServer())
      .get('/courses/unowned')
      .set('Authorization', `Bearer ${academicToken}`);

    // 400 vì 'unowned' không parse được thành uuid cho route ':id', hoặc 404.
    // Cái không được xảy ra là 200.
    expect(res.status).not.toBe(200);
  });
});

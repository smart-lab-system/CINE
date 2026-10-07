import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount } from './helpers/create-account';

/**
 * Sau admin course-section: teacher không tạo/sửa/xoá lớp.
 * Chỉ đọc「Lớp của tôi」+ roster trên lớp đã được phân công.
 */
describe('Giảng viên — lớp đã phân công (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  let teacherToken: string;
  let teacherId: string;
  let otherTeacherToken: string;
  let adminToken: string;
  let courseId: string;
  let semesterId: string;

  const PASSWORD = 'correct-horse-battery';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
    );
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();
    dataSource = app.get(DataSource);

    const adminId = await createTestAccount(dataSource, {
      email: `admin_cls_${Date.now()}@example.com`,
      password: PASSWORD,
      role: 'admin',
    });
    teacherId = await createTestAccount(dataSource, {
      email: `teacher_cls_${Date.now()}@example.com`,
      password: PASSWORD,
      role: 'teacher',
    });
    const otherId = await createTestAccount(dataSource, {
      email: `other_cls_${Date.now()}@example.com`,
      password: PASSWORD,
      role: 'teacher',
    });

    async function login(id: string) {
      const email = (
        await dataSource.query(`SELECT email FROM examcollect.account WHERE id = $1`, [id])
      )[0].email;
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: PASSWORD });
      return res.body.accessToken as string;
    }

    adminToken = await login(adminId);
    teacherToken = await login(teacherId);
    otherTeacherToken = await login(otherId);

    const [year] = await dataSource.query(
      `INSERT INTO examcollect.academic_year (code, name, start_date, end_date, status)
       VALUES ($1, 'Năm', '2026-09-01', '2027-08-31', 'active') RETURNING id`,
      [`AY-CLS-${Date.now()}`],
    );
    const [sem] = await dataSource.query(
      `INSERT INTO examcollect.semester (academic_year_id, code, name, start_date, end_date, status)
       VALUES ($1, 'HK1', 'HK1', '2026-09-01', '2027-01-31', 'active') RETURNING id`,
      [year.id],
    );
    semesterId = sem.id;
    const [course] = await dataSource.query(
      `INSERT INTO examcollect.course (code, name, status)
       VALUES ($1, 'Môn test', 'active') RETURNING id`,
      [`CLS-${Date.now()}`],
    );
    courseId = course.id;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('POST /classes bị gỡ (404)', async () => {
    await request(app.getHttpServer())
      .post('/classes')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ name: 'X' })
      .expect(404);
  });

  it('admin tạo + gán → teacher roster; teacher khác 403', async () => {
    const created = await request(app.getHttpServer())
      .post('/admin/course-sections')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        courseId,
        semesterId,
        name: `L-${Date.now()}`,
        teacherId,
      })
      .expect(201);

    const classId = created.body.id as string;

    await request(app.getHttpServer())
      .post(`/classes/${classId}/roster/students`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ mssv: `SV${Date.now().toString().slice(-8)}`, name: 'Tran B' })
      .expect(201);

    await request(app.getHttpServer())
      .get(`/classes/${classId}/roster`)
      .set('Authorization', `Bearer ${otherTeacherToken}`)
      .expect(403);
  });
});

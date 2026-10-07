import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount } from './helpers/create-account';

describe('Admin course sections (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let adminToken: string;
  let teacherToken: string;
  let teacherId: string;
  let otherTeacherId: string;
  let courseId: string;
  let courseCode: string;
  let semesterId: string;
  let academicYearId: string;
  let studentId: string;

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

    const adminEmail = `admin_cs_${Date.now()}@example.com`;
    const teacherEmail = `teacher_cs_${Date.now()}@example.com`;
    const otherEmail = `teacher2_cs_${Date.now()}@example.com`;

    await createTestAccount(dataSource, {
      email: adminEmail,
      password: PASSWORD,
      role: 'admin',
    });
    teacherId = await createTestAccount(dataSource, {
      email: teacherEmail,
      password: PASSWORD,
      role: 'teacher',
    });
    otherTeacherId = await createTestAccount(dataSource, {
      email: otherEmail,
      password: PASSWORD,
      role: 'teacher',
    });

    const adminLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: adminEmail, password: PASSWORD });
    adminToken = adminLogin.body.accessToken;

    const teacherLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: teacherEmail, password: PASSWORD });
    teacherToken = teacherLogin.body.accessToken;

    const [year] = await dataSource.query(
      `INSERT INTO examcollect.academic_year (code, name, start_date, end_date, status)
       VALUES ($1, 'Năm test', '2026-09-01', '2027-08-31', 'active') RETURNING id`,
      [`AY-CS-${Date.now()}`],
    );
    academicYearId = year.id;
    const [sem] = await dataSource.query(
      `INSERT INTO examcollect.semester (academic_year_id, code, name, start_date, end_date, status)
       VALUES ($1, 'HK1', 'Học kỳ 1', '2026-09-01', '2027-01-31', 'active') RETURNING id`,
      [year.id],
    );
    semesterId = sem.id;

    courseCode = `CS${Date.now().toString().slice(-8)}`;
    const [course] = await dataSource.query(
      `INSERT INTO examcollect.course (code, name, status)
       VALUES ($1, 'Cấu trúc dữ liệu', 'active') RETURNING id`,
      [courseCode],
    );
    courseId = course.id;

    const [nc] = await dataSource.query(
      `INSERT INTO examcollect.nominal_class (code, name, status)
       VALUES ($1, 'Lớp hành chính', 'active') RETURNING id`,
      [`NC-CS-${Date.now()}`],
    );
    const [stu] = await dataSource.query(
      `INSERT INTO examcollect.student (mssv, full_name, nominal_class_id, status)
       VALUES ($1, 'Nguyễn Văn A', $2, 'active') RETURNING id`,
      [`SV${Date.now().toString().slice(-8)}`, nc.id],
    );
    studentId = stu.id;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('admin tạo lớp — mã = course.code + 001; assign rồi teacher thấy', async () => {
    const create = await request(app.getHttpServer())
      .post('/admin/course-sections')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        courseId,
        semesterId,
      })
      .expect(201);

    expect(create.body.teacherId).toBeNull();
    expect(create.body.courseName).toBe('Cấu trúc dữ liệu');
    expect(create.body.name).toBe(`${courseCode}001`);
    const sectionId = create.body.id as string;

    const second = await request(app.getHttpServer())
      .post('/admin/course-sections')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ courseId, semesterId })
      .expect(201);
    expect(second.body.name).toBe(`${courseCode}002`);

    await request(app.getHttpServer())
      .get('/classes/teaching')
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(200)
      .expect((res) => {
        expect(res.body.find((c: { id: string }) => c.id === sectionId)).toBeUndefined();
      });

    await request(app.getHttpServer())
      .post(`/admin/course-sections/${sectionId}/roster/students`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ studentId })
      .expect(201);

    const rosterBefore = await dataSource.query(
      `SELECT home_teacher_id FROM examcollect.enrollment WHERE home_class_id = $1`,
      [sectionId],
    );
    expect(rosterBefore[0].home_teacher_id).toBeNull();

    await request(app.getHttpServer())
      .post(`/admin/course-sections/${sectionId}/assign`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ teacherId })
      .expect(201);

    const rosterAfter = await dataSource.query(
      `SELECT home_teacher_id FROM examcollect.enrollment WHERE home_class_id = $1`,
      [sectionId],
    );
    expect(rosterAfter[0].home_teacher_id).toBe(teacherId);

    const teaching = await request(app.getHttpServer())
      .get('/classes/teaching')
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(200);
    expect(teaching.body.find((c: { id: string }) => c.id === sectionId)).toBeTruthy();

    await request(app.getHttpServer())
      .post(`/admin/course-sections/${sectionId}/assign`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ teacherId: otherTeacherId })
      .expect(201);

    const rosterRe = await dataSource.query(
      `SELECT home_teacher_id FROM examcollect.enrollment WHERE home_class_id = $1`,
      [sectionId],
    );
    expect(rosterRe[0].home_teacher_id).toBe(otherTeacherId);
  });

  it('filter năm học / môn / tìm giảng viên', async () => {
    const listed = await request(app.getHttpServer())
      .get('/admin/course-sections')
      .query({ academicYearId, courseId })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(listed.body.total).toBeGreaterThanOrEqual(1);
    expect(
      listed.body.items.every(
        (row: { courseId: string; semesterId: string }) =>
          row.courseId === courseId && row.semesterId === semesterId,
      ),
    ).toBe(true);

    await request(app.getHttpServer())
      .get('/admin/course-sections')
      .query({ q: 'không-có-gv-này-xyz' })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)
      .expect((res) => {
        expect(res.body.total).toBe(0);
      });
  });

  it('teacher gọi admin API → 403; POST /classes → 404', async () => {
    await request(app.getHttpServer())
      .get('/admin/course-sections')
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .post('/classes')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ name: 'ShouldFail' })
      .expect(404);
  });

  it('cùng môn+kỳ: mã tăng; học kỳ khác được dùng lại 001', async () => {
    const [year2] = await dataSource.query(
      `INSERT INTO examcollect.academic_year (code, name, start_date, end_date, status)
       VALUES ($1, 'Năm khác', '2027-09-01', '2028-08-31', 'active') RETURNING id`,
      [`AY-CS2-${Date.now()}`],
    );
    const [sem2] = await dataSource.query(
      `INSERT INTO examcollect.semester (academic_year_id, code, name, start_date, end_date, status)
       VALUES ($1, 'HK1', 'Học kỳ 1 năm khác', '2027-09-01', '2028-01-31', 'active') RETURNING id`,
      [year2.id],
    );

    const otherSem = await request(app.getHttpServer())
      .post('/admin/course-sections')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ courseId, semesterId: sem2.id })
      .expect(201);

    expect(otherSem.body.name).toBe(`${courseCode}001`);
  });
});

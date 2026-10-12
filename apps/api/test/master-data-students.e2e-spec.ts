import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount } from './helpers/create-account';

describe('Master data — nominal class & student (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let adminToken: string;
  let teacherToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();

    dataSource = app.get(DataSource);
    const stamp = Date.now();

    const adminEmail = `md_stu_admin_${stamp}@example.com`;
    await createTestAccount(dataSource, {
      email: adminEmail,
      password: 'correct-horse-battery',
      role: 'admin',
    });
    adminToken = (
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: adminEmail, password: 'correct-horse-battery' })
    ).body.accessToken;

    const teacherEmail = `md_stu_teacher_${stamp}@example.com`;
    await createTestAccount(dataSource, {
      email: teacherEmail,
      password: 'correct-horse-battery',
      role: 'teacher',
    });
    teacherToken = (
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: teacherEmail, password: 'correct-horse-battery' })
    ).body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('CRUD student; bad mssv 400; duplicate 409; delete class with child 409; teacher 403', async () => {
    const classRes = await request(app.getHttpServer())
      .post('/master-data/nominal-classes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: `NC-${Date.now()}`,
        name: 'D21CQCN01',
        cohortYear: 2021,
        status: 'active',
      });
    expect(classRes.status).toBe(201);
    const classId = classRes.body.id as string;

    const teacherDenied = await request(app.getHttpServer())
      .post('/master-data/students')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        mssv: 'B21DCCN001',
        fullName: 'Nguyen Van A',
        nominalClassId: classId,
        status: 'active',
      });
    expect(teacherDenied.status).toBe(403);

    const badMssv = await request(app.getHttpServer())
      .post('/master-data/students')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        mssv: 'ab',
        fullName: 'Bad',
        nominalClassId: classId,
        status: 'active',
      });
    expect(badMssv.status).toBe(400);

    const mssv = `B21${Date.now().toString().slice(-8)}`;
    const stuRes = await request(app.getHttpServer())
      .post('/master-data/students')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        mssv,
        fullName: 'Nguyen Van A',
        nominalClassId: classId,
        status: 'active',
      });
    expect(stuRes.status).toBe(201);

    const dup = await request(app.getHttpServer())
      .post('/master-data/students')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        mssv,
        fullName: 'Other',
        nominalClassId: classId,
        status: 'active',
      });
    expect(dup.status).toBe(409);

    const delClassBlocked = await request(app.getHttpServer())
      .delete(`/master-data/nominal-classes/${classId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(delClassBlocked.status).toBe(409);

    const detail = await request(app.getHttpServer())
      .get(`/master-data/students/${stuRes.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(detail.status).toBe(200);
    expect(detail.body).toMatchObject({
      id: stuRes.body.id,
      mssv,
      fullName: 'Nguyen Van A',
      nominalClassId: classId,
      status: 'active',
      nominalClass: { id: classId, code: expect.any(String) },
      courseSections: [],
    });

    expect(
      (
        await request(app.getHttpServer())
          .delete(`/master-data/students/${stuRes.body.id}`)
          .set('Authorization', `Bearer ${adminToken}`)
      ).status,
    ).toBe(204);

    expect(
      (
        await request(app.getHttpServer())
          .delete(`/master-data/nominal-classes/${classId}`)
          .set('Authorization', `Bearer ${adminToken}`)
      ).status,
    ).toBe(204);

    const courseRes = await request(app.getHttpServer())
      .post('/master-data/courses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: `CTDL-${Date.now()}`, name: 'CTDL&GT', status: 'active' });
    expect(courseRes.status).toBe(201);
    expect(
      (
        await request(app.getHttpServer())
          .delete(`/master-data/courses/${courseRes.body.id}`)
          .set('Authorization', `Bearer ${adminToken}`)
      ).status,
    ).toBe(204);
  });

  it('student detail includes enrolled course sections', async () => {
    const stamp = Date.now();
    const classRes = await request(app.getHttpServer())
      .post('/master-data/nominal-classes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: `NC-DET-${stamp}`,
        name: 'Detail class',
        cohortYear: 2022,
        status: 'active',
      });
    expect(classRes.status).toBe(201);
    const nominalClassId = classRes.body.id as string;

    const mssv = `D22${stamp.toString().slice(-8)}`;
    const stuRes = await request(app.getHttpServer())
      .post('/master-data/students')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        mssv,
        fullName: 'Tran Thi B',
        nominalClassId,
        status: 'active',
      });
    expect(stuRes.status).toBe(201);
    const studentId = stuRes.body.id as string;

    const [year] = await dataSource.query(
      `INSERT INTO examcollect.academic_year (code, name, start_date, end_date, status)
       VALUES ($1, 'Năm test', '2026-09-01', '2027-08-31', 'active') RETURNING id`,
      [`AY-DET-${stamp}`],
    );
    const [sem] = await dataSource.query(
      `INSERT INTO examcollect.semester (academic_year_id, code, name, start_date, end_date, status)
       VALUES ($1, 'HK1', 'Học kỳ 1', '2026-09-01', '2027-01-31', 'active') RETURNING id`,
      [year.id],
    );
    const courseCode = `DET${stamp.toString().slice(-8)}`;
    const [course] = await dataSource.query(
      `INSERT INTO examcollect.course (code, name, status)
       VALUES ($1, 'Môn test', 'active') RETURNING id`,
      [courseCode],
    );

    const section = await request(app.getHttpServer())
      .post('/admin/course-sections')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ courseId: course.id, semesterId: sem.id });
    expect(section.status).toBe(201);

    await request(app.getHttpServer())
      .post(`/admin/course-sections/${section.body.id}/roster/students`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ studentId })
      .expect(201);

    const detail = await request(app.getHttpServer())
      .get(`/master-data/students/${studentId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(detail.body.nominalClass).toMatchObject({
      id: nominalClassId,
      code: `NC-DET-${stamp}`,
      name: 'Detail class',
    });
    expect(detail.body.courseSections).toEqual([
      expect.objectContaining({
        id: section.body.id,
        name: `${courseCode}001`,
        courseName: 'Môn test',
        semesterName: 'Học kỳ 1',
      }),
    ]);
  });

  it('filters nominal classes by cohortYear', async () => {
    const stamp = Date.now();
    const c21 = await request(app.getHttpServer())
      .post('/master-data/nominal-classes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: `NC21-${stamp}`,
        name: 'Cohort 21',
        cohortYear: 2021,
        status: 'active',
      });
    expect(c21.status).toBe(201);
    const c22 = await request(app.getHttpServer())
      .post('/master-data/nominal-classes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: `NC22-${stamp}`,
        name: 'Cohort 22',
        cohortYear: 2022,
        status: 'active',
      });
    expect(c22.status).toBe(201);

    const hit = await request(app.getHttpServer())
      .get('/master-data/nominal-classes?cohortYear=2021')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(hit.status).toBe(200);
    expect(hit.body.items.some((c: { id: string }) => c.id === c21.body.id)).toBe(true);
    expect(hit.body.items.some((c: { id: string }) => c.id === c22.body.id)).toBe(false);
  });
});

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

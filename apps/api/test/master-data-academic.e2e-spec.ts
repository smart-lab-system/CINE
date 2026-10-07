import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount } from './helpers/create-account';

describe('Master data — academic year & semester (e2e)', () => {
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

    const adminEmail = `md_acad_admin_${stamp}@example.com`;
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

    const teacherEmail = `md_acad_teacher_${stamp}@example.com`;
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

  it('rejects teacher create', async () => {
    const res = await request(app.getHttpServer())
      .post('/master-data/academic-years')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        code: `Y-T-${Date.now()}`,
        name: 'Should fail',
        startDate: '2026-09-01',
        endDate: '2027-08-31',
        status: 'planned',
      });
    expect(res.status).toBe(403);
  });

  it('creates year + semester; duplicate year code 409; delete year with child 409', async () => {
    const code = `Y-${Date.now()}`;
    const yearRes = await request(app.getHttpServer())
      .post('/master-data/academic-years')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code,
        name: `Năm ${code}`,
        startDate: '2026-09-01',
        endDate: '2027-08-31',
        status: 'active',
      });
    expect(yearRes.status).toBe(201);
    const yearId = yearRes.body.id as string;

    const dup = await request(app.getHttpServer())
      .post('/master-data/academic-years')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code,
        name: 'Dup',
        startDate: '2026-09-01',
        endDate: '2027-08-31',
        status: 'planned',
      });
    expect(dup.status).toBe(409);

    const semRes = await request(app.getHttpServer())
      .post('/master-data/semesters')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        academicYearId: yearId,
        code: 'HK1',
        name: 'Học kỳ 1',
        startDate: '2026-09-01',
        endDate: '2027-01-15',
        status: 'active',
      });
    expect(semRes.status).toBe(201);
    const semesterId = semRes.body.id as string;

    const delYearBlocked = await request(app.getHttpServer())
      .delete(`/master-data/academic-years/${yearId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(delYearBlocked.status).toBe(409);

    expect(
      (
        await request(app.getHttpServer())
          .delete(`/master-data/semesters/${semesterId}`)
          .set('Authorization', `Bearer ${adminToken}`)
      ).status,
    ).toBe(204);

    expect(
      (
        await request(app.getHttpServer())
          .delete(`/master-data/academic-years/${yearId}`)
          .set('Authorization', `Bearer ${adminToken}`)
      ).status,
    ).toBe(204);
  });
});

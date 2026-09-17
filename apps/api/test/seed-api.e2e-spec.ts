process.env.SEED_API_ENABLED = 'true';

import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { SeedModule } from '../src/seed/seed.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount } from './helpers/create-account';
import { SeedErrorCode } from '../src/seed/seed.types';

/**
 * Seed API enabled. SeedModule is imported explicitly so routes register even
 * if AppModule was first loaded in this worker with the flag off (e.g. after
 * seed-api-disabled.e2e-spec.ts). SEED_API_ENABLED is set for documentation
 * and for AppModule when this file loads first.
 */
describe('Seed API (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let adminToken: string;
  const stamp = Date.now();

  beforeAll(async () => {
    process.env.SEED_API_ENABLED = 'true';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, SeedModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();

    dataSource = app.get(DataSource);

    const adminEmail = `seed_admin_${stamp}@example.com`;
    await createTestAccount(dataSource, {
      email: adminEmail,
      password: 'Demo123456!',
      role: 'admin',
    });
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: adminEmail, password: 'Demo123456!' });
    adminToken = login.body.accessToken;
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('POST /seed/bootstrap-admin', () => {
    it('returns 409 BOOTSTRAP_NOT_AVAILABLE when accounts already exist', async () => {
      const response = await request(app.getHttpServer())
        .post('/seed/bootstrap-admin')
        .send({
          name: 'Should Fail',
          email: `seed_bootstrap_fail_${stamp}@example.com`,
          password: 'Demo123456!',
        });

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({
        code: SeedErrorCode.BOOTSTRAP_NOT_AVAILABLE,
      });
      expect(response.body).not.toHaveProperty('password');
    });
  });

  describe('POST /admin/seed/accounts', () => {
    const teacherEmail = `seed_teacher_${stamp}@example.com`;
    const initialPassword = 'Demo123456!';
    let teacherId: string;

    it('rejects non-admin JWT with 403', async () => {
      const teacherOnly = `seed_teacher_only_${stamp}@example.com`;
      await createTestAccount(dataSource, {
        email: teacherOnly,
        password: initialPassword,
        role: 'teacher',
      });
      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: teacherOnly, password: initialPassword });

      const response = await request(app.getHttpServer())
        .post('/admin/seed/accounts')
        .set('Authorization', `Bearer ${login.body.accessToken}`)
        .send({
          name: 'Nope',
          email: `seed_blocked_${stamp}@example.com`,
          password: initialPassword,
          role: 'teacher',
        });

      expect(response.status).toBe(403);
    });

    it('creates a teacher then returns the same id on re-ensure', async () => {
      const first = await request(app.getHttpServer())
        .post('/admin/seed/accounts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Demo Teacher',
          email: teacherEmail,
          password: initialPassword,
          role: 'teacher',
        });

      expect(first.status).toBe(201);
      expect(first.body.created).toBe(true);
      expect(first.body.id).toBeDefined();
      expect(first.body).not.toHaveProperty('password');
      teacherId = first.body.id;

      const second = await request(app.getHttpServer())
        .post('/admin/seed/accounts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Demo Teacher',
          email: teacherEmail,
          password: 'DifferentPassword1!',
          role: 'teacher',
        });

      expect(second.status).toBe(200);
      expect(second.body.created).toBe(false);
      expect(second.body.id).toBe(teacherId);

      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: teacherEmail, password: initialPassword });
      expect(login.status).toBe(200);
      expect(login.body.accessToken).toBeDefined();
    });

    it('updates password only when updatePassword is true', async () => {
      const newPassword = 'NewDemoPassword1!';

      const withoutFlag = await request(app.getHttpServer())
        .post('/admin/seed/accounts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Demo Teacher',
          email: teacherEmail,
          password: newPassword,
          role: 'teacher',
        });
      expect(withoutFlag.status).toBe(200);

      const stillOld = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: teacherEmail, password: initialPassword });
      expect(stillOld.status).toBe(200);

      const withFlag = await request(app.getHttpServer())
        .post('/admin/seed/accounts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Demo Teacher',
          email: teacherEmail,
          password: newPassword,
          role: 'teacher',
          updatePassword: true,
        });
      expect(withFlag.status).toBe(200);
      expect(withFlag.body.id).toBe(teacherId);

      const withNew = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: teacherEmail, password: newPassword });
      expect(withNew.status).toBe(200);

      const withOld = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: teacherEmail, password: initialPassword });
      expect(withOld.status).toBe(401);
    });
  });

  describe('POST /admin/seed/semesters and rooms', () => {
    it('ensures semester and room idempotently', async () => {
      const semesterName = `Seed HK ${stamp}`;
      const roomName = `Seed Room ${stamp}`;

      const sem1 = await request(app.getHttpServer())
        .post('/admin/seed/semesters')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: semesterName,
          startDate: '2026-09-01',
          endDate: '2027-01-15',
        });
      expect(sem1.status).toBe(201);
      expect(sem1.body.created).toBe(true);

      const sem2 = await request(app.getHttpServer())
        .post('/admin/seed/semesters')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: semesterName,
          startDate: '2026-09-01',
          endDate: '2027-01-15',
        });
      expect(sem2.status).toBe(200);
      expect(sem2.body.created).toBe(false);
      expect(sem2.body.id).toBe(sem1.body.id);

      const room1 = await request(app.getHttpServer())
        .post('/admin/seed/rooms')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: roomName, capacity: 40 });
      expect(room1.status).toBe(201);
      expect(room1.body.created).toBe(true);

      const room2 = await request(app.getHttpServer())
        .post('/admin/seed/rooms')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: roomName, capacity: 40 });
      expect(room2.status).toBe(200);
      expect(room2.body.created).toBe(false);
      expect(room2.body.id).toBe(room1.body.id);
    });
  });
});

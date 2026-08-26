import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount } from './helpers/create-account';

describe('Accounts (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let adminToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    // Mirrors main.ts — without it a Postgres trigger/constraint error
    // surfaces as a bare 500 instead of the mapped 409/400 a real client
    // sees.
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();

    dataSource = app.get(DataSource);
    const adminEmail = `accounts_admin_${Date.now()}@example.com`;
    await createTestAccount(dataSource, {
      email: adminEmail,
      password: 'correct-horse-battery',
      role: 'admin',
    });

    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: adminEmail, password: 'correct-horse-battery' });
    adminToken = loginResponse.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  let createdAccountId: string;

  it('rejects account creation without a token', async () => {
    const response = await request(app.getHttpServer())
      .post('/accounts')
      .send({
        name: 'Nobody',
        email: 'nobody@example.com',
        password: 'irrelevant-password',
        role: 'teacher',
      });

    expect(response.status).toBe(401);
  });

  it('rejects account creation for an authenticated account without the admin role', async () => {
    const teacherEmail = `accounts_teacher_${Date.now()}@example.com`;
    await createTestAccount(dataSource, {
      email: teacherEmail,
      password: 'correct-horse-battery',
      role: 'teacher',
    });

    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: teacherEmail, password: 'correct-horse-battery' });
    const teacherToken = loginResponse.body.accessToken;

    const response = await request(app.getHttpServer())
      .post('/accounts')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        name: 'Should Not Be Created',
        email: `should_not_be_created_${Date.now()}@example.com`,
        password: 'correct-horse-battery',
        role: 'teacher',
      });

    expect(response.status).toBe(403);
  });

  it('creates an account as admin', async () => {
    const response = await request(app.getHttpServer())
      .post('/accounts')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Managed User',
        email: `managed_${Date.now()}@example.com`,
        password: 'correct-horse-battery',
        role: 'teacher',
      });

    expect(response.status).toBe(201);
    expect(response.body.id).toBeDefined();
    createdAccountId = response.body.id;
  });

  it('searches accounts', async () => {
    const response = await request(app.getHttpServer())
      .get('/accounts?search=Managed&page=1&pageSize=20')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.total).toBeGreaterThanOrEqual(1);
    expect(
      response.body.items.some((item: any) => item.id === createdAccountId),
    ).toBe(true);
  });

  it('updates an account', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/accounts/${createdAccountId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Managed User (Updated)' });

    expect(response.status).toBe(200);
    expect(response.body.name).toBe('Managed User (Updated)');
  });

  it('deletes an account with nothing referencing it', async () => {
    const response = await request(app.getHttpServer())
      .delete(`/accounts/${createdAccountId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(204);

    // Hard delete — there's no deleted_at column any more, so "gone" means
    // the row genuinely doesn't exist.
    const rows = await dataSource.query(
      `SELECT id FROM examcollect.account WHERE id = $1`,
      [createdAccountId],
    );
    expect(rows).toHaveLength(0);
  });

  it('rejects deleting an account that is still a home teacher on an active enrollment', async () => {
    // Real failure injection for the FK that replaced guard_master_soft_delete:
    // enrollment.home_teacher_id -> account(id) ON DELETE RESTRICT. Giving
    // the account an enrollment makes the delete fail for a real referential-
    // integrity reason, not a mocked one.
    const createResponse = await request(app.getHttpServer())
      .post('/accounts')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Referenced Teacher',
        email: `referenced_${Date.now()}@example.com`,
        password: 'correct-horse-battery',
        role: 'teacher',
      });
    expect(createResponse.status).toBe(201);
    const accountId: string = createResponse.body.id;

    const [{ id: semesterId }] = await dataSource.query(
      `INSERT INTO examcollect.semester (name, start_date, end_date)
       VALUES ($1, $2, $3) RETURNING id`,
      ['Referenced Test Semester', '2026-01-01', '2026-06-01'],
    );
    const [{ id: courseId }] = await dataSource.query(
      `INSERT INTO examcollect.course (code, name, semester_id)
       VALUES ($1, $2, $3) RETURNING id`,
      [`RF${Date.now()}`.slice(0, 32), 'Referenced Test Course', semesterId],
    );
    const [{ id: classId }] = await dataSource.query(
      `INSERT INTO examcollect.class (course_id, name, teacher_id)
       VALUES ($1, $2, $3) RETURNING id`,
      [courseId, 'Referenced Test Class', accountId],
    );
    await dataSource.query(
      `INSERT INTO examcollect.enrollment
         (student_mssv, course_id, home_class_id, home_teacher_id)
       VALUES ($1, $2, $3, $4)`,
      [`SV${Date.now()}`.slice(0, 20), courseId, classId, accountId],
    );

    const deleteResponse = await request(app.getHttpServer())
      .delete(`/accounts/${accountId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    // PostgresExceptionFilter maps the FK RESTRICT violation (23503) to 409.
    expect(deleteResponse.status).toBe(409);

    const rows = await dataSource.query(
      `SELECT id FROM examcollect.account WHERE id = $1`,
      [accountId],
    );
    expect(rows).toHaveLength(1);
  });
});

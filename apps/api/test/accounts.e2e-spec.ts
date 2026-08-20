import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';

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
    await app.init();

    dataSource = app.get(DataSource);
    const adminUsername = `accounts_admin_${Date.now()}`;

    await request(app.getHttpServer()).post('/auth/register').send({
      username: adminUsername,
      password: 'correct-horse-battery',
      displayName: 'Accounts Test Admin',
    });

    // Grant the admin role directly — there's no self-serve "become admin"
    // endpoint, and there shouldn't be.
    //
    // Raw queries here are schema-qualified against `lab_management`
    // (matching auth.e2e-spec.ts): the DataSource's `schema` option only
    // qualifies TypeORM-generated SQL for entity repositories, it does not
    // set `search_path` on the underlying pg connection, so unqualified
    // raw SQL would resolve against `public` (where these tables don't
    // exist) and fail with "relation does not exist".
    const [{ id: userId }] = await dataSource.query(
      `SELECT id FROM lab_management.users WHERE username = $1`,
      [adminUsername],
    );
    const [{ id: roleId }] = await dataSource.query(
      `SELECT id FROM lab_management.roles WHERE code = 'admin'`,
    );
    await dataSource.query(
      `INSERT INTO lab_management.user_roles (user_id, role_id) VALUES ($1, $2)`,
      [userId, roleId],
    );

    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: adminUsername, password: 'correct-horse-battery' });
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
        username: 'nobody',
        password: 'irrelevant-password',
        displayName: 'Nobody',
        roleCodes: ['student'],
      });

    expect(response.status).toBe(401);
  });

  it('rejects account creation for an authenticated user without the admin role', async () => {
    const nonAdminUsername = `accounts_student_${Date.now()}`;
    await request(app.getHttpServer()).post('/auth/register').send({
      username: nonAdminUsername,
      password: 'correct-horse-battery',
      displayName: 'Accounts Test Student',
    });

    const [{ id: userId }] = await dataSource.query(
      `SELECT id FROM lab_management.users WHERE username = $1`,
      [nonAdminUsername],
    );
    const [{ id: roleId }] = await dataSource.query(
      `SELECT id FROM lab_management.roles WHERE code = 'student'`,
    );
    await dataSource.query(
      `INSERT INTO lab_management.user_roles (user_id, role_id) VALUES ($1, $2)`,
      [userId, roleId],
    );

    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: nonAdminUsername, password: 'correct-horse-battery' });
    const studentToken = loginResponse.body.accessToken;

    const response = await request(app.getHttpServer())
      .post('/accounts')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        username: `should_not_be_created_${Date.now()}`,
        password: 'correct-horse-battery',
        displayName: 'Should Not Be Created',
        roleCodes: ['student'],
      });

    expect(response.status).toBe(403);
  });

  it('creates an account as admin', async () => {
    const response = await request(app.getHttpServer())
      .post('/accounts')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        username: `managed_${Date.now()}`,
        password: 'correct-horse-battery',
        displayName: 'Managed User',
        roleCodes: ['lecturer'],
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
      .send({ displayName: 'Managed User (Updated)' });

    expect(response.status).toBe(200);
    expect(response.body.displayName).toBe('Managed User (Updated)');
  });

  it('deletes an account with no active role assignments left standing', async () => {
    const response = await request(app.getHttpServer())
      .delete(`/accounts/${createdAccountId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(204);

    const [deletedRow] = await dataSource.query(
      `SELECT deleted_at FROM lab_management.users WHERE id = $1`,
      [createdAccountId],
    );
    expect(deletedRow.deleted_at).not.toBeNull();

    const activeRoleAssignments = await dataSource.query(
      `SELECT id FROM lab_management.user_roles
       WHERE user_id = $1 AND deleted_at IS NULL`,
      [createdAccountId],
    );
    expect(activeRoleAssignments).toHaveLength(0);
  });

  it('rejects soft-deleting a user directly at the DB level while an active role assignment still references it', async () => {
    // This is the DB-level guard AccountsService#remove() relies on: it
    // always clears user_roles before soft-deleting the user. Here we
    // bypass the service and hit the trigger directly to prove the guard
    // itself — not just the service's ordering — is what's protecting us.
    const createResponse = await request(app.getHttpServer())
      .post('/accounts')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        username: `guarded_${Date.now()}`,
        password: 'correct-horse-battery',
        displayName: 'Guarded User',
        roleCodes: ['student'],
      });
    expect(createResponse.status).toBe(201);
    const guardedAccountId: string = createResponse.body.id;

    let caughtError: any;
    try {
      await dataSource.query(
        `UPDATE lab_management.users SET deleted_at = now() WHERE id = $1`,
        [guardedAccountId],
      );
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toBeDefined();
    // Postgres' guard_master_soft_delete() trigger raises with
    // USING ERRCODE = 'foreign_key_violation' (23503) when an active
    // user_roles row still references the user being soft-deleted.
    expect(caughtError.code).toBe('23503');

    const [row] = await dataSource.query(
      `SELECT deleted_at FROM lab_management.users WHERE id = $1`,
      [guardedAccountId],
    );
    expect(row.deleted_at).toBeNull();
  });
});

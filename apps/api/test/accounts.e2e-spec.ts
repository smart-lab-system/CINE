import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';

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

  it('returns the linked lecturer profile on account search', async () => {
    const employeeCode = `GV${Date.now()}`.slice(0, 6);
    const createResponse = await request(app.getHttpServer())
      .post('/accounts')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        username: employeeCode,
        password: employeeCode,
        displayName: 'Linked Lecturer',
        roleCodes: ['lecturer'],
      });
    expect(createResponse.status).toBe(201);
    const accountId: string = createResponse.body.id;

    await dataSource.query(
      `INSERT INTO lab_management.lecturers (user_id, employee_code, full_name)
       VALUES ($1, $2, $3)`,
      [accountId, employeeCode, 'Linked Lecturer'],
    );

    const response = await request(app.getHttpServer())
      .get(`/accounts?search=${employeeCode}&page=1&pageSize=20`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    const item = response.body.items.find((row: any) => row.id === accountId);
    expect(item).toBeDefined();
    expect(item.linkedProfile).toEqual({
      type: 'lecturer',
      code: employeeCode,
      fullName: 'Linked Lecturer',
    });
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

  it('rolls back the whole delete when soft-deleting the user fails mid-sequence', async () => {
    // Real failure injection for AccountsService#remove()'s transaction:
    // guard_master_soft_delete() also guards `users` against an active
    // `students` row, not just `user_roles`. Giving the account a student
    // profile makes step 2 (soft-delete the user) raise *after* step 1
    // (clear the role assignments) already succeeded — precisely the
    // mid-sequence failure the transaction has to undo.
    const createResponse = await request(app.getHttpServer())
      .post('/accounts')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        username: `rollback_${Date.now()}`,
        password: 'correct-horse-battery',
        displayName: 'Rollback User',
        roleCodes: ['student'],
      });
    expect(createResponse.status).toBe(201);
    const accountId: string = createResponse.body.id;

    await dataSource.query(
      `INSERT INTO lab_management.students (user_id, student_code, full_name)
       VALUES ($1, $2, $3)`,
      [accountId, `SV${Date.now()}`.slice(0, 32), 'Rollback User'],
    );

    const deleteResponse = await request(app.getHttpServer())
      .delete(`/accounts/${accountId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    // PostgresExceptionFilter maps the trigger's 23503 to a 409.
    expect(deleteResponse.status).toBe(409);

    // The account must be exactly as it was: still active, still holding
    // its role. Before the transaction wrapping, the role assignment would
    // have been left soft-deleted here.
    const [userRow] = await dataSource.query(
      `SELECT deleted_at FROM lab_management.users WHERE id = $1`,
      [accountId],
    );
    expect(userRow.deleted_at).toBeNull();

    const activeRoleAssignments = await dataSource.query(
      `SELECT id FROM lab_management.user_roles
       WHERE user_id = $1 AND deleted_at IS NULL`,
      [accountId],
    );
    expect(activeRoleAssignments).toHaveLength(1);
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

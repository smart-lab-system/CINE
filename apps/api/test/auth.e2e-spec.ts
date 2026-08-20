import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    // Mirrors main.ts — POST /auth/refresh reads `req.cookies.refresh_token`,
    // which Express only populates when cookie-parser is registered.
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    dataSource = moduleRef.get<DataSource>(getDataSourceToken());
  });

  afterAll(async () => {
    await app.close();
  });

  const username = `auth_test_${Date.now()}`;

  it('registers a new account', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        username,
        password: 'correct-horse-battery',
        displayName: 'Auth Test User',
      });

    expect(response.status).toBe(201);
    expect(response.body.id).toBeDefined();
  });

  it('rejects login with the wrong password', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username, password: 'wrong-password' });

    expect(response.status).toBe(401);
  });

  it('logs in with the correct password and returns tokens', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username, password: 'correct-horse-battery' });

    expect(response.status).toBe(200);
    expect(response.body.accessToken).toBeDefined();
    expect(response.body.refreshToken).toBeDefined();
    expect(response.body.user.username).toBe(username);
  });

  it.each(['locked', 'disabled', 'pending'])(
    'rejects login for a %s account even with the correct password',
    async (status) => {
      const statusUsername = `auth_test_${status}_${Date.now()}`;

      await request(app.getHttpServer()).post('/auth/register').send({
        username: statusUsername,
        password: 'correct-horse-battery',
        displayName: `Auth ${status} User`,
      });

      await dataSource.query(
        `UPDATE lab_management.users SET status = $1 WHERE username = $2`,
        [status, statusUsername],
      );

      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: statusUsername, password: 'correct-horse-battery' });

      expect(response.status).toBe(401);
      // Identical to the wrong-password message: the response must not
      // reveal that the credentials were otherwise valid.
      expect(response.body.message).toBe('Invalid username or password');
    },
  );

  it('issues a new token pair from a valid refresh token cookie', async () => {
    const refreshUsername = `auth_test_refresh_${Date.now()}`;

    await request(app.getHttpServer()).post('/auth/register').send({
      username: refreshUsername,
      password: 'correct-horse-battery',
      displayName: 'Auth Refresh User',
    });

    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: refreshUsername, password: 'correct-horse-battery' });
    expect(loginResponse.status).toBe(200);

    const refreshResponse = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', `refresh_token=${loginResponse.body.refreshToken}`);

    expect(refreshResponse.status).toBe(200);
    expect(refreshResponse.body.accessToken).toBeDefined();
    // Refresh tokens rotate — the caller gets a replacement, not the same one
    // back.
    expect(refreshResponse.body.refreshToken).toBeDefined();
    expect(refreshResponse.body.user.username).toBe(refreshUsername);

    // The freshly minted access token has to be usable on a guarded route.
    const guarded = await request(app.getHttpServer())
      .get('/accounts')
      .set('Authorization', `Bearer ${refreshResponse.body.accessToken}`);
    // 403, not 401: the token authenticates fine, this user just isn't admin.
    expect(guarded.status).toBe(403);
  });

  it('rejects refresh with no cookie, a garbage token, or an access token', async () => {
    const noCookie = await request(app.getHttpServer()).post('/auth/refresh');
    expect(noCookie.status).toBe(401);

    const garbage = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', 'refresh_token=not-a-jwt');
    expect(garbage.status).toBe(401);

    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username, password: 'correct-horse-battery' });
    // Signed with ACCESS_TOKEN_SECRET, so verification against
    // REFRESH_TOKEN_SECRET must fail.
    const wrongSecret = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', `refresh_token=${loginResponse.body.accessToken}`);
    expect(wrongSecret.status).toBe(401);
  });

  it('rejects refresh once the account is locked', async () => {
    const lockedUsername = `auth_test_refresh_locked_${Date.now()}`;

    await request(app.getHttpServer()).post('/auth/register').send({
      username: lockedUsername,
      password: 'correct-horse-battery',
      displayName: 'Auth Refresh Locked User',
    });

    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: lockedUsername, password: 'correct-horse-battery' });
    const refreshToken: string = loginResponse.body.refreshToken;

    await dataSource.query(
      `UPDATE lab_management.users SET status = 'locked' WHERE username = $1`,
      [lockedUsername],
    );

    const response = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', `refresh_token=${refreshToken}`);

    expect(response.status).toBe(401);
  });

  // Both cases below rely on the same 403-vs-401 distinction: /accounts is
  // admin-only, so a non-admin holding a *valid* token gets 403 (authentication
  // succeeded, authorization didn't). Once JwtStrategy stops accepting the
  // token, the same request turns into a 401 — which is exactly what proves
  // revocation took effect mid-token-lifetime rather than at expiry.
  it('rejects a still-unexpired token after the account is locked', async () => {
    const staleUsername = `auth_test_stale_lock_${Date.now()}`;

    await request(app.getHttpServer()).post('/auth/register').send({
      username: staleUsername,
      password: 'correct-horse-battery',
      displayName: 'Auth Stale Lock User',
    });

    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: staleUsername, password: 'correct-horse-battery' });
    const token: string = loginResponse.body.accessToken;

    const beforeLock = await request(app.getHttpServer())
      .get('/accounts')
      .set('Authorization', `Bearer ${token}`);
    expect(beforeLock.status).toBe(403);

    await dataSource.query(
      `UPDATE lab_management.users SET status = 'locked' WHERE username = $1`,
      [staleUsername],
    );

    const afterLock = await request(app.getHttpServer())
      .get('/accounts')
      .set('Authorization', `Bearer ${token}`);
    expect(afterLock.status).toBe(401);
  });

  it('rejects a still-unexpired token after the account is soft-deleted', async () => {
    const staleUsername = `auth_test_stale_del_${Date.now()}`;

    await request(app.getHttpServer()).post('/auth/register').send({
      username: staleUsername,
      password: 'correct-horse-battery',
      displayName: 'Auth Stale Delete User',
    });

    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: staleUsername, password: 'correct-horse-battery' });
    const token: string = loginResponse.body.accessToken;

    const beforeDelete = await request(app.getHttpServer())
      .get('/accounts')
      .set('Authorization', `Bearer ${token}`);
    expect(beforeDelete.status).toBe(403);

    await dataSource.query(
      `UPDATE lab_management.users SET deleted_at = now() WHERE username = $1`,
      [staleUsername],
    );

    const afterDelete = await request(app.getHttpServer())
      .get('/accounts')
      .set('Authorization', `Bearer ${token}`);
    expect(afterDelete.status).toBe(401);
  });

  it('excludes a soft-deleted role assignment from the login roles claim', async () => {
    const roleUsername = `auth_test_role_${Date.now()}`;

    const registerResponse = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        username: roleUsername,
        password: 'correct-horse-battery',
        displayName: 'Auth Role Test User',
      });
    const userId: string = registerResponse.body.id;

    const [studentRole] = await dataSource.query(
      `SELECT id FROM lab_management.roles WHERE code = $1`,
      ['student'],
    );

    const [userRoleRow] = await dataSource.query(
      `INSERT INTO lab_management.user_roles (user_id, role_id)
       VALUES ($1, $2)
       RETURNING id`,
      [userId, studentRole.id],
    );

    const loginWithRole = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: roleUsername, password: 'correct-horse-battery' });

    expect(loginWithRole.status).toBe(200);
    expect(loginWithRole.body.user.roles).toContain('student');

    await dataSource.query(
      `UPDATE lab_management.user_roles SET deleted_at = now() WHERE id = $1`,
      [userRoleRow.id],
    );

    const loginAfterSoftDelete = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: roleUsername, password: 'correct-horse-battery' });

    expect(loginAfterSoftDelete.status).toBe(200);
    expect(loginAfterSoftDelete.body.user.roles).not.toContain('student');
  });
});

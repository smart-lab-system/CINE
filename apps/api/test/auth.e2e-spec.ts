import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { createTestAccount } from './helpers/create-account';

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

  const email = `auth_test_${Date.now()}@example.com`;
  const password = 'correct-horse-battery';

  beforeAll(async () => {
    await createTestAccount(dataSource, { email, password, role: 'teacher' });
  });

  it('rejects login with the wrong password', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'wrong-password' });

    expect(response.status).toBe(401);
  });

  it('logs in with the correct password and returns tokens', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password });

    expect(response.status).toBe(200);
    expect(response.body.accessToken).toBeDefined();
    expect(response.body.refreshToken).toBeDefined();
    expect(response.body.account.email).toBe(email);
    expect(response.body.account.role).toBe('teacher');
  });

  it('issues a new token pair from a valid refresh token cookie', async () => {
    const refreshEmail = `auth_test_refresh_${Date.now()}@example.com`;
    await createTestAccount(dataSource, {
      email: refreshEmail,
      password,
      role: 'teacher',
    });

    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: refreshEmail, password });
    expect(loginResponse.status).toBe(200);

    const refreshResponse = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', `refresh_token=${loginResponse.body.refreshToken}`);

    expect(refreshResponse.status).toBe(200);
    expect(refreshResponse.body.accessToken).toBeDefined();
    // Refresh tokens rotate — the caller gets a replacement, not the same one
    // back.
    expect(refreshResponse.body.refreshToken).toBeDefined();
    expect(refreshResponse.body.account.email).toBe(refreshEmail);

    // The freshly minted access token has to be usable on a guarded route.
    const guarded = await request(app.getHttpServer())
      .get('/accounts')
      .set('Authorization', `Bearer ${refreshResponse.body.accessToken}`);
    // 403, not 401: the token authenticates fine, this account just isn't admin.
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
      .send({ email, password });
    // Signed with ACCESS_TOKEN_SECRET, so verification against
    // REFRESH_TOKEN_SECRET must fail.
    const wrongSecret = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', `refresh_token=${loginResponse.body.accessToken}`);
    expect(wrongSecret.status).toBe(401);
  });

  it('rejects refresh once the account has been deleted', async () => {
    const deletedEmail = `auth_test_refresh_deleted_${Date.now()}@example.com`;
    const accountId = await createTestAccount(dataSource, {
      email: deletedEmail,
      password,
      role: 'teacher',
    });

    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: deletedEmail, password });
    const refreshToken: string = loginResponse.body.refreshToken;

    // There's no status/soft-delete column any more — a hard delete is the
    // only revocation mechanism.
    await dataSource.query(`DELETE FROM examcollect.account WHERE id = $1`, [
      accountId,
    ]);

    const response = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', `refresh_token=${refreshToken}`);

    expect(response.status).toBe(401);
  });

  // Relies on the 403-vs-401 distinction: /accounts is admin-only, so a
  // non-admin holding a *valid* token gets 403 (authentication succeeded,
  // authorization didn't). Once JwtStrategy stops accepting the token
  // entirely, the same request turns into a 401 — which is exactly what
  // proves revocation took effect mid-token-lifetime rather than at expiry.
  it('rejects a still-unexpired token once the account has been deleted', async () => {
    const staleEmail = `auth_test_stale_del_${Date.now()}@example.com`;
    const accountId = await createTestAccount(dataSource, {
      email: staleEmail,
      password,
      role: 'teacher',
    });

    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: staleEmail, password });
    const token: string = loginResponse.body.accessToken;

    const beforeDelete = await request(app.getHttpServer())
      .get('/accounts')
      .set('Authorization', `Bearer ${token}`);
    expect(beforeDelete.status).toBe(403);

    await dataSource.query(`DELETE FROM examcollect.account WHERE id = $1`, [
      accountId,
    ]);

    const afterDelete = await request(app.getHttpServer())
      .get('/accounts')
      .set('Authorization', `Bearer ${token}`);
    expect(afterDelete.status).toBe(401);
  });

  it('reflects a role change in the next refresh without a re-login', async () => {
    const roleEmail = `auth_test_role_${Date.now()}@example.com`;
    const accountId = await createTestAccount(dataSource, {
      email: roleEmail,
      password,
      role: 'teacher',
    });

    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: roleEmail, password });
    expect(loginResponse.body.account.role).toBe('teacher');
    const refreshToken: string = loginResponse.body.refreshToken;

    await dataSource.query(`UPDATE examcollect.account SET role = 'admin' WHERE id = $1`, [
      accountId,
    ]);

    const refreshResponse = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', `refresh_token=${refreshToken}`);

    expect(refreshResponse.status).toBe(200);
    expect(refreshResponse.body.account.role).toBe('admin');

    // The re-issued access token carries the new role too, not just the
    // response body — proven by it now clearing the admin-only guard.
    const guarded = await request(app.getHttpServer())
      .get('/accounts')
      .set('Authorization', `Bearer ${refreshResponse.body.accessToken}`);
    expect(guarded.status).toBe(200);
  });
});
